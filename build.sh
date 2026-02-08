#!/bin/bash
# Cloudflare Pages build script
# Copies latest scraped data into the static site directory

mkdir -p site/data

# Copy deals data if available from scraper output
if [ -f data/deals.json ]; then
  cp data/deals.json site/data/deals.json
  echo "Copied data/deals.json to site/data/"
else
  echo "No data/deals.json found, using existing site/data/deals.json"
fi
