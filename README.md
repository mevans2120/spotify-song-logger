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

### Deploy to Vercel

```bash
# First time setup
vercel login
vercel link

# Deploy to production
vercel --prod
```

### Configure Vercel Environment Variables

Add all environment variables from `.env` to your Vercel project:

```bash
vercel env add SPOTIFY_CLIENT_ID
vercel env add SPOTIFY_CLIENT_SECRET
# ... add all other variables
```

Or add them via the Vercel Dashboard under Project Settings → Environment Variables.

### Set Up Cron Job

The cron job is automatically configured in `vercel.json` to run hourly. No additional setup required.

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
