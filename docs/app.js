const $ = (sel) => document.querySelector(sel);
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pts = (n) => n.toFixed(2);
const fmtDate = (d, opts = { month: "short", day: "numeric" }) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", opts);
const ordinal = (n) => n + ([11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let DATA;
let sortKey = "points";

// Past seasons come from the club spreadsheet, so some fields (dates, weekly cash, bounties) can be null.
const weekLabel = (e, i, opts) => (e.date ? fmtDate(e.date, opts) : `Week ${i + 1}`);
const hasBounties = () => DATA.standings[0].bounties != null;

fetch("data/seasons.json", { cache: "no-cache" })
  .then((r) => r.json())
  .catch(() => [{ name: "Current season", file: "standings.json" }])
  .then((seasons) => {
    const sel = $("#season-pick");
    sel.innerHTML = seasons.map((s) => `<option value="${esc(s.file)}">${esc(s.name)}</option>`).join("");
    // #s15 in the URL opens Season 15, so a past season can be linked directly.
    const fromHash = seasons.find((s) => "#s" + s.name.replace(/\D/g, "") === location.hash);
    if (fromHash) sel.value = fromHash.file;
    sel.addEventListener("change", () => {
      const s = seasons.find((x) => x.file === sel.value);
      history.replaceState(null, "", s === seasons[0] ? location.pathname : "#s" + s.name.replace(/\D/g, ""));
      loadSeason(sel.value);
    });
    loadSeason(sel.value);
  });

function loadSeason(file) {
  fetch("data/" + file, { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      if (!hasBounties() && sortKey === "bounties") sortKey = "points";
      document.querySelectorAll(".tabs button").forEach((b) => {
        b.hidden = b.dataset.sort === "bounties" && !hasBounties();
        b.setAttribute("aria-selected", b.dataset.sort === sortKey);
      });
      renderHeader();
      renderPodium();
      renderBoard();
      renderEventPicker();
      renderFinale();
    })
    .catch(() => ($("#season").textContent = "Couldn't load standings."));
}

function renderHeader() {
  const ev = DATA.events;
  const last = ev[ev.length - 1];
  $("#season").textContent = DATA.final
    ? `${ev.length} weeks · final standings`
    : `${ev.length} weeks played · last game ${fmtDate(last.date, { month: "long", day: "numeric" })}`;
  const entries = ev.reduce((s, e) => s + e.entrants, 0);
  const stats = [
    [ev.length, "Weeks"],
    [DATA.standings.length, "Players"],
    [entries, "Entries"],
  ];
  if (ev[0].prizePool != null) {
    const pool = ev.reduce((s, e) => s + e.prizePool + e.bounty * e.entrants, 0);
    const biggest = ev.flatMap((e) => e.results.map((r) => ({ ...r, date: e.date })))
      .sort((a, b) => b.winnings + b.bounties - (a.winnings + a.bounties))[0];
    stats.push([usd(Math.round(pool)), "Paid out"],
      [usd(biggest.winnings + biggest.bounties), `Best night · ${esc(biggest.handle)}`]);
  } else {
    const paid = DATA.standings.reduce((s, p) => s + p.winnings + (p.bounties || 0), 0);
    const most = [...DATA.standings].sort((a, b) => b.wins - a.wins || b.points - a.points)[0];
    stats.push([usd(Math.round(paid)), "Paid out"], [most.wins, `Most wins · ${esc(most.handle)}`]);
  }
  $("#stats").innerHTML = stats.map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join("");
  $("#updated").textContent = DATA.updated
    ? "Updated " + new Date(DATA.updated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : `${DATA.season} final standings`;
  $("#source").textContent = DATA.source === "spreadsheet" ? "From the club standings spreadsheet" : "Data from the Poker Mavens server";
}

function renderPodium() {
  const [a, b, c] = DATA.standings;
  const spot = (p, cls, n) => p ? `
    <div class="spot ${cls}" data-handle="${esc(p.handle)}">
      ${n === 1 ? '<div class="crown">👑</div>' : ""}
      <div class="medal">${n}</div>
      <div class="name">${esc(p.handle)}</div>
      <div class="pts">${pts(p.points)}</div>
      <div class="sub">${p.wins} win${p.wins === 1 ? "" : "s"} · ${p.played} played</div>
    </div>` : "<div></div>";
  // Visual order: 2nd, 1st, 3rd
  $("#podium").innerHTML = spot(b, "p2", 2) + spot(a, "p1", 1) + spot(c, "p3", 3);
  $("#podium").querySelectorAll(".spot").forEach((el) => el.addEventListener("click", () => openPlayer(el.dataset.handle)));
}

function movement(p) {
  const h = p.rankHistory;
  const prev = h[h.length - 2];
  if (prev == null) return '<span class="move up">NEW</span>';
  const d = prev - h[h.length - 1];
  if (d > 0) return `<span class="move up">▲${d}</span>`;
  if (d < 0) return `<span class="move down">▼${-d}</span>`;
  return '<span class="move same">–</span>';
}

function formChips(p, n = 6) {
  return p.weeks.slice(-n).map((w) => {
    if (!w) return '<span class="chip dns" title="Did not play"></span>';
    const cls = w[0] === 1 ? "win" : w[2] ? "cash" : "";
    return `<span class="chip ${cls}" title="${ordinal(w[0])} · ${pts(w[1])} pts">${w[0]}</span>`;
  }).join("");
}

function renderBoard() {
  const rows = [...DATA.standings].sort((a, b) => b[sortKey] - a[sortKey] || b.points - a.points);
  const max = rows[0][sortKey] || 1;
  const val = (p) => sortKey === "winnings" || sortKey === "bounties" ? usd(p[sortKey]) : pts(p[sortKey]);
  $("#board").innerHTML = rows.map((p, i) => `
    <tr class="r${p.rank}" data-handle="${esc(p.handle)}">
      <td class="num rank">${sortKey === "points" ? p.rank : i + 1}</td>
      <td><span class="player">${esc(p.handle)}</span>${sortKey === "points" && !DATA.final ? movement(p) : ""}
        <div class="bar" style="width:${Math.max(4, (p[sortKey] / max) * 100)}%"></div></td>
      <td class="num pts">${val(p)}</td>
      <td class="hide-sm"><div class="form">${formChips(p)}</div></td>
      <td class="num hide-sm">${p.played}</td>
      <td class="num">${p.wins || ""}</td>
      <td class="num hide-xs">${p.cashes || ""}</td>
      <td class="num hide-sm">${p.winnings ? usd(p.winnings) : ""}</td>
      <td class="num hide-sm">${p.bounties ? usd(p.bounties) : ""}</td>
    </tr>`).join("");
  $("#board").querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => openPlayer(tr.dataset.handle)));
}

document.querySelectorAll(".tabs button").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    sortKey = btn.dataset.sort;
    renderBoard();
  }));

