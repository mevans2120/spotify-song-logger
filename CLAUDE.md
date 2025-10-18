# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an automated Spotify song logger that logs every song played for 30+ seconds to a Google Sheet. The system runs hourly on a cloud platform (Vercel or Google Cloud Functions) and captures comprehensive metadata including audio features, playback context, and user interaction data.

## Architecture

### Core Components

The system consists of four main serverless functions:

1. **Main Logging Function** (`/api/log-spotify`): Runs hourly to fetch recent plays, filter for 30+ second plays, and log to Google Sheets
2. **Authentication Handler** (`/api/auth-spotify`): Manages OAuth token refresh for Spotify API
3. **Historical Import** (`/api/import-history`): One-time import of last 50 songs from Spotify
4. **Error Recovery** (`/api/retry-failed`): Processes failed attempts from retry queue

### State Management

Uses Vercel KV/Redis/Upstash for persistent state storage:
- `lastProcessed`: Track ID and timestamp of last logged song
- `failedQueue`: Array of failed attempts with retry counts
- `tokens`: Spotify OAuth tokens with expiration
- `stats`: Run statistics and failure counts

### Data Flow

1. Hourly cron triggers main logging function
2. Authenticate with Spotify and refresh tokens if needed
3. Fetch recently played tracks from Spotify API
4. Filter for plays > 30 seconds by comparing with last logged entry
5. Fetch audio features for each track via separate API call
6. Batch write new entries to Google Sheets "Listening Log" sheet
7. Update state storage with latest processed track
8. On errors, add to retry queue and write placeholder row with ERROR status

## Development Commands

### Local Development
```bash
# Run main logging function locally (manual trigger)
node api/log-spotify.js

# Test Spotify authentication
node api/auth-spotify.js

# Import historical data
node api/import-history.js

# Process retry queue
node api/retry-failed.js
```

### Deployment
```bash
# Deploy to Vercel
vercel deploy

# Deploy to production with environment variables
vercel --prod

# Deploy to Google Cloud Functions
gcloud functions deploy log-spotify --runtime nodejs18 --trigger-http
```

### Testing
```bash
# Test API endpoints locally
npm run dev  # Start local development server
curl http://localhost:3000/api/log-spotify

# Test Spotify API integration
npm run test:spotify

# Test Google Sheets integration
npm run test:sheets
```

## Key Implementation Details

### Spotify API Integration

**Required OAuth Scopes:**
- `user-read-recently-played`
- `user-read-currently-playing`
- `user-read-playback-state`
- `user-read-playback-position`
- `user-library-read`

**Critical Endpoints:**
- `GET /v1/me/player/recently-played` - Fetch recent listening history
- `GET /v1/audio-features/{id}` - Get tempo, energy, danceability, etc.
- `GET /v1/tracks/{id}` - Get track details
- `GET /v1/albums/{id}` - Get album details
- `GET /v1/artists/{id}` - Get artist genres and popularity

**Rate Limits:** 180 requests/minute - use caching and batch requests

### Google Sheets Structure

**Main Sheet:** "Listening Log" with 28 columns including:
- Core metadata: Timestamp, Track Name, Artist(s), Album
- Audio features: Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Speechiness, Loudness
- Playback context: Device, Device Type, Context, Context URI, Shuffle/Repeat state
- Status tracking: Status (COMPLETED/PENDING/ERROR), Error Details

**Service Account:** Requires Editor role on the specific Google Sheet (ID: 1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ)

### Duplicate Detection Logic

Songs are logged as new entries if:
- Track ID differs from last logged track, OR
- Timestamp difference > 30 seconds from last play, OR
- Progress position indicates a new playback session

All plays are logged including repeats - each play gets a new row.

### Error Handling Strategy

**Spotify API Errors:**
- Rate limiting → Exponential backoff
- Auth failure → Refresh token automatically
- 5xx errors → Add to retry queue
- Track not found → Log and skip

**Google Sheets API Errors:**
- Rate limiting → Batch operations (up to 1000 rows)
- Auth failure → Refresh service account credentials
- Network timeout → Add to retry queue

**Recovery Process:**
1. On error, write placeholder row with ERROR status
2. Add to `failedQueue` in state storage
3. Next hourly run processes retry queue first
4. After 3 failed attempts, alert user and skip

## Environment Variables

```bash
# Spotify Configuration
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REFRESH_TOKEN=your_refresh_token
SPOTIFY_REDIRECT_URI=your_redirect_uri

# Google Sheets Configuration
GOOGLE_SHEETS_ID=1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=your_private_key

# State Storage
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token

# Feature Flags
ENABLE_HISTORICAL_IMPORT=true
ENABLE_AUDIO_FEATURES=true
ENABLE_ERROR_RETRY=true
MAX_RETRY_ATTEMPTS=3
```

## Implementation Phases

This project follows a 4-phase implementation plan (see spotify-sheets-logger-spec.md):

1. **Phase 1 - Local Development**: Spotify auth, API wrappers, manual testing
2. **Phase 2 - Google Sheets Integration**: Sheets API, append functionality, deduplication
3. **Phase 3 - Cloud Deployment**: Vercel/GCP setup, cron jobs, KV storage
4. **Phase 4 - Robustness**: Retry queue, historical import, monitoring

Current implementation status should be tracked in code comments or separate STATUS.md file.

## Critical Performance Requirements

- Complete hourly run in < 30 seconds
- Handle 100+ songs per run
- < 1% data loss rate
- 95%+ capture rate for songs played 30+ seconds
- No duplicate logs within same play session

## Memory Bank Plugin

This repository uses the Hybrid Memory Bank Plugin for session tracking and documentation management.

**Key Directories:**
- `.claude-memory/`: Auto-managed JSON storage (git-ignored) for sessions, patterns, and project data
- `memory-bank/`: Git-tracked markdown files (CURRENT.md, progress.md, CHANGELOG.md, ARCHITECTURE.md)

**Available Commands:**
- `/memory show`: Display current session state
- `/memory note <text>`: Add context note for next session
- `/memory end-session`: End session with documentation reminders
- `/memory patterns [type]`: Show learned code patterns
- `/memory tech-stack`: Display project tech stack

The plugin automatically:
- Initializes on session start
- Monitors git status and prompts for memory bank updates
- Archives sessions after 24 hours
- Provides documentation reminders before commits
