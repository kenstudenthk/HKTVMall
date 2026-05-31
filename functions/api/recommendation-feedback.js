export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.REC_DB) return jsonResponse({ success: false, error: "D1 not configured" }, 503);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ success: false, error: "Invalid JSON" }, 400); }

  const { user_id, rating, view_count } = body;
  if (!user_id || !rating) return jsonResponse({ success: false, error: "Missing user_id or rating" }, 400);
  if (typeof user_id !== "string" || user_id.length > 100) return jsonResponse({ success: false, error: "Invalid user_id" }, 400);
  const allowed = ["satisfied", "unsatisfied", "skip"];
  if (!allowed.includes(rating)) return jsonResponse({ success: false, error: `rating must be one of: ${allowed.join(", ")}` }, 400);

  const now = new Date().toISOString();

  await env.REC_DB.prepare(`
    INSERT INTO recommendation_feedback (user_id, rating, view_count_at_time, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(user_id, rating, view_count ?? 0, now).run();

  await env.REC_DB.prepare(`
    INSERT INTO recommendation_views (user_id, view_count, last_feedback_at)
    VALUES (?, 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_feedback_at = ?
  `).bind(user_id, now, now).run();

  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
