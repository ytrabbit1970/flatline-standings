#!/usr/bin/env python3
"""Pull Flatline Faithful results from the Poker Mavens API and build docs/data/standings.json.

The API password comes from the macOS Keychain (service "pokermavens-api") or the PM_API_PW env var.
Only Poker Mavens handles are written out; real names never leave this machine.

Usage: python3 update.py
"""
import json
import math
import os
import re
import subprocess
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://flatline.wtf/api"
TOURNAMENT = "Flatline Faithful"
SEASON = {"name": "Season 16", "start": "2026-08-06", "end": None}
OUT = Path(__file__).parent / "docs" / "data" / "standings.json"
CACHE = Path(__file__).parent / "cache"


def api_password():
    if os.environ.get("PM_API_PW"):
        return os.environ["PM_API_PW"]
    return subprocess.run(
        ["security", "find-generic-password", "-s", "pokermavens-api", "-w"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()


def api(password, **params):
    body = urllib.parse.urlencode({"Password": password, "JSON": "Yes", **params}).encode()
    with urllib.request.urlopen(API_URL, body, timeout=30) as resp:
        data = json.load(resp)
    if data.get("Result") != "Ok":
        raise RuntimeError(f"API error for {params}: {data.get('Error', data)}")
    return data


def fetch_results(password, date):
    """Results files are immutable once written, so cache them locally."""
    cached = CACHE / f"{date}.json"
    if cached.exists():
        return json.loads(cached.read_text())
    lines = api(password, Command="TournamentsResults", Date=date, Name=TOURNAMENT)["Data"]
    CACHE.mkdir(exist_ok=True)
    cached.write_text(json.dumps(lines))
    return lines


def money(s):
    """'24+1' -> 24.0 (the part that goes to the prize pool, before the house fee)."""
    return float(s.split("+")[0])


def correct(lines):
    """Same logic as the sheet's Tournament Results Corrector tab.

    Walk Place1..PlaceN, keep each player's first (best) finish, renumber 1..n.
    Extra entries count as re-entries; bounties are summed over every entry.
    """
    entries = []
    for line in lines:
        m = re.match(r"Place(\d+)=(.+?) \(([\d.]+)\+([\d.]+)\)", line)
        if m:
            entries.append((int(m[1]), m[2].strip(), float(m[3]), float(m[4])))
    entries.sort()
    results, by_key = [], {}
    for _, handle, winnings, bounty in entries:
        key = handle.lower()
        if key in by_key:
            by_key[key]["bounties"] += bounty
            by_key[key]["reentries"] += 1
        else:
            by_key[key] = {"place": len(results) + 1, "handle": handle, "winnings": winnings,
                           "bounties": bounty, "reentries": 0}
            results.append(by_key[key])
    return results


def points(place, paid_buyins, prize_pool):
    """The sheet's formula: SQRT(n/place) * (1+LOG(pool/n+0.25))^2 / (1+LOG(n+0.25))."""
    n = paid_buyins
    return math.sqrt(n / place) * (1 + math.log10(prize_pool / n + 0.25)) ** 2 / (1 + math.log10(n + 0.25))


def build_event(date, lines):
    info = dict(l.split("=", 1) for l in lines if "=" in l and not l.startswith("Place"))
    entrants = int(info["Entrants"])
    bounty = float(info.get("Bounty", 0))
    prize_pool = entrants * (money(info["BuyIn"]) - bounty)
    results = correct(lines)
    for r in results:
        r["points"] = round(points(r["place"], entrants, prize_pool), 3)
        r["winnings"] = round(r["winnings"], 2)
        r["bounties"] = round(r["bounties"], 2)
    return {
        "date": date,
        "number": int(info["Number"]),
        "entrants": entrants,
        "players": len(results),
        "buyIn": info["BuyIn"],
        "bounty": bounty,
        "prizePool": round(prize_pool, 2),
        "start": info.get("Start"),
        "stop": info.get("Stop"),
        "results": results,
    }


def standings(events):
    """Season totals per player, plus their rank after every week for the movement chart."""
    spellings = defaultdict(Counter)
    for e in events:
        for r in e["results"]:
            spellings[r["handle"].lower()][r["handle"]] += 1
    display = {k: c.most_common(1)[0][0] for k, c in spellings.items()}

    totals = defaultdict(lambda: {"points": 0.0, "played": 0, "wins": 0, "cashes": 0, "winnings": 0.0,
                                  "bounties": 0.0, "reentries": 0, "best": None, "finishes": []})
    rank_history = defaultdict(list)
    for e in events:
        for r in e["results"]:
            t = totals[r["handle"].lower()]
            t["points"] += r["points"]
            t["played"] += 1
            t["wins"] += r["place"] == 1
            t["cashes"] += r["winnings"] > 0
            t["winnings"] += r["winnings"]
            t["bounties"] += r["bounties"]
            t["reentries"] += r["reentries"]
            t["best"] = r["place"] if t["best"] is None else min(t["best"], r["place"])
        ranked = sorted(totals, key=lambda k: -totals[k]["points"])
        for i, k in enumerate(ranked, 1):
            rank_history[k].append(i)

    played_in = {k: {e["date"]: r for e in events for r in e["results"] if r["handle"].lower() == k} for k in totals}
    rows = []
    for k, t in totals.items():
        rows.append({
            "handle": display[k],
            "points": round(t["points"], 3),
            "avgPoints": round(t["points"] / t["played"], 3),
            "played": t["played"],
            "wins": t["wins"],
            "cashes": t["cashes"],
            "cashPct": round(t["cashes"] / t["played"], 3),
            "winnings": round(t["winnings"], 2),
            "bounties": round(t["bounties"], 2),
            "reentries": t["reentries"],
            "best": t["best"],
            # One entry per event: [place, points, cashed] or null if they didn't play.
            "weeks": [[r["place"], r["points"], r["winnings"] > 0] if (r := played_in[k].get(e["date"])) else None
                      for e in events],
            # Rank after each event, padded with null before their first event.
            "rankHistory": [None] * (len(events) - len(rank_history[k])) + rank_history[k],
        })
    rows.sort(key=lambda r: -r["points"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def main():
    password = api_password()
    listing = api(password, Command="TournamentsResults")
    dates = sorted(d for d, n in zip(listing["Date"], listing["Name"])
                   if n == TOURNAMENT and d >= SEASON["start"] and (not SEASON["end"] or d <= SEASON["end"]))
    events = [build_event(d, fetch_results(password, d)) for d in dates]
    data = {
        "season": SEASON["name"],
        "tournament": TOURNAMENT,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "events": events,
        "standings": standings(events),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    print(f"{SEASON['name']}: {len(events)} events, {len(data['standings'])} players -> {OUT}")
    leader = data["standings"][0]
    print(f"Leader: {leader['handle']} with {leader['points']:.2f} pts")


if __name__ == "__main__":
    main()
