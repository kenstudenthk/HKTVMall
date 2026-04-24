# HKTVMall Pet Food Deals

A scraping pipeline that fetches pet food deals from HKTVmall, processes discount data, and serves it via a static web dashboard. Includes weekly Telegram deal alerts.

## Setup

```bash
pip install -r requirements.txt
python -m playwright install chromium --with-deps
```

## Run Pipeline

```bash
python -m src.scraper      # Scrape products
python -m src.processor    # Process into deals.json
```

## Build & Deploy

```bash
./build.sh                # Build static site
```

## Weekly Deal Alerts

Every Friday at 1PM HKT, a Telegram alert is sent to configured users.

### Setup

1. **Create a Telegram Bot** — message `@BotFather` on Telegram, get a bot token
2. **Add secret to GitHub** — go to Settings → Secrets → Actions:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET` (if using R2)

### User Preferences

Users can configure their alert filters at `/preferences.html?user_id=YOUR_USER_ID`.

Supported filters:
- Enable/disable alert
- Category (dog food / cat food)
- Minimum discount %
- Brand filter
- Price range
- Weight range (Under 1kg / 1–3kg / 3–5kg / Over 5kg)
- In-stock only
- Max deals per alert
