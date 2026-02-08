"""
Email digest sender for top pet food deals.

Generates a responsive HTML email with the top 20 dog food and
top 20 cat food deals, and sends via Gmail SMTP.

Usage:
    python -m src.emailer
"""

import json
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import (
    DEALS_PATH,
    EMAIL_PASSWORD,
    EMAIL_RECIPIENT,
    EMAIL_SENDER,
    SMTP_HOST,
    SMTP_PORT,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

TOP_N = 20


def load_top_deals() -> tuple[list[dict], list[dict]]:
    """Load deals and return (top dog deals, top cat deals)."""
    if not DEALS_PATH.exists():
        log.error("Deals file not found: %s", DEALS_PATH)
        return [], []

    with open(DEALS_PATH, "r", encoding="utf-8") as f:
        deals = json.load(f)

    dog_deals = [d for d in deals if d["category"] == "dog_food"]
    cat_deals = [d for d in deals if d["category"] == "cat_food"]

    # Already sorted by discount_pct descending from processor
    return dog_deals[:TOP_N], cat_deals[:TOP_N]


def _deal_row_html(deal: dict) -> str:
    """Generate a single product row for the email."""
    return f"""
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 8px; width: 60px;">
        <img src="{deal['image_url']}" alt="" width="56" height="56"
             style="border-radius: 4px; object-fit: cover;" />
      </td>
      <td style="padding: 12px 8px;">
        <a href="{deal['product_url']}" style="color: #1a73e8; text-decoration: none; font-weight: 600;">
          {deal['product_name']}
        </a>
        <br/>
        <span style="color: #666; font-size: 13px;">{deal['brand']}</span>
      </td>
      <td style="padding: 12px 8px; text-align: right; white-space: nowrap;">
        <span style="text-decoration: line-through; color: #999; font-size: 13px;">
          ${deal['original_price']:.2f}
        </span>
        <br/>
        <span style="color: #d32f2f; font-weight: 700; font-size: 16px;">
          ${deal['sale_price']:.2f}
        </span>
      </td>
      <td style="padding: 12px 8px; text-align: center;">
        <span style="background: #d32f2f; color: #fff; padding: 4px 10px;
               border-radius: 12px; font-size: 13px; font-weight: 700;">
          -{deal['discount_pct']:.0f}%
        </span>
      </td>
    </tr>"""


def _section_html(title: str, deals: list[dict]) -> str:
    """Generate an HTML table section for a category."""
    if not deals:
        return f"<h2 style='color: #333;'>{title}</h2><p>No deals found.</p>"

    rows = "\n".join(_deal_row_html(d) for d in deals)
    return f"""
    <h2 style="color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">
      {title}
    </h2>
    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 8px; text-align: left;"></th>
          <th style="padding: 8px; text-align: left;">Product</th>
          <th style="padding: 8px; text-align: right;">Price</th>
          <th style="padding: 8px; text-align: center;">Discount</th>
        </tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>"""


def build_email_html(dog_deals: list[dict], cat_deals: list[dict]) -> str:
    """Build the full HTML email body."""
    scraped_date = ""
    if dog_deals:
        scraped_date = dog_deals[0].get("scraped_date", "")
    elif cat_deals:
        scraped_date = cat_deals[0].get("scraped_date", "")

    dog_section = _section_html(f"🐶 Top {TOP_N} Dog Food Deals", dog_deals)
    cat_section = _section_html(f"🐱 Top {TOP_N} Cat Food Deals", cat_deals)

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 20px; background: #f9f9f9; font-family: Arial, sans-serif;">
      <div style="max-width: 700px; margin: 0 auto; background: #fff; padding: 24px;
                  border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="text-align: center; color: #1a73e8;">
          HKTVmall Pet Food Deals
        </h1>
        <p style="text-align: center; color: #666; font-size: 14px;">
          Weekly digest &mdash; {scraped_date}
        </p>
        {dog_section}
        <br/>
        {cat_section}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="text-align: center; color: #999; font-size: 12px;">
          Prices scraped from hktvmall.com. Prices may have changed since scraping.
        </p>
      </div>
    </body>
    </html>"""


def send_email():
    """Build and send the weekly deal digest email."""
    if not all([EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECIPIENT]):
        log.error(
            "Email credentials not configured. Set EMAIL_SENDER, EMAIL_PASSWORD, "
            "and EMAIL_RECIPIENT environment variables."
        )
        return False

    dog_deals, cat_deals = load_top_deals()
    if not dog_deals and not cat_deals:
        log.warning("No deals to send.")
        return False

    html = build_email_html(dog_deals, cat_deals)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Weekly HKTVmall Pet Food Deals"
    msg["From"] = EMAIL_SENDER
    msg["To"] = EMAIL_RECIPIENT
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, [EMAIL_RECIPIENT], msg.as_string())
        log.info("Email sent successfully to %s", EMAIL_RECIPIENT)
        return True
    except Exception as e:
        log.error("Failed to send email: %s", e, exc_info=True)
        return False


def main():
    send_email()


if __name__ == "__main__":
    main()
