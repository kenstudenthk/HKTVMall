/**
 * Cloudflare Pages Function to serve deals.json from R2.
 *
 * Reads deals.json from the DEALS_BUCKET R2 binding and returns it as JSON.
 * Falls back gracefully if R2 is not configured (503) or object not found (404).
 *
 * R2 bucket binding required (set in Cloudflare Pages dashboard):
 * - DEALS_BUCKET: R2 bucket containing deals.json
 */

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DEALS_BUCKET) {
    return new Response(
      JSON.stringify({ error: "R2 bucket not configured" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const object = await env.DEALS_BUCKET.get("deals.json");

    if (!object) {
      return new Response(
        JSON.stringify({ error: "deals.json not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error reading from R2:", error);

    return new Response(
      JSON.stringify({ error: "Failed to read deals data" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

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
