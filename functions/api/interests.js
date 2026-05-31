export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.REC_DB) {
    return jsonResponse({ success: false, error: "D1 not configured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const {
    user_id, event_type, product_code, product_name,
    brand, category, weight_grams, sale_price,
    original_price, discount_pct, in_stock,
  } = body;

  if (!user_id || !event_type || !product_code) {
    return jsonResponse({ success: false, error: "Missing required fields" }, 400);
  }
  if (typeof user_id !== "string" || user_id.length > 100) {
    return jsonResponse({ success: false, error: "Invalid user_id" }, 400);
  }
  if (event_type !== "add" && event_type !== "remove") {
    return jsonResponse({ success: false, error: "event_type must be add or remove" }, 400);
  }

  const now = new Date().toISOString();

  await env.REC_DB.prepare(
    `INSERT OR IGNORE INTO rec_users (user_id, created_at, last_seen_at) VALUES (?, ?, ?)`
  ).bind(user_id, now, now).run();

  await env.REC_DB.prepare(
    `UPDATE rec_users SET last_seen_at = ? WHERE user_id = ?`
  ).bind(now, user_id).run();

  await env.REC_DB.prepare(`
    INSERT INTO interest_events
      (user_id, event_type, product_code, product_name, brand, category,
       weight_grams, sale_price, original_price, discount_pct, in_stock, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user_id, event_type, product_code, product_name ?? null,
    brand ?? null, category ?? null, weight_grams ?? null,
    sale_price ?? null, original_price ?? null, discount_pct ?? null,
    in_stock ? 1 : 0, now
  ).run();

  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
