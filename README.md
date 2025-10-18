# Spotify Song Logger

Automated system that logs every Spotify song played for 30+ seconds to a Google Sheet with comprehensive metadata including audio features, playback context, and user interaction data.

## Features

- **Automatic Logging**: Logs all songs played for 30+ seconds
- **Rich Metadata**: Captures 28 data points including audio features (tempo, energy, danceability, etc.)
- **Hourly Execution**: Runs automatically every hour via serverless cron job
- **Deduplication**: Intelligent filtering prevents duplicate entries
- **Error Recovery**: Retry queue handles temporary API failures
- **Historical Import**: One-time import of last 50 songs from Spotify

## Architecture

- **Platform**: Vercel Functions (serverless)
- **State Storage**: Vercel KV (Redis)
- **APIs**: Spotify Web API, Google Sheets API
- **Runtime**: Node.js 18+

## Prerequisites

Before you begin, ensure you have:

1. **Spotify Developer Account**
   - Create an app at https://developer.spotify.com/dashboard
   - Note your Client ID and Client Secret

2. **Google Cloud Project**
   - Create a project at https://console.cloud.google.com
   - Enable Google Sheets API and Google Drive API
   - Create a Service Account and download JSON key
   - Share your Google Sheet with the service account email (Editor access)

3. **Vercel Account** (for production deployment)
   - Sign up at https://vercel.com
   - Install Vercel CLI: `npm i -g vercel`

4. **Node.js 18+**
   - Download from https://nodejs.org

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/mevans2120/spotify-song-logger.git
cd spotify-song-logger
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback

# Google Sheets
GOOGLE_SHEETS_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Get Spotify Refresh Token

Run the one-time authorization script to obtain your refresh token:

```bash
node scripts/get-refresh-token.js
```

This will:
1. Open your browser for Spotify authorization
2. Redirect back with an authorization code
3. Exchange the code for a refresh token
4. Display the refresh token (add it to your `.env` file)

### 4. Initialize Google Sheet

Set up your Google Sheet with the proper structure:

```bash
node scripts/init-sheets.js
```

### 5. Test Local Logging

Test the complete flow locally:

```bash
npm run test:spotify
```

This will fetch your recent tracks, apply filtering, and display what would be logged (without actually writing to the sheet).

## Project Structure

```
spotify-song-logger/
├── api/                          # Serverless functions
│   ├── log-spotify.js           # Main hourly logging function
│   ├── auth-spotify.js          # Token refresh handler
│   ├── retry-failed.js          # Error recovery processor
│   └── import-history.js        # One-time historical import
├── lib/                          # Shared utilities
│   ├── spotify-auth.js          # Spotify OAuth management
│   ├── spotify-api.js           # Spotify API wrapper
│   ├── sheets-api.js            # Google Sheets API wrapper
│   ├── data-formatter.js        # Data transformation utilities
│   ├── play-filter.js           # 30-second play filtering logic
│   ├── state-manager.js         # State management (KV/local)
│   └── deduplication.js         # Duplicate detection
├── scripts/                      # Utility scripts
│   ├── get-refresh-token.js     # One-time Spotify auth
│   ├── init-sheets.js           # Initialize Google Sheets structure
│   ├── test-local-logging.js    # Local testing script
│   └── migrate-state-to-kv.js   # Migrate local state to KV
├── tests/                        # Test files
├── config/                       # Configuration files
├── .state/                       # Local state storage (dev only)
├── .env                         # Environment variables (not committed)
├── .env.example                 # Environment template
└── vercel.json                  # Vercel deployment config
```

## Development

### Run Local Tests

```bash
# Test Spotify API integration
npm run test:spotify

# Test Google Sheets integration
npm run test:sheets

# Run all tests
npm test
```

### Local Development Server

```bash
# Start Vercel development server
npm run dev

# Manually trigger logging
curl http://localhost:3000/api/log-spotify
```

## Deployment

This application is designed to run as a serverless application on Vercel with hourly cron execution. Follow these steps to deploy to production.

> **📘 Full Deployment Guide**: See [docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md) for the complete step-by-step guide including screenshots and troubleshooting.

