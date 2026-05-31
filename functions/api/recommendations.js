const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_DEALS_TO_CLAUDE = 50;
const COLD_START_THRESHOLD = 3;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) return jsonResponse({ error: "user_id required" }, 400);
  if (typeof userId !== "string" || userId.length > 100)
    return jsonResponse({ error: "Invalid user_id" }, 400);
  if (!env.REC_DB) return jsonResponse({ error: "D1 not configured" }, 503);
  if (!env.ANTHROPIC_API_KEY)
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 503);
  if (!env.DEALS_BUCKET)
    return jsonResponse({ error: "DEALS_BUCKET not configured" }, 503);

  const now = new Date().toISOString();

  // Upsert user
  await env.REC_DB.prepare(
    `INSERT OR IGNORE INTO rec_users (user_id, created_at, last_seen_at) VALUES (?,?,?)`,
  )
    .bind(userId, now, now)
    .run();
  await env.REC_DB.prepare(
    `UPDATE rec_users SET last_seen_at = ? WHERE user_id = ?`,
  )
    .bind(now, userId)
    .run();

  // Track view count (for feedback prompt)
  await env.REC_DB.prepare(
    `
    INSERT INTO recommendation_views (user_id, view_count) VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET view_count = view_count + 1
  `,
  )
    .bind(userId)
    .run();

  const viewRow = await env.REC_DB.prepare(
    `SELECT view_count, last_feedback_at FROM recommendation_views WHERE user_id = ?`,
  )
    .bind(userId)
    .first();

  // Fetch latest deals from R2
  const dealsObj = await env.DEALS_BUCKET.get("deals.json");
  if (!dealsObj)
    return jsonResponse({ error: "deals.json not found in R2" }, 404);
  const dealsData = await dealsObj.json();
  const allDeals = dealsData.deals ?? [];
  const scrapedDate = dealsData.scraped_date ?? "";

  // Load interest history
  const interestRows = await env.REC_DB.prepare(
    `
    SELECT event_type, product_code, brand, category, weight_grams,
           sale_price, discount_pct, in_stock, product_name, created_at
    FROM interest_events
    WHERE user_id = ?
    ORDER BY created_at ASC
  `,
  )
    .bind(userId)
    .all();
  const events = interestRows.results ?? [];

  // Net interest set: apply add/remove events in order
  const interestMap = {};
  for (const e of events) {
    if (e.event_type === "add") interestMap[e.product_code] = e;
    else delete interestMap[e.product_code];
  }
  const interests = Object.values(interestMap);
  const interestCount = interests.length;
  const addCount = events.filter((e) => e.event_type === "add").length;

  // Cache check
  const cacheRow = await env.REC_DB.prepare(
    `SELECT * FROM recommendation_cache WHERE user_id = ?`,
  )
    .bind(userId)
    .first();

  const cacheValid =
    cacheRow &&
    cacheRow.deals_scraped_date === scrapedDate &&
    cacheRow.interest_count === addCount;

  if (cacheValid) {
    const cached = JSON.parse(cacheRow.recommendations_json);
    return jsonResponse({
      ...cached,
      cached: true,
      show_feedback_prompt: shouldShowFeedback(viewRow),
      view_count: viewRow?.view_count ?? 0,
    });
  }

  // Build recommendations via Claude
  const isColdStart = interestCount < COLD_START_THRESHOLD;
  const topDeals = [...allDeals]
    .filter((d) => d.in_stock !== false)
    .sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))
    .slice(0, MAX_DEALS_TO_CLAUDE);

  const prompt = buildPrompt(interests, topDeals, isColdStart);

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    console.error("Claude API error:", err);
    return jsonResponse({ error: "Failed to generate recommendations" }, 502);
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.[0]?.text ?? "";

  let recommendedCodes = [];
  const jsonMatch = rawText.match(/\[[\s\S]*\]/)?.[0];
  if (!jsonMatch) {
    console.error(
      "Claude response had no JSON array. Raw text:",
      rawText.slice(0, 200),
    );
  } else {
    try {
      recommendedCodes = JSON.parse(jsonMatch);
    } catch (e) {
      console.error(
        "Failed to parse Claude JSON array:",
        e.message,
        "Match:",
        jsonMatch.slice(0, 200),
      );
    }
  }

  // Enrich with full deal data
  const dealMap = Object.fromEntries(allDeals.map((d) => [d.product_code, d]));
  const items = recommendedCodes
    .map((r) => {
      const d = dealMap[r.product_code];
      if (!d) return null;
      return {
        product_code: d.product_code,
        product_name: d.product_name,
        brand: d.brand,
        category: d.category,
        discount_pct: d.discount_pct,
        sale_price: d.sale_price,
        original_price: d.original_price,
        image_url: d.image_url,
        product_url: d.product_url,
        in_stock: d.in_stock,
        weight_grams: d.weight_grams,
        last_updated: d.last_updated,
        reason: r.reason ?? "",
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  const result = {
    cold_start: isColdStart,
    items,
    generated_at: now,
    cached: false,
  };

  // Save to cache
  await env.REC_DB.prepare(
    `
    INSERT INTO recommendation_cache (user_id, deals_scraped_date, interest_count, recommendations_json, generated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      deals_scraped_date = excluded.deals_scraped_date,
      interest_count = excluded.interest_count,
      recommendations_json = excluded.recommendations_json,
      generated_at = excluded.generated_at
  `,
  )
    .bind(userId, scrapedDate, addCount, JSON.stringify(result), now)
    .run();

  return jsonResponse({
    ...result,
    show_feedback_prompt: shouldShowFeedback(viewRow),
    view_count: viewRow?.view_count ?? 0,
  });
}

function shouldShowFeedback(viewRow) {
  if (!viewRow) return false;
  const count = viewRow.view_count ?? 0;
  return count > 0 && count % 3 === 0;
}

function buildPrompt(interests, topDeals, isColdStart) {
  const dealsJson = JSON.stringify(
    topDeals.map((d) => ({
      product_code: d.product_code,
      product_name: d.product_name,
      brand: d.brand,
      category: d.category,
      discount_pct: d.discount_pct,
      sale_price: d.sale_price,
      weight_grams: d.weight_grams,
      in_stock: d.in_stock,
    })),
  );

  if (isColdStart) {
    return `You are a pet food deal recommender. The user has no favourite history yet.

From the deals below, pick the 10 best value deals across both dog and cat food. Favour higher discounts and in-stock items.

Deals:
${dealsJson}

Return ONLY a JSON array (no other text) with this shape:
[{"product_code": "...", "reason": "one short sentence why this is a good pick"}, ...]`;
  }

  const profileJson = JSON.stringify(
    interests.map((i) => ({
      brand: i.brand,
      category: i.category,
      weight_grams: i.weight_grams,
      sale_price: i.sale_price,
      discount_pct: i.discount_pct,
    })),
  );

  return `You are a pet food deal recommender. Based on the user's saved interests, recommend the most relevant current deals.

User's interest profile (items they saved):
${profileJson}

Current deals available:
${dealsJson}

Rules:
- Prioritise same brand or same category as the user's interests
- Favour weight ranges similar to what the user has saved
- Boost items with higher discount_pct
- Exclude items the user already saved (check product_code against interests if needed)
- Return 10–15 items

Return ONLY a JSON array (no other text):
[{"product_code": "...", "reason": "one short sentence personalised to the user's profile"}, ...]`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