function renderEventPicker() {
  const sel = $("#event-pick");
  sel.innerHTML = DATA.events.map((e, i) => `<option value="${i}">Week ${i + 1}${e.date ? " · " + fmtDate(e.date) : ""}</option>`).reverse().join("");
  sel.onchange = () => renderEvent(+sel.value);
  renderEvent(DATA.events.length - 1);
}

function renderEvent(i) {
  const e = DATA.events[i];
  const r0 = e.results[0];
  const cash = r0.winnings != null, kos = r0.bounties != null, re = r0.reentries != null;
  $("#event").innerHTML = `
    <div class="event-meta">
      ${e.number != null ? `<span>Tourney <b>#${e.number}</b></span>` : ""}
      <span>Entries <b>${e.entrants}</b></span>
      <span>Players <b>${e.players}</b></span>
      ${e.prizePool != null ? `<span>Prize pool <b class="money">${usd(e.prizePool)}</b></span>` : ""}
      ${e.bounty != null ? `<span>Bounty <b>${usd(e.bounty)}</b></span>` : ""}
    </div>
    <article class="recap" id="recap" hidden></article>
    <div class="table-wrap"><table>
      <thead><tr><th class="num">Place</th><th>Player</th><th class="num">Pts</th>
        ${cash ? '<th class="num">Cash</th>' : ""}${kos ? '<th class="num">KOs $</th>' : ""}${re ? '<th class="num hide-xs">Re-entries</th>' : ""}</tr></thead>
      <tbody>${e.results.map((r) => `
        <tr class="r${r.place}">
          <td class="num rank">${r.place}</td>
          <td class="player">${esc(r.handle)}</td>
          <td class="num pts">${pts(r.points)}</td>
          ${cash ? `<td class="num money">${r.winnings ? usd(r.winnings) : ""}</td>` : ""}
          ${kos ? `<td class="num">${r.bounties ? usd(r.bounties) : ""}</td>` : ""}
          ${re ? `<td class="num hide-xs">${r.reentries || ""}</td>` : ""}
        </tr>`).join("")}</tbody>
    </table></div>`;
  loadRecap(e);
}

// A CardPlayer-style write-up, if there is one: data/recaps/<date>.md with a "# " headline,
// an *italic* line under it and plain paragraphs.
function loadRecap(e) {
  if (!e.date) return;
  fetch(`data/recaps/${e.date}.md`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((md) => {
      const el = $("#recap");
      if (!el || DATA.events[+$("#event-pick").value] !== e) return;
      el.innerHTML = md.trim().split(/\n\s*\n/).map((block) => {
        const t = esc(block.trim().replace(/\s*\n\s*/g, " ")).replace(/[♥♦]/g, '<span class="red">$&</span>');
        if (t.startsWith("# ")) return `<h3>${t.slice(2)}</h3>`;
        if (/^\*.*\*$/.test(t)) return `<p class="dek">${t.slice(1, -1)}</p>`;
        return `<p>${t}</p>`;
      }).join("");
      el.hidden = false;
    })
    .catch(() => {});
}

// ToC and Extravaganza. Older seasons' sheets sometimes only recorded who cashed, without places.
function renderFinale() {
  const fin = DATA.finale || [];
  $("#finale-panel").hidden = !fin.length;
  $("#finale").innerHTML = fin.map((e) => {
    const kos = e.results.some((r) => r.bounties), partial = e.results.some((r) => r.place == null);
    // Without places, a shared top prize means the final table chopped.
    const top = e.results.filter((r) => partial && r.winnings === e.results[0].winnings);
    const champ = top.length > 1 ? `${top.length}-way chop · ${top.map((r) => esc(r.handle)).join(", ")}` : esc(e.results[0].handle);
    return `<div>
      <h3>${esc(e.name)}</h3>
      <p class="champ">👑 ${champ}</p>
      <div class="event-meta">
        ${e.date ? `<span>${fmtDate(e.date, { month: "long", day: "numeric", year: "numeric" })}</span>` : ""}
        ${e.entrants != null ? `<span>Entries <b>${e.entrants}</b></span>` : ""}
        ${e.prizePool ? `<span>Paid out <b class="money">${usd(e.prizePool)}</b></span>` : ""}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">Place</th><th>Player</th><th class="num">Cash</th>${kos ? '<th class="num">KOs $</th>' : ""}</tr></thead>
        <tbody>${e.results.map((r) => `
          <tr class="r${r.place}">
            <td class="num rank">${r.place ?? "–"}</td>
            <td class="player">${esc(r.handle)}</td>
            <td class="num money">${r.winnings ? usd(r.winnings) : ""}</td>
            ${kos ? `<td class="num">${r.bounties ? usd(r.bounties) : ""}</td>` : ""}
          </tr>`).join("")}</tbody>
      </table></div>
      ${partial ? '<p class="note">Only the cash finishes were recorded for this one.</p>' : ""}
    </div>`;
  }).join("");
}

function rankChart(p) {
  const h = p.rankHistory;
  const n = DATA.standings.length;
  const W = 500, H = 130, pad = 22;
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, h.length - 1);
  const y = (r) => 12 + ((r - 1) * (H - 34)) / Math.max(1, n - 1);
  const pts = h.map((r, i) => (r == null ? null : [x(i), y(r)])).filter(Boolean);
  const path = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line class="axis" x1="${pad}" x2="${W - pad}" y1="${y(1)}" y2="${y(1)}"/>
    <text x="0" y="${y(1) + 3}">#1</text>
    <path class="lineplot" d="${path}"/>
    ${pts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3.5"/>`).join("")}
    ${DATA.events.map((e, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${e.date ? fmtDate(e.date, { month: "numeric", day: "numeric" }) : i + 1}</text>`).join("")}
  </svg>`;
}

function openPlayer(handle) {
  const p = DATA.standings.find((s) => s.handle === handle);
  $("#player-body").innerHTML = `
    <p class="kicker" style="text-align:left">Rank #${p.rank} · ${DATA.season}</p>
    <h3 class="pd-name">${esc(p.handle)}</h3>
    <div class="pd-grid">
      <div class="stat"><b>${pts(p.points)}</b><small>Points</small></div>
      <div class="stat"><b>${pts(p.avgPoints)}</b><small>Avg</small></div>
      <div class="stat"><b>${p.best ? ordinal(p.best) : "–"}</b><small>Best</small></div>
      <div class="stat"><b>${Math.round(p.cashPct * 100)}%</b><small>Cash rate</small></div>
      <div class="stat"><b>${p.wins}</b><small>Wins</small></div>
      <div class="stat"><b>${usd(p.winnings)}</b><small>Cashed</small></div>
      ${p.bounties != null ? `<div class="stat"><b>${usd(p.bounties)}</b><small>Bounties</small></div>` : ""}
      ${p.reentries != null ? `<div class="stat"><b>${p.reentries}</b><small>Re-entries</small></div>` : ""}
    </div>
    <h2 style="font-size:20px">Rank over the season</h2>
    ${rankChart(p)}
    <h2 style="font-size:20px">Week by week</h2>
    <table><tbody>${DATA.events.map((e, i) => {
      const w = p.weeks[i];
      return `<tr><td>${weekLabel(e, i)}</td><td class="num">${w ? ordinal(w[0]) : '<span class="same">—</span>'}</td>
        <td class="num pts">${w ? pts(w[1]) : ""}</td></tr>`;
    }).reverse().join("")}</tbody></table>`;
  $("#player").showModal();
}