### Prerequisites for Deployment

1. Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed: `npm i -g vercel`
3. Completed local setup (Spotify + Google Sheets credentials)
4. Git repository pushed to GitHub

### Quick Deployment Steps

#### 1. Install and Login to Vercel CLI

```bash
npm install -g vercel
vercel login
```

#### 2. Link Your Project

```bash
vercel link
```

When prompted:
- **What's your project's name?** → `spotify-song-logger`
- **In which directory is your code located?** → `./`

#### 3. Create Vercel KV Database

**Via Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Select your project
3. Navigate to "Storage" tab
4. Click "Create Database" → Select "KV"
5. Name: `spotify-logger-kv`
6. Region: Choose closest to you (e.g., `iad1` for US East)

**Via CLI:**
```bash
vercel env pull .env.local
```

#### 4. Add Environment Variables

Add all required environment variables to Vercel:

```bash
# Spotify Credentials
vercel env add SPOTIFY_CLIENT_ID
vercel env add SPOTIFY_CLIENT_SECRET
vercel env add SPOTIFY_REFRESH_TOKEN

# Google Sheets Credentials
vercel env add GOOGLE_SHEETS_ID
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL
vercel env add GOOGLE_PRIVATE_KEY

# Vercel KV Credentials (auto-added when you create KV database)
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN

# Optional: Feature Flags
vercel env add ENABLE_AUDIO_FEATURES
vercel env add ENABLE_ERROR_RETRY
vercel env add MAX_RETRY_ATTEMPTS
```

**Important**: When prompted, select **Production**, **Preview**, and **Development** for each variable.

**GOOGLE_PRIVATE_KEY** must include `\n` for line breaks:
```
"-----BEGIN PRIVATE KEY-----\nYour\nKey\nHere\n-----END PRIVATE KEY-----\n"
```

#### 5. Connect KV Database to Project

In Vercel Dashboard:
1. Go to your project → "Storage" tab
2. Find your KV database
3. Click "Connect to Project"
4. Select all environments (Production, Preview, Development)

#### 6. Deploy to Production

```bash
vercel --prod
```

This will:
- Build and deploy your application
- Set up hourly cron job automatically
- Return your production URL (e.g., `https://spotify-song-logger.vercel.app`)

#### 7. Verify Deployment

**Manual Test:**
```bash
curl https://your-project.vercel.app/api/log-spotify
```

**Check Logs:**
```bash
vercel logs --follow
```

**Verify Cron Job:**
1. Vercel Dashboard → Your Project → "Cron Jobs" tab
2. Verify job appears: `/api/log-spotify` running `0 * * * *` (hourly)

**Test Authentication:**
```bash
curl https://your-project.vercel.app/api/auth-spotify
```

### Local Development with Vercel

Test serverless functions locally before deploying:

```bash
# Link project and pull environment variables
vercel link
vercel env pull .env.local

# Start local development server
vercel dev
```

Access functions at:
- `http://localhost:3000/api/log-spotify`
- `http://localhost:3000/api/auth-spotify`

### Post-Deployment Monitoring

**View Real-Time Logs:**
```bash
vercel logs --follow
```

**Check Function Execution:**
- Vercel Dashboard → Your Project → "Analytics" tab
- View invocations, duration, errors

**Monitor Google Sheet:**
- Verify new rows appear hourly
- Check "System Logs" sheet for errors

**Inspect State Storage:**
```bash
# Access Vercel KV via dashboard or CLI
vercel env ls
```

### Updating the Application

**Deploy New Changes:**
```bash
git add .
git commit -m "Your changes"
git push

vercel --prod
```

**Update Environment Variables:**
```bash
# Remove old variable
vercel env rm VARIABLE_NAME production

# Add new value
vercel env add VARIABLE_NAME production
```

Or update via Vercel Dashboard → Settings → Environment Variables.

**Rollback Deployment:**
```bash
# List recent deployments
vercel ls

# Promote previous deployment to production
vercel promote <deployment-url>
```

### Cost Considerations (Vercel Hobby Plan - Free)

