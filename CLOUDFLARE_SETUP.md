# Cloudflare Pages Setup Guide

## Manual Update Button Configuration

The "Manual Update" button on the site uses a Cloudflare Pages Function to trigger the GitHub Actions scraper workflow. This requires setting up a GitHub Personal Access Token.

### 1. Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → **Tokens (classic)**
   - Or visit: https://github.com/settings/tokens

2. Click **"Generate new token"** → **"Generate new token (classic)"**

3. Configure the token:
   - **Note**: `HKTVMall Scraper Trigger`
   - **Expiration**: Choose your preferred expiration (e.g., 90 days, 1 year, or no expiration)
   - **Select scopes**: Check **`workflow`** (this allows triggering GitHub Actions workflows)

4. Click **"Generate token"**

5. **Important**: Copy the token immediately - you won't be able to see it again!

### 2. Configure Cloudflare Pages Environment Variables

1. Go to your Cloudflare dashboard
2. Navigate to **Pages** → Select your **HKTVMall** project
3. Go to **Settings** → **Environment variables**
4. Add the following variables:

#### Production Environment:

| Variable Name | Value | Example |
|--------------|-------|---------|
| `GITHUB_TOKEN` | Your GitHub Personal Access Token | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `GITHUB_OWNER` | Your GitHub username | `kenstudenthk` |
| `GITHUB_REPO` | Your repository name | `HKTVMall` |

**Note**: The token must have `workflow` permission scope.

### 3. Redeploy Your Site

After adding the environment variables:
1. Go to **Deployments** tab
2. Click **"Create deployment"** or push a new commit to trigger a deployment
3. The environment variables will be available to the Cloudflare Pages Function

### 4. Test the Manual Update Button

1. Visit your deployed site
2. Click the **"Manual Update"** button in the header
3. You should see a success message: "Scraper workflow triggered successfully!"
4. Check the GitHub Actions tab to verify the workflow started: https://github.com/kenstudenthk/HKTVMall/actions

### Security Notes

- ✅ The GitHub token is stored securely as a Cloudflare environment variable (server-side)
- ✅ The token is never exposed to the frontend/client
- ✅ The API endpoint (`/api/trigger-scraper`) only accepts POST requests
- ✅ CORS headers are configured to prevent unauthorized access
- ⚠️ Keep your token secret - never commit it to the repository
- ⚠️ If the token is compromised, revoke it immediately on GitHub and generate a new one

### Troubleshooting

**Button shows error: "GitHub token not configured"**
- The `GITHUB_TOKEN` environment variable is not set in Cloudflare Pages
- Make sure you added it and redeployed the site

**Button shows error: "GitHub API error: 401"**
- The token is invalid or expired
- Generate a new token and update the `GITHUB_TOKEN` environment variable

**Button shows error: "GitHub API error: 404"**
- The repository or workflow file name is incorrect
- Verify `GITHUB_OWNER` and `GITHUB_REPO` environment variables
- The workflow file must be named `weekly_scrape.yml`

**Workflow doesn't start after clicking the button**
- Check GitHub Actions tab: https://github.com/kenstudenthk/HKTVMall/actions
- The token might not have `workflow` scope - regenerate with correct permissions
- The workflow file might have syntax errors

### API Endpoint

The function creates an endpoint at:
```
POST /api/trigger-scraper
```

This endpoint:
- Triggers the `weekly_scrape.yml` workflow on the `main` branch
- Returns JSON with `success` status and message
- Handles errors gracefully with appropriate HTTP status codes
