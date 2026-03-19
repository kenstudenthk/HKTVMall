/**
 * Cloudflare Pages Function to fetch real-time price/stock for a single product.
 *
 * Query params:
 * - code: product_code (e.g. "KPM0053-03-00P")
 * - url: (optional) product_url as fallback context
 *
 * Response: { original_price, sale_price, discount_pct, in_stock }
 * On error: { error: "..." }
 */

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const code = reqUrl.searchParams.get("code");

  if (!code || code.trim() === "") {
    return jsonResponse({ error: "Missing product code" }, 400);
  }

  try {
    const apiUrl = `https://www.hktvmall.com/hktvweb/product/productDetail?productCode=${encodeURIComponent(code.trim())}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
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

    // productDetail may wrap the product under different keys
    const product = data.product || data.productData || data;

    // Extract original price (same field as scraper: product.price.value)
    const original_price = safeFloat(product.price);

    // Extract sale price — try promotionPrice first, then priceList[DISCOUNT]
    // (mirrors _normalize_product in streaming_processor.py)
    let sale_price = safeFloat(product.promotionPrice);
    if (sale_price === null && Array.isArray(product.priceList)) {
      for (const entry of product.priceList) {
        if (entry.priceType === "DISCOUNT") {
          sale_price = parseFloat(entry.value) || null;
          break;
        }
      }
    }

    if (original_price === null || sale_price === null) {
      return jsonResponse({ error: "Price data unavailable for this product" }, 404);
    }

    const discount_pct =
      original_price > 0
        ? Math.round(((original_price - sale_price) / original_price) * 100)
        : 0;

    // Stock status (same logic as scraper)
    const stockInfo = product.stock || {};
    const stockStatus = stockInfo.stockLevelStatus || {};
    const in_stock = stockStatus.code === "inStock";

    return jsonResponse({ original_price, sale_price, discount_pct, in_stock });
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