**Included:**
- ✅ Serverless Functions (125k invocations/month)
- ✅ Cron Jobs (unlimited)
- ✅ KV Storage (256 MB free)
- ✅ 100 GB bandwidth
- ⚠️ 60s max function execution time

**Estimated Monthly Usage (Hourly Cron):**
- Function invocations: ~730/month (24 × 30 days)
- KV operations: ~1,500/month
- Bandwidth: Minimal

**Result**: Well within free tier limits ✅

### Deployment Troubleshooting

**Cron Job Not Running:**
- Check Vercel Dashboard → Cron Jobs → Verify enabled
- Redeploy: `vercel --prod`
- Check logs: `vercel logs`

**KV Connection Errors:**
```
Error: KV_REST_API_URL is not defined
```
**Solution:**
1. Verify KV database is connected to project
2. Redeploy: `vercel --prod`
3. Check env vars: `vercel env ls`

**Function Timeout (60s limit):**
- Optimize API calls (use batch operations)
- Reduce SPOTIFY_FETCH_LIMIT (default: 50)
- Consider upgrading Vercel plan for longer timeouts

**See [docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md) for more detailed troubleshooting.**

## Google Sheet Structure

The sheet contains three tabs:

### 1. Listening Log (28 columns)
Main log with all song plays:
- Core: Timestamp, Track Name, Artist(s), Album, Duration, Play Duration, Completion %
- IDs: Track ID, Album ID, Artist ID(s)
- Audio Features: Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Speechiness, Loudness
- Context: Device, Device Type, Context, Context URI, Shuffle State, Repeat State
- Metadata: Genres, Popularity, Explicit, Release Date
- Status: Status (COMPLETED/ERROR), Error Details

### 2. Historical Data
One-time import of last 50 songs (same structure as Listening Log + import timestamp)

### 3. System Logs
Operational logs for monitoring and debugging:
- Timestamp, Log Level, Event Type, Details, Retry Count, Resolution Time, Affected Tracks

## API Endpoints

### `/api/log-spotify`
Main logging function (triggered hourly by cron)
- **Method**: GET/POST
- **Returns**: `{ success: boolean, tracksLogged: number, duration: number }`

### `/api/auth-spotify`
Refresh Spotify access token
- **Method**: GET
- **Returns**: `{ accessToken: string, expiresIn: number }`

### `/api/retry-failed`
Process failed attempts from retry queue
- **Method**: GET/POST
- **Returns**: `{ retriedCount: number, successCount: number }`

### `/api/import-history`
One-time import of last 50 songs
- **Method**: POST
- **Returns**: `{ imported: number, skipped: number }`

## Troubleshooting

### "Invalid refresh token" error
- Re-run `node scripts/get-refresh-token.js` to get a new refresh token
- Update `SPOTIFY_REFRESH_TOKEN` in your `.env` file

### "Permission denied" on Google Sheets
- Verify service account email has Editor access to the sheet
- Check that Google Sheets API is enabled in your Google Cloud Project
- Ensure `GOOGLE_PRIVATE_KEY` includes the `\n` line breaks

### No songs being logged
- Check that you're playing songs for at least 30 seconds
- Verify cron job is running in Vercel dashboard
- Check System Logs sheet for error messages

### Duplicate entries
- This usually indicates state management issues
- Check that KV storage is properly configured
- Review deduplication logic in System Logs

## Monitoring

### View Logs
- Vercel Dashboard → Your Project → Logs
- Check "System Logs" sheet in Google Sheets
- Review failed queue: inspect KV storage via Vercel CLI

### Metrics
Access metrics via `/api/metrics` endpoint (requires authentication in production)

### Alerts
Configure alert delivery in environment variables:
```env
ALERT_EMAIL=your-email@example.com
SENDGRID_API_KEY=your_key
SLACK_WEBHOOK_URL=your_webhook
ENABLE_ALERTS=true
```

## Contributing

See [SPRINT_PLAN.md](SPRINT_PLAN.md) for development roadmap and task breakdown.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Issues: https://github.com/mevans2120/spotify-song-logger/issues
- Documentation: See CLAUDE.md for detailed architecture notes
- Runbook: See RUNBOOK.md for operational procedures (created in Sprint 4)

## Acknowledgments

Built with:
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
