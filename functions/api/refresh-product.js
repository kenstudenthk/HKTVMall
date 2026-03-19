/**
 * Cloudflare Pages Function to fetch real-time price/stock for a single product.
 *
 * Uses the same cate-search API the scraper uses, searching by product code.
 *
 * Query params:
 * - code: product_code (e.g. "KPM0053-03-00P")
 *
 * Response: { original_price, sale_price, discount_pct, in_stock }
 * On error: { error: "..." }
 */

const CATE_SEARCH_API = "https://cate-search.hktvmall.com/query/products";

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const code = (reqUrl.searchParams.get("code") || "").trim();

  if (!code) {
    return jsonResponse({ error: "Missing product code" }, 400);
  }

  try {
    // Use the same API as the scraper: POST with URL params, search by code as query
    const params = new URLSearchParams({
      query: code,
      currentPage: "0",
      pageSize: "10",
    });

    const response = await fetch(`${CATE_SEARCH_API}?${params}`, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.hktvmall.com/",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        { error: `Upstream API error: ${response.status}` },
        502,
      );
    }

    const data = await response.json();
    const products = data.products || [];

    // Find exact match by product code
    let product = products.find((p) => p.code === code);

    // Fallback: partial match if exact not found (code may be a SKU prefix)
    if (!product) {
      product = products.find((p) => p.code && p.code.startsWith(code));
    }

    if (!product) {
      return jsonResponse(
        { error: `Product ${code} not found in search results` },
        404,
      );
    }

    // Normalize priceList → promotionPrice (mirrors _normalize_product in streaming_processor.py)
    if (!product.promotionPrice) {
      const priceList = product.priceList || [];
      for (const entry of priceList) {
        if (entry.priceType === "DISCOUNT") {
          product.promotionPrice = { value: entry.value };
          break;
        }
      }
    }

    const original_price = safeFloat(product.price);
    const sale_price = safeFloat(product.promotionPrice);

    if (original_price === null) {
      return jsonResponse({ error: "Price data unavailable" }, 404);
    }

    // If no sale price, item is not discounted — return full price as both
    const effective_sale = sale_price ?? original_price;
    const discount_pct =
      original_price > 0
        ? Math.round(((original_price - effective_sale) / original_price) * 100)
        : 0;

    // Stock status (same logic as scraper)
    const stockStatus = (product.stock || {}).stockLevelStatus || {};
    const in_stock = stockStatus.code === "inStock";

    return jsonResponse({
      original_price,
      sale_price: effective_sale,
      discount_pct,
      in_stock,
    });
  } catch (err) {
    console.error("refresh-product error:", err);
    return jsonResponse({ error: err.message || "Internal error" }, 500);
  }
}

function safeFloat(obj) {
  if (obj == null) return null;
  const val = typeof obj === "object" ? obj.value : obj;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
