# Vercel Deployment Setup Guide

This guide walks you through deploying the Spotify Song Logger to Vercel with serverless functions, KV storage, and automated cron jobs.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- Vercel CLI installed: `npm i -g vercel`
- Completed Sprint 1 & 2 setup (Spotify + Google Sheets credentials)
- Git repository pushed to GitHub

## Step-by-Step Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

Verify installation:
```bash
vercel --version
```

### 2. Login to Vercel

```bash
vercel login
```

Follow the prompts to authenticate with your Vercel account.

### 3. Link Your Project

From your project directory:

```bash
vercel link
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account/team
- **Link to existing project?** → No (first time) or Yes (if already created)
- **What's your project's name?** → `spotify-song-logger` (or your preferred name)
- **In which directory is your code located?** → `./` (current directory)

This creates a `.vercel` directory with project configuration.

### 4. Create Vercel KV Database

#### Via Vercel Dashboard:

1. Go to https://vercel.com/dashboard
2. Select your project: `spotify-song-logger`
3. Go to "Storage" tab
4. Click "Create Database"
5. Select "KV" (Key-Value Store)
6. Name it: `spotify-logger-kv`
7. Select region: Choose closest to your location (e.g., `iad1` for US East)
8. Click "Create"

#### Via Vercel CLI:

```bash
vercel env pull .env.local
```

This will pull your KV credentials to `.env.local`.

### 5. Add Environment Variables

Add all required environment variables to your Vercel project:

```bash
# Spotify Credentials
vercel env add SPOTIFY_CLIENT_ID
vercel env add SPOTIFY_CLIENT_SECRET
vercel env add SPOTIFY_REFRESH_TOKEN
vercel env add SPOTIFY_REDIRECT_URI

# Google Sheets Credentials
vercel env add GOOGLE_SHEETS_ID
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL
vercel env add GOOGLE_PRIVATE_KEY

# Vercel KV Credentials (auto-added when you create KV database)
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
vercel env add KV_REST_API_READ_ONLY_TOKEN

# Feature Flags
vercel env add ENABLE_AUDIO_FEATURES
vercel env add ENABLE_ERROR_RETRY
vercel env add MAX_RETRY_ATTEMPTS
```

When prompted for each variable:
- **What's the value?** → Paste the value from your local `.env` file
- **Add to which environments?** → Select **Production**, **Preview**, and **Development**

**IMPORTANT for GOOGLE_PRIVATE_KEY:**
- The private key must include `\n` characters for line breaks
- Wrap the entire key in quotes when pasting
- Example: `"-----BEGIN PRIVATE KEY-----\nYour\nKey\nHere\n-----END PRIVATE KEY-----\n"`

### 6. Connect KV Database to Project

In the Vercel Dashboard:

1. Go to your project → "Storage" tab
2. Find your KV database
3. Click "Connect to Project"
4. Select your project: `spotify-song-logger`
5. Select environments: **Production**, **Preview**, **Development**
6. Click "Connect"

This automatically adds the KV environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.).

### 7. Deploy to Production

Deploy your application:

```bash
vercel --prod
```

This will:
- Build your project
- Deploy to production
- Set up cron jobs automatically
- Return a production URL (e.g., `https://spotify-song-logger.vercel.app`)

### 8. Verify Deployment

#### Check Function Logs:

```bash
vercel logs --follow
```

#### Manual Test:

Trigger the logging function manually:

```bash
curl https://your-project.vercel.app/api/log-spotify
```

Or visit the URL in your browser.

#### Check Cron Status:

In the Vercel Dashboard:
1. Go to your project
2. Click "Cron Jobs" tab
3. Verify the cron job appears: `/api/log-spotify` running `0 * * * *` (hourly)

### 9. Monitor First Cron Execution

Wait for the top of the next hour and check:

1. **Vercel Logs**: `vercel logs --follow`
2. **Google Sheet**: Verify new rows appeared
3. **Function Logs**: Check for errors in Vercel Dashboard → Logs

## Vercel KV Storage Structure

The KV database stores the following keys:

```
state:lastProcessed    - Last processed track info
state:failedQueue      - Array of failed tracks
state:stats            - Run statistics
spotify:access_token   - Cached Spotify access token (55min TTL)
spotify:token_expiry   - Token expiration timestamp
```

