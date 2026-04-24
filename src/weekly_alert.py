"""
Weekly Telegram alert — reads preferences, filters deals, sends Telegram messages.

Usage:
    python -m src.weekly_alert

Requires TELEGRAM_BOT_TOKEN env var (set in Cloudflare Pages / VPS env).

Dev note: If running locally without a deals.json checkout, set DEALS_URL
env var to point to the deployed deals.json (e.g. https://your-site.pages.dev/data/deals.json)
"""

import json
import logging
import os
import sys
import urllib.request
from datetime import date

from src.config import DEALS_PATH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
PREFERENCES_PATH = PROJECT_ROOT / "data" / "preferences.json"


# ── Telegram sending ───────────────────────────────────────────────────────────
def send_telegram(chat_id: str, text: str) -> bool:
    """Send a message via Telegram bot. Returns True on success."""
    if not BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN not set")
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            if data.get("ok"):
                log.info("Telegram sent to %s", chat_id)
                return True
            log.error("Telegram API error: %s", data)
            return False
    except Exception as exc:
        log.error("Failed to send Telegram to %s: %s", chat_id, exc)
        return False


# ── Weight filter helper (mirrors JS _weightMatches) ───────────────────────────
def weight_matches(weight_grams, weight_range):
    if weight_grams is None:
        return weight_range == "any"
    g = weight_grams
    if weight_range == "under-1kg":
        return g < 1000
    if weight_range == "1kg-3kg":
        return 1000 <= g <= 3000
    if weight_range == "3kg-5kg":
        return 3000 < g <= 5000
    if weight_range == "over-5kg":
        return g > 5000
    return True  # "any"


# ── Load deals ────────────────────────────────────────────────────────────────
def load_deals():
    # Try local file first, fall back to DEALS_URL env var
    if DEALS_PATH.exists():
        with open(DEALS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    deals_url = os.environ.get("DEALS_URL", "")
    if not deals_url:
        log.error("No local deals.json and DEALS_URL not set")
        return []
    log.info("Fetching deals from %s", deals_url)
    req = urllib.request.Request(deals_url)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


# ── Load preferences ──────────────────────────────────────────────────────────
def load_preferences():
    if not PREFERENCES_PATH.exists():
        log.error("preferences.json not found at %s", PREFERENCES_PATH)
        return []
    with open(PREFERENCES_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("users", [])


# ── Filter deals for one user ────────────────────────────────────────────────
def filter_deals_for_user(deals, filters):
    categories = filters.get("categories", [])
    brands = filters.get("brands", [])
    min_discount = filters.get("min_discount", 0)
    price_min = filters.get("price_min", 0)
    price_max = filters.get("price_max", 10_000)
    weight_range = filters.get("weight_range", "any")
    in_stock_only = filters.get("in_stock_only", False)
    max_deals = filters.get("max_deals", 10)

    matched = []
    for d in deals:
        if d["discount_pct"] < min_discount:
            continue
        if categories and d["category"] not in categories:
            continue
        if brands and d["brand"] not in brands:
            continue
        price = d["sale_price"]
        if price < price_min or price > price_max:
            continue
        if in_stock_only and not d.get("in_stock", False):
            continue
        if not weight_matches(d.get("weight_grams"), weight_range):
            continue
        matched.append(d)

    # Sort by discount desc, take top max_deals
    matched.sort(key=lambda x: x["discount_pct"], reverse=True)
    return matched[:max_deals]


# ── Build Telegram message ─────────────────────────────────────────────────────
def build_message(user_name: str, deals: list, scraped_date: str) -> str:
    lines = [
        f"🐾 <b>HKTVmall Pet Food Deals</b>",
        f"📅 Week of {scraped_date}",
        f"🔔 {user_name}, here are this week's top deals:",
        "",
    ]
    for i, d in enumerate(deals, 1):
        name = d["product_name"][:50] + ("…" if len(d["product_name"]) > 50 else "")
        original = f"${d['original_price']:.2f}"
        sale = f"${d['sale_price']:.2f}"
        disc = f"-{d['discount_pct']:.0f}%"
        cat = "🐕" if d["category"] == "dog_food" else "🐈"
        stock = "✅" if d.get("in_stock") else "❌"
        url = d["product_url"]

        lines.append(
            f"{cat} <b>{name}</b>\n"
            f"   {original} → {sale} {disc} {stock}\n"
            f"   <a href=\"{url}\">View on HKTVmall</a>"
        )
        lines.append("")

    lines.append("—")
    lines.append(f"<i>Filtered from {len(deals)} matching deals</i>")
    lines.append("<i>Data may not reflect real-time prices.</i>")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN environment variable is not set")
        sys.exit(1)

    log.info("Loading deals…")
    deals = load_deals()
    if not deals:
        log.error("No deals loaded — aborting")
        sys.exit(1)
    log.info("Loaded %d deals", len(deals))

    scraped_date = deals[0].get("scraped_date", date.today().isoformat())

    log.info("Loading preferences…")
    users = load_preferences()
    if not users:
        log.warning("No users found in preferences.json")
        return

    total_sent = 0
    for user in users:
        user_id = user["user_id"]
        name = user.get("name", user_id)
        filters = user.get("filters", {})

        if not filters.get("alert_enabled", True):
            log.info("User %s has alerts disabled — skipping", user_id)
            continue

        matched = filter_deals_for_user(deals, filters)
        if not matched:
            log.info("User %s — no matching deals", user_id)
            continue

        msg = build_message(name, matched, scraped_date)
        ok = send_telegram(user_id, msg)
        if ok:
            total_sent += 1

    log.info("Done. Sent to %d user(s)", total_sent)


if __name__ == "__main__":
    main()
