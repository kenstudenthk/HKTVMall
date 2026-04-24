/**
 * Cloudflare Pages Function: GET/POST /api/preferences
 *
 * Reads and writes preferences.json in the GitHub repo.
 * Uses GITHUB_TOKEN (PAT with repo scope) set in Cloudflare Pages env vars.
 *
 * GET  → returns all user preferences
 * POST → upserts user preferences by user_id { user_id, filters }
 */

const GITHUB_OWNER = "kenstudenthk";
const GITHUB_REPO  = "HKTVMall";
const PREF_BRANCH  = "main";
const PREF_PATH    = "data/preferences.json";
const PREF_MSG     = "chore: update user preferences";

// ── helpers ────────────────────────────────────────────────────────────────────
async function githubFetch(path, options = {}) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "HKTVMall-Prefs-Function",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return resp;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// Load GitHub token from Cloudflare Pages env
// In Cloudflare Pages, env vars are available via context.env
async function getGitHubToken(env) {
  // Check multiple possible env var names
  return env.GITHUB_TOKEN || env.GH_TOKEN || null;
}

// ── GET /api/preferences ───────────────────────────────────────────────────────
async function handleGet(env) {
  const GITHUB_TOKEN = await getGitHubToken(env);
  if (!GITHUB_TOKEN) {
    return jsonResponse({ error: "GitHub token not configured" }, 500);
  }

  try {
    const resp = await githubFetch(
      `contents/${PREF_PATH}?ref=${PREF_BRANCH}`
    );

    if (resp.status === 404) {
      // File doesn't exist yet — return empty structure
      return jsonResponse({ users: [] });
    }
    if (!resp.ok) {
      return jsonResponse({ error: `GitHub API error: ${resp.status}` }, resp.status);
    }

    const file = await resp.json();
    // Content is base64-encoded
    const content = atob(file.content);
    const data = JSON.parse(content);
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── POST /api/preferences ──────────────────────────────────────────────────────
async function handlePost(env, body) {
  const GITHUB_TOKEN = await getGitHubToken(env);
  if (!GITHUB_TOKEN) {
    return jsonResponse({ error: "GitHub token not configured" }, 500);
  }

  const { user_id, filters } = body;
  if (!user_id || !filters) {
    return jsonResponse({ error: "user_id and filters are required" }, 400);
  }

  try {
    // 1. Get current file to find its SHA
    let sha = null;
    let existingData = { users: [] };

    const getResp = await githubFetch(`contents/${PREF_PATH}?ref=${PREF_BRANCH}`);
    if (getResp.ok) {
      const file = await getResp.json();
      sha = file.sha;
      const content = atob(file.content);
      existingData = JSON.parse(content);
    } else if (getResp.status !== 404) {
      return jsonResponse({ error: `GitHub API error: ${getResp.status}` }, getResp.status);
    }

    // 2. Upsert user in users array
    if (!existingData.users) existingData.users = [];
    const idx = existingData.users.findIndex((u) => u.user_id === user_id);
    const userEntry = { user_id, filters };
    if (idx >= 0) {
      existingData.users[idx] = userEntry;
    } else {
      existingData.users.push(userEntry);
    }

    // 3. Commit update
    const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(existingData, null, 2))));
    const commitBody = {
      message: PREF_MSG,
      branch: PREF_BRANCH,
      content: encodedContent,
      ...(sha ? { sha } : {}),
    };

    const putResp = await githubFetch(`contents/${PREF_PATH}`, {
      method: "PUT",
      body: JSON.stringify(commitBody),
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      return jsonResponse({ error: `GitHub API error: ${putResp.status}`, details: errText }, putResp.status);
    }

    return jsonResponse({ success: true, message: "Preferences saved" });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── CORS preflight ────────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { env, request } = context;
  const GITHUB_TOKEN = await getGitHubToken(env);

  if (request.method === "GET") {
    return handleGet(env);
  }
  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    return handlePost(env, body);
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}
