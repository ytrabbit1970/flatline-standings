# Flatline Standings

Season standings for the Flatline Faithful weekly tournament, built from the Poker Mavens API and published with GitHub Pages.

## Weekly update

```sh
./publish.sh
```

That pulls any new results, rebuilds `docs/data/standings.json`, commits it and pushes. The site updates a minute or so later.

## How it works

- `update.py` fetches every "Flatline Faithful" result since the season start, dedupes re-entries the same way the
  spreadsheet's Tournament Results Corrector does, scores each week with the sheet's points formula and writes the JSON.
- The API password is read from the macOS Keychain (service `pokermavens-api`) or the `PM_API_PW` env var. It is never written to the repo.
- Only Poker Mavens handles are published. Real names stay out of the repo.
- `docs/` is a static site (HTML, CSS, vanilla JS) that GitHub Pages serves as-is.

## New season

Edit `SEASON` at the top of `update.py` (name and start date, and an end date for the old one if you want to archive it).
