#!/bin/bash
# Cloudflare Pages build script
# Copies latest scraped data into the static site directory

mkdir -p site/data

# Remove any stale cached copy — prevents Cloudflare Pages build cache from
# re-deploying a previously large file after it has been removed from git.
rm -f site/data/deals.json

# Copy deals data only if it fits within Cloudflare Pages' 25MB asset limit.
# When it's too large, R2 (via /api/deals) serves the data instead.
if [ -f data/deals.json ]; then
  size=$(wc -c < data/deals.json)
  if [ "$size" -lt 24000000 ]; then
    cp data/deals.json site/data/deals.json
    echo "Copied data/deals.json to site/data/ (${size} bytes)"
  else
    echo "data/deals.json is ${size} bytes (>24MB) — skipping static copy, R2 will serve live data"
  fi
else
  echo "No data/deals.json found, skipping static copy"
fi
