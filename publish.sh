#!/bin/sh
# Pull the latest results, rebuild the standings and push them to GitHub Pages.
set -e
cd "$(dirname "$0")"
python3 update.py
git add docs/data/standings.json
if git diff --cached --quiet; then
  echo "No new results."
else
  git commit -m "Update standings $(date +%Y-%m-%d)"
  git push
fi
