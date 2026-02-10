/**
 * Cloudflare Pages Function to trigger the GitHub Actions scraper workflow.
 *
 * This endpoint accepts POST requests and triggers the "Weekly Pet Food Deal Scrape"
 * workflow via GitHub API workflow_dispatch.
 *
 * Environment variables required (set in Cloudflare Pages dashboard):
 * - GITHUB_TOKEN: GitHub Personal Access Token with workflow permissions
 * - GITHUB_OWNER: Repository owner (e.g., "kenstudenthk")
 * - GITHUB_REPO: Repository name (e.g., "HKTVMall")
 */

export async function onRequestPost(context) {
  const { env } = context;

  // Get configuration from environment variables
  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const GITHUB_OWNER = env.GITHUB_OWNER || "kenstudenthk";
  const GITHUB_REPO = env.GITHUB_REPO || "HKTVMall";
  const WORKFLOW_FILE = "weekly_scrape.yml";

  // Validate required environment variable
  if (!GITHUB_TOKEN) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "GitHub token not configured. Please set GITHUB_TOKEN in Cloudflare Pages environment variables."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  try {
    // Trigger GitHub Actions workflow via workflow_dispatch
    const githubApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

    console.log(`Triggering workflow: ${GITHUB_OWNER}/${GITHUB_REPO} - ${WORKFLOW_FILE}`);

    const response = await fetch(githubApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "HKTVMall-Scraper-Trigger"
      },
      body: JSON.stringify({
        ref: "main" // Branch to run the workflow on
      })
    });

    if (response.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Scraper workflow triggered successfully! Check the Actions tab on GitHub for progress.",
          workflow_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } else {
      const errorData = await response.text();
      console.error("GitHub API error:", response.status, errorData);
      console.error("Attempted URL:", githubApiUrl);

      return new Response(
        JSON.stringify({
          success: false,
          error: `GitHub API error: ${response.status}`,
          details: errorData,
          attempted_url: githubApiUrl,
          config: {
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            workflow: WORKFLOW_FILE
          }
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  } catch (error) {
    console.error("Error triggering workflow:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to trigger workflow",
        details: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