## Environment Variables Reference

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID | `abc123...` |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret | `def456...` |
| `SPOTIFY_REFRESH_TOKEN` | OAuth refresh token | `AQD...` |
| `GOOGLE_SHEETS_ID` | Target Google Sheet ID | `1KEGe1w...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email | `bot@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----\n...` |
| `KV_REST_API_URL` | Vercel KV URL (auto-added) | `https://...` |
| `KV_REST_API_TOKEN` | Vercel KV token (auto-added) | `token_...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_AUDIO_FEATURES` | Fetch audio features | `true` |
| `ENABLE_ERROR_RETRY` | Enable retry queue | `true` |
| `MAX_RETRY_ATTEMPTS` | Max retry attempts | `3` |
| `USE_KV` | Force KV in local dev | `false` |

## Troubleshooting

### Cron Job Not Running

**Check:**
1. Vercel Dashboard → Project → Cron Jobs → Verify job is enabled
2. Check if your plan supports cron jobs (Hobby plan has cron support)
3. Verify `vercel.json` has the cron configuration

**Solution:**
- Redeploy: `vercel --prod`
- Check logs for errors: `vercel logs`

### KV Connection Errors

**Error:** `KV_REST_API_URL is not defined`

**Solution:**
1. Verify KV database is connected to your project
2. Redeploy to refresh environment variables: `vercel --prod`
3. Check environment variables: `vercel env ls`

### Function Timeout

**Error:** `Task timed out after 60 seconds`

**Solution:**
1. Check your execution time in logs
2. Optimize by reducing API calls or using batch operations
3. For free tier, max timeout is 60s (cannot be increased)

### Google Sheets Permission Denied

**Error:** `Permission denied: Service account needs Editor access`

**Solution:**
1. Verify service account email in Vercel env vars matches Google Sheet permissions
2. Re-share the Google Sheet with the service account email
3. Ensure `GOOGLE_PRIVATE_KEY` includes `\n` line breaks

### Spotify Token Expired

**Error:** `Spotify authentication failed`

**Solution:**
1. Check if `SPOTIFY_REFRESH_TOKEN` is correctly set in Vercel
2. Run `node scripts/get-refresh-token.js` locally to get a new refresh token
3. Update Vercel env var: `vercel env add SPOTIFY_REFRESH_TOKEN`
4. Redeploy: `vercel --prod`

## Local Development with Vercel

Test serverless functions locally:

```bash
# Install Vercel CLI globally
npm i -g vercel

# Link project
vercel link

# Pull environment variables
vercel env pull .env.local

# Start local development server
vercel dev
```

Access your functions at:
- `http://localhost:3000/api/log-spotify`
- `http://localhost:3000/api/auth-spotify`

## Production Monitoring

### View Logs in Real-Time

```bash
vercel logs --follow
```

### View Function Execution Stats

In Vercel Dashboard:
1. Go to your project
2. Click "Analytics" tab
3. View function invocations, duration, errors

### Set Up Alerts (Optional)

Vercel Pro plans support alerts for:
- Function errors
- Deployment failures
- Performance degradation

## Updating the Application

### Deploy New Changes

```bash
# Make your code changes
git add .
git commit -m "Your changes"
git push

# Deploy to production
vercel --prod
```

### Update Environment Variables

```bash
# Update a variable
vercel env rm VARIABLE_NAME production
vercel env add VARIABLE_NAME production

# Or update via Vercel Dashboard → Settings → Environment Variables
```

### Rollback a Deployment

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>
```

## Cost Considerations

### Vercel Hobby Plan (Free)
- ✅ Serverless Functions (125k invocations/month)
- ✅ Cron Jobs (unlimited)
- ✅ KV Storage (256 MB free)
- ✅ 100 GB bandwidth
- ⚠️ 60s max function execution time

### Estimated Usage (Hourly Cron)
- **Function invocations**: ~730/month (24 hours × 30 days)
- **KV operations**: ~1,500/month (2 per execution: read + write)
- **Bandwidth**: Minimal (API responses are small JSON)

**Result**: Well within free tier limits ✅

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Rotate tokens regularly** - Update refresh tokens every 90 days
3. **Monitor logs** - Check for unauthorized access attempts
4. **Use read-only tokens** where possible
5. **Enable Vercel Authentication** (Pro feature) for manual endpoints

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
