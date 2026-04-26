#!/bin/bash
# Cloudflare Pages build script
# Copies latest scraped data into the static site directory

mkdir -p site/data

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
  echo "No data/deals.json found, using existing site/data/deals.json"
fi
