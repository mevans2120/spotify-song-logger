# Spotify Song Logger - Sprint Plan

## Executive Summary

This sprint plan breaks down the Spotify Song Logger implementation into 4 focused sprints over 4 weeks. Each sprint builds upon the previous one, following a progression from local development through production deployment with robustness features. The plan accounts for dependencies, risk mitigation, and includes clear acceptance criteria for each task.

**Total Duration:** 4 weeks (4 sprints)
**Team Size:** 1 developer
**Deployment Target:** Vercel Functions with KV storage
**Success Metrics:** 95%+ capture rate, <30s execution time, 99% uptime

---

## Sprint Structure Overview

| Sprint | Focus Area | Duration | Key Deliverables |
|--------|-----------|----------|------------------|
| Sprint 1 | Local Development & Spotify Integration | Week 1 (5 days) | Working Spotify API wrapper, local data fetching |
| Sprint 2 | Google Sheets Integration | Week 2 (5 days) | End-to-end local logging to Sheets |
| Sprint 3 | Cloud Deployment | Week 3 (5 days) | Production serverless functions on Vercel |
| Sprint 4 | Robustness & Monitoring | Week 4 (5 days) | Error handling, retry queue, monitoring |

---

## Sprint 1: Local Development & Spotify Integration

**Sprint Goal:** Establish foundation with Spotify API authentication and data retrieval working locally

**Duration:** 5 days

**Dependencies:** None (Starting point)

**Risks:**
- OAuth flow complexity → Mitigation: Use refresh token flow, not full OAuth
- API rate limits during testing → Mitigation: Implement caching early
- Incomplete Spotify API understanding → Mitigation: Test with real data early

### Tasks

#### Task 1.1: Project Setup and Environment Configuration
**Priority:** Must Have
**Estimated Effort:** 2 hours
**Assignee:** Developer

**Description:**
Set up the project structure, initialize npm, and configure environment variables for local development.

**Acceptance Criteria:**
- [ ] Project directory structure created:
  - `/api` - Serverless function handlers
  - `/lib` - Shared utilities and wrappers
  - `/config` - Configuration files
  - `/tests` - Test files
- [ ] `.env` file template created with all required variables
- [ ] `.gitignore` configured to exclude secrets
- [ ] `package.json` initialized with dependencies:
  - `axios` or `node-fetch` for API calls
  - `dotenv` for environment variables
  - `googleapis` for Sheets API
  - `@vercel/kv` for state storage (added in Sprint 3)
- [ ] README.md created with setup instructions
- [ ] Environment variables documented in `.env.example`

**Dependencies:** None

**Deliverables:**
- Working project structure
- Dependency manifest
- Environment configuration template

---

#### Task 1.2: Spotify OAuth Token Management
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Implement Spotify OAuth flow to obtain and refresh access tokens. Create a one-time authorization script to get the initial refresh token.

**Acceptance Criteria:**
- [ ] `/lib/spotify-auth.js` module created with functions:
  - `getAccessToken()` - Returns valid access token
  - `refreshAccessToken()` - Refreshes expired token
  - `isTokenExpired()` - Checks token validity
- [ ] One-time authorization script (`/scripts/get-refresh-token.js`) that:
  - Opens browser for Spotify authorization
  - Handles callback with authorization code
  - Exchanges code for refresh token
  - Saves refresh token to environment
- [ ] Token expiration handling with automatic refresh
- [ ] Error handling for auth failures
- [ ] Manual test: Successfully obtain access token
- [ ] Manual test: Token refresh works before expiration

**Dependencies:** Task 1.1

**Deliverables:**
- `lib/spotify-auth.js`
- `scripts/get-refresh-token.js`
- Initial refresh token in `.env`

**Technical Notes:**
```javascript
// Required OAuth scopes
const SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-playback-position',
  'user-library-read'
];
```

---

#### Task 1.3: Spotify API Wrapper - Recently Played
**Priority:** Must Have
**Estimated Effort:** 6 hours
**Assignee:** Developer

**Description:**
Create wrapper functions for Spotify API endpoints to fetch recently played tracks with all required metadata.

**Acceptance Criteria:**
- [ ] `/lib/spotify-api.js` module created with functions:
  - `getRecentlyPlayed(limit, after)` - Fetch recent tracks
  - `getCurrentlyPlaying()` - Get current playback state
  - `getTrackDetails(trackId)` - Get full track metadata
  - `getAudioFeatures(trackId)` - Get audio analysis
  - `getArtistDetails(artistId)` - Get artist info including genres
  - `getAlbumDetails(albumId)` - Get album metadata
- [ ] Proper error handling with retry logic for:
  - Rate limiting (429 errors)
  - Server errors (5xx)
  - Network failures
- [ ] Response data transformation to match Google Sheets schema
- [ ] Caching implemented for track/artist/album details
- [ ] Manual test: Fetch last 10 played tracks with full metadata
- [ ] Manual test: Handle rate limiting gracefully

**Dependencies:** Task 1.2

**Deliverables:**
- `lib/spotify-api.js`
- Test script demonstrating API calls

**Technical Notes:**
- Use batch requests where possible to minimize API calls
- Cache audio features, artist genres, and album data for 24 hours
- Implement exponential backoff for rate limit errors

---

#### Task 1.4: Data Transformation and Formatting
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Create utilities to transform Spotify API responses into the standardized format needed for Google Sheets logging.

**Acceptance Criteria:**
- [ ] `/lib/data-formatter.js` module created with:
  - `formatTrackForLogging(track, playbackInfo, audioFeatures)` - Combines all data sources
  - `extractPlaybackContext(playbackInfo)` - Gets device, context, shuffle/repeat state
  - `calculatePlayDuration(track, playbackInfo)` - Determines actual play time
  - `formatTimestamp(isoString)` - Standardizes timestamp format
- [ ] All 28 required fields mapped correctly:
  - Core: Timestamp, Track Name, Artist(s), Album, Duration
  - Audio Features: Tempo, Energy, Danceability, Valence, etc.
  - Context: Device, Device Type, Context, Context URI
  - Status: Status, Error Details
- [ ] Handle edge cases:
  - Multiple artists (comma-separated)
  - Missing audio features (default values)
  - Null context information
  - Podcasts vs music tracks
- [ ] Unit tests for data formatting functions
- [ ] Manual test: Format sample track data correctly

**Dependencies:** Task 1.3

**Deliverables:**
- `lib/data-formatter.js`
- Unit tests for formatters
- Sample formatted data output

---

#### Task 1.5: 30-Second Play Filter Logic
**Priority:** Must Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Implement logic to filter tracks that were played for at least 30 seconds, avoiding duplicates while capturing all legitimate plays.

**Acceptance Criteria:**
- [ ] `/lib/play-filter.js` module created with:
  - `filterNewPlays(recentTracks, lastProcessedState)` - Returns only new 30+ second plays
  - `isValidPlay(track, minDuration = 30000)` - Checks if play qualifies for logging
  - `calculateActualPlayTime(track)` - Determines cumulative play time
- [ ] Duplicate detection logic:
  - Compare track ID with last logged track
  - Check timestamp difference (>30 seconds = new play)
  - Use progress position to detect restarts
- [ ] Handle edge cases:
  - Same song played multiple times in a row
  - Paused and resumed playback
  - Track scrubbing/seeking
- [ ] Unit tests for filter logic
- [ ] Manual test: Correctly identify 5 new plays from 10 recent tracks

**Dependencies:** Task 1.4

**Deliverables:**
- `lib/play-filter.js`
- Unit tests with edge cases
- Test data demonstrating filter logic

---

#### Task 1.6: Local Console Logger Script
**Priority:** Should Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Create a manual execution script that fetches recent tracks and logs formatted data to the console for testing and validation.

**Acceptance Criteria:**
- [ ] `/scripts/test-local-logging.js` script created that:
  - Authenticates with Spotify
  - Fetches recently played tracks
  - Applies 30-second filter
  - Enriches with audio features
  - Formats data for logging
  - Displays in readable console format
- [ ] Colored console output for readability
- [ ] Summary statistics displayed (e.g., "Found 5 new plays out of 20 recent tracks")
- [ ] Error handling with helpful messages
- [ ] Execution time logged
- [ ] Manual test: Run script and verify output matches Spotify history

**Dependencies:** Tasks 1.2-1.5

**Deliverables:**
- `scripts/test-local-logging.js`
- Console output example
- Execution instructions in README

**Technical Notes:**
```bash
# Usage
node scripts/test-local-logging.js --limit 20 --verbose
```

---

### Sprint 1 Definition of Done

- [ ] All Spotify API endpoints successfully called
- [ ] Authentication flow working with automatic token refresh
- [ ] Data formatting produces all 28 required fields
- [ ] 30-second play filter correctly identifies new plays
- [ ] Local console script demonstrates end-to-end flow
- [ ] Unit tests written for core functions
- [ ] Code reviewed and documented
- [ ] README updated with setup and testing instructions

### Sprint 1 Retrospective Points

- What worked well with Spotify API integration?
- Any rate limiting issues encountered?
- Is the data format complete and accurate?
- Code quality and maintainability assessment

---

## Sprint 2: Google Sheets Integration

**Sprint Goal:** Enable automated writing of formatted track data to Google Sheets with deduplication and error handling

**Duration:** 5 days

**Dependencies:** Completed Sprint 1

**Risks:**
- Google Service Account permissions → Mitigation: Test permissions early with manual API calls
- Sheets API rate limits → Mitigation: Implement batching from the start
- Data type mismatches in Sheets → Mitigation: Explicit type coercion in append operations

### Tasks

#### Task 2.1: Google Service Account Setup
**Priority:** Must Have
**Estimated Effort:** 2 hours
**Assignee:** Developer

**Description:**
Create and configure a Google Service Account with proper permissions for the Google Sheets API.

**Acceptance Criteria:**
- [ ] Google Cloud Project created or identified
- [ ] Service Account created with descriptive name
- [ ] Service Account key (JSON) downloaded and secured
- [ ] Google Sheets API enabled for the project
- [ ] Google Drive API enabled for the project (for sheet creation)
- [ ] Service Account email granted Editor access to target Google Sheet (ID: 1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ)
- [ ] Service Account credentials added to `.env` file:
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
  - `GOOGLE_SHEETS_ID`
- [ ] Manual test: Access sheet via API using service account

**Dependencies:** None (can start immediately)

**Deliverables:**
- Service Account JSON key file (not committed to git)
- Updated `.env.example` with Google credentials
- Documentation in README for service account setup

**Security Notes:**
- Never commit service account key to version control
- Store key in environment variable or secure secret manager
- Rotate key every 90 days

---

#### Task 2.2: Google Sheets API Wrapper
**Priority:** Must Have
**Estimated Effort:** 6 hours
**Assignee:** Developer

**Description:**
Create wrapper functions for Google Sheets API operations needed for logging tracks.

**Acceptance Criteria:**
- [ ] `/lib/sheets-api.js` module created with functions:
  - `initSheetsClient()` - Initialize authenticated Sheets API client
  - `appendRows(sheetName, values)` - Append rows to specified sheet
  - `batchAppendRows(sheetName, values)` - Batch append up to 1000 rows
  - `getLastNRows(sheetName, n)` - Retrieve recent rows for deduplication
  - `updateRow(sheetName, rowIndex, values)` - Update specific row (for error recovery)
  - `createSheetIfNotExists(sheetName, headers)` - Initialize new sheet with headers
- [ ] Proper error handling for:
  - Authentication failures
  - Permission errors
  - Rate limiting (exponential backoff)
  - Network timeouts
  - Sheet not found
- [ ] Use `USER_ENTERED` value input option for proper formatting
- [ ] Batch operations implemented to minimize API calls
- [ ] Manual test: Append test row to "Listening Log" sheet
- [ ] Manual test: Retrieve last 5 rows successfully

**Dependencies:** Task 2.1

**Deliverables:**
- `lib/sheets-api.js`
- Test script for Sheets operations
- Error handling documentation

**Technical Notes:**
```javascript
// Use batching for performance
const valueRange = {
  range: 'Listening Log!A:AB',
  values: rows,
  majorDimension: 'ROWS'
};

await sheets.spreadsheets.values.append({
  spreadsheetId: GOOGLE_SHEETS_ID,
  range: 'Listening Log!A:AB',
  valueInputOption: 'USER_ENTERED',
  resource: valueRange
});
```

---

#### Task 2.3: Sheet Schema Initialization
**Priority:** Must Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Create utility to initialize Google Sheets with proper headers and formatting for all three sheets (Listening Log, Historical Data, System Logs).

**Acceptance Criteria:**
- [ ] `/scripts/init-sheets.js` script created that:
  - Creates "Listening Log" sheet with 28 column headers
  - Creates "Historical Data" sheet with same structure + import timestamp
  - Creates "System Logs" sheet with 7 column headers
  - Applies header formatting (bold, frozen row)
  - Sets column widths for readability
  - Applies data validation where appropriate
- [ ] Headers match specification exactly:
  - Listening Log: Timestamp, Track Name, Artist(s), Album, Duration (ms), Play Duration (ms), Completion %, Track ID, Album ID, Artist ID(s), Genres, Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Speechiness, Loudness, Popularity, Device, Device Type, Context, Context URI, Explicit, Release Date, Status, Error Details
  - System Logs: Timestamp, Log Level, Event Type, Details, Retry Count, Resolution Time, Affected Tracks
- [ ] Number columns formatted as numbers (not text)
- [ ] Percentage columns formatted with % symbol
- [ ] Date columns formatted as dates
- [ ] Manual test: Run init script and verify sheet structure

**Dependencies:** Task 2.2

**Deliverables:**
- `scripts/init-sheets.js`
- Initialized Google Sheet with proper structure
- Documentation for sheet structure

---

#### Task 2.4: State Management Module (Local File)
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Create a local file-based state management system to track the last processed track and prevent duplicates. This will be replaced with KV storage in Sprint 3.

**Acceptance Criteria:**
- [ ] `/lib/state-manager.js` module created with functions:
  - `loadState()` - Load state from local JSON file
  - `saveState(state)` - Save state to local JSON file
  - `getLastProcessed()` - Get last processed track info
  - `updateLastProcessed(track)` - Update last processed track
  - `addToFailedQueue(track, error)` - Add failed attempt to queue
  - `getFailedQueue()` - Retrieve pending retries
  - `clearFromFailedQueue(trackId)` - Remove successful retry
- [ ] State file structure matches specification:
  ```json
  {
    "lastProcessed": {
      "trackId": "string",
      "timestamp": "ISO 8601",
      "playedAt": "ISO 8601"
    },
    "failedQueue": [],
    "stats": {
      "lastRun": "ISO 8601",
      "successCount": 0,
      "failureCount": 0
    }
  }
  ```
- [ ] Thread-safe read/write operations
- [ ] Backup mechanism (keep previous state)
- [ ] Manual test: Save and retrieve state successfully

**Dependencies:** None (can run in parallel with Tasks 2.1-2.3)

**Deliverables:**
- `lib/state-manager.js`
- `.state/` directory (git-ignored)
- State file schema documentation

**Technical Notes:**
- Use `fs.promises` for async file operations
- Store state in `.state/logger-state.json`
- Create backup as `.state/logger-state.backup.json`

---

#### Task 2.5: Deduplication Logic
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Implement logic to prevent duplicate logging of the same play session while allowing repeat plays of the same song.

**Acceptance Criteria:**
- [ ] `/lib/deduplication.js` module created with:
  - `isDuplicate(track, lastProcessed)` - Check if track is duplicate
  - `findLastProcessedInSheet(sheetRows)` - Extract last logged track from sheet
  - `reconcileState(sheetData, localState)` - Sync state if mismatch detected
- [ ] Duplicate detection rules:
  - Same track ID AND timestamp within 30 seconds = duplicate
  - Same track ID AND same progress position = duplicate
  - Same track ID BUT 30+ seconds apart = new play (log it)
- [ ] State reconciliation if local state and sheet diverge
- [ ] Unit tests covering:
  - Same song played twice with 5-minute gap (should log both)
  - Same song resumed after pause (should not duplicate)
  - Rapid skipping and replaying (should log correctly)
- [ ] Manual test: Verify no duplicates when running script twice

**Dependencies:** Tasks 2.2, 2.4

**Deliverables:**
- `lib/deduplication.js`
- Unit tests for deduplication logic
- Test cases documenting edge case behavior

---

#### Task 2.6: End-to-End Local Logger
**Priority:** Must Have
**Estimated Effort:** 5 hours
**Assignee:** Developer

**Description:**
Create a complete local logging script that fetches tracks from Spotify, filters new plays, and writes to Google Sheets with deduplication.

**Acceptance Criteria:**
- [ ] `/scripts/run-local-logger.js` script created with complete flow:
  1. Load state from local file
  2. Authenticate with Spotify
  3. Fetch recently played tracks
  4. Filter for 30+ second plays not in last processed state
  5. Enrich with audio features and metadata
  6. Format for Google Sheets
  7. Check for duplicates against sheet data
  8. Append new rows to "Listening Log" sheet
  9. Update state with last processed track
  10. Log summary to console and "System Logs" sheet
- [ ] Execution time tracking and logging
- [ ] Detailed console output with progress indicators
- [ ] Error handling with graceful failures:
  - Continue processing other tracks if one fails
  - Write ERROR status rows for failures
  - Add failed tracks to retry queue
- [ ] Dry-run mode (`--dry-run` flag) to preview without writing
- [ ] Manual test: Run script 3 times, verify no duplicates and all new plays logged

**Dependencies:** All Sprint 2 tasks

**Deliverables:**
- `scripts/run-local-logger.js`
- Execution logs demonstrating successful runs
- Updated README with usage instructions

**Technical Notes:**
```bash
# Usage examples
node scripts/run-local-logger.js                    # Normal execution
node scripts/run-local-logger.js --dry-run          # Preview mode
node scripts/run-local-logger.js --verbose          # Detailed logging
node scripts/run-local-logger.js --limit 50         # Process last 50 tracks
```

---

#### Task 2.7: Error Placeholder Row Implementation
**Priority:** Should Have
**Estimated Effort:** 2 hours
**Assignee:** Developer

**Description:**
Implement functionality to write placeholder rows with ERROR status when track processing fails, ensuring no data loss.

**Acceptance Criteria:**
- [ ] Function `writeErrorPlaceholder(track, error)` created that:
  - Writes row with available data (timestamp, track ID, basic metadata)
  - Sets Status column to "ERROR"
  - Writes error message to Error Details column
  - Fills missing fields with "PENDING" or null
- [ ] Error details include:
  - Error type (Spotify API, Sheets API, etc.)
  - Error message
  - Timestamp of failure
  - Retry count
- [ ] Failed track added to retry queue in state
- [ ] Manual test: Force an error and verify placeholder row written
- [ ] Manual test: Verify error row can be updated when retry succeeds

**Dependencies:** Tasks 2.2, 2.4, 2.6

**Deliverables:**
- Error placeholder functionality in `lib/sheets-api.js`
- Test demonstrating error row creation
- Documentation for error row format

---

### Sprint 2 Definition of Done

- [ ] Google Sheets successfully receive track data
- [ ] All 28 columns populated correctly for normal plays
- [ ] Deduplication prevents duplicate logging
- [ ] Error rows written when processing fails
- [ ] Local state management working reliably
- [ ] End-to-end local script runs successfully
- [ ] Manual testing confirms accuracy against Spotify history
- [ ] Documentation complete for setup and usage

### Sprint 2 Retrospective Points

- Google Sheets API reliability assessment
- Deduplication logic effectiveness
- Error handling coverage
- Performance with batch operations

---

## Sprint 3: Cloud Deployment

**Sprint Goal:** Deploy fully functional serverless application on Vercel with automated hourly execution and cloud-based state management

**Duration:** 5 days

**Dependencies:** Completed Sprint 2

**Risks:**
- Vercel function cold start latency → Mitigation: Optimize function size, pre-warm if needed
- KV storage latency → Mitigation: Implement caching, minimize reads/writes
- Cron reliability → Mitigation: Add monitoring and manual trigger fallback
- Environment variable security → Mitigation: Use Vercel encrypted environment variables

### Tasks

#### Task 3.1: Vercel Project Setup
**Priority:** Must Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Initialize Vercel project, configure deployment settings, and set up environment variables in Vercel dashboard.

**Acceptance Criteria:**
- [ ] Vercel account created or accessed
- [ ] Project created via Vercel CLI or dashboard
- [ ] Git repository connected to Vercel (optional, for auto-deploy)
- [ ] `vercel.json` configuration file created with:
  - Function region specification
  - Function timeout (max 60s for free tier)
  - Environment variable references
  - Cron job schedule
- [ ] All environment variables added to Vercel project settings:
  - Spotify credentials (encrypted)
  - Google Service Account credentials (encrypted)
  - Google Sheets ID
  - KV credentials (added in Task 3.2)
- [ ] Development, preview, and production environments configured
- [ ] Manual test: Deploy hello-world function successfully

**Dependencies:** None (can start immediately)

**Deliverables:**
- `vercel.json` configuration
- Deployed test function
- Documentation for Vercel setup

**Technical Notes:**
```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 60
    }
  },
  "crons": [{
    "path": "/api/log-spotify",
    "schedule": "0 * * * *"
  }]
}
```

---

#### Task 3.2: Vercel KV Storage Setup
**Priority:** Must Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Set up Vercel KV (Redis-compatible) storage for state management, replacing local file-based state.

**Acceptance Criteria:**
- [ ] Vercel KV database created in Vercel dashboard
- [ ] KV credentials added to environment variables:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
  - `KV_REST_API_READ_ONLY_TOKEN`
- [ ] `@vercel/kv` package added to dependencies
- [ ] KV connection tested locally using Vercel CLI
- [ ] Manual test: Write and read data from KV successfully
- [ ] Manual test: Verify data persistence across function invocations

**Dependencies:** Task 3.1

**Deliverables:**
- Configured KV database
- KV credentials in Vercel
- Test script for KV operations

**Technical Notes:**
```javascript
import { kv } from '@vercel/kv';

// Simple API
await kv.set('key', value);
const value = await kv.get('key');
```

---

#### Task 3.3: Migrate State Manager to KV
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Refactor state management module to use Vercel KV instead of local file storage, maintaining the same API interface.

**Acceptance Criteria:**
- [ ] `/lib/state-manager.js` updated to use KV with functions:
  - `loadState()` - Load state from KV
  - `saveState(state)` - Save state to KV
  - `getLastProcessed()` - Get last processed track from KV
  - `updateLastProcessed(track)` - Update in KV
  - `addToFailedQueue(track, error)` - Add to KV queue
  - `getFailedQueue()` - Retrieve from KV
  - `clearFromFailedQueue(trackId)` - Remove from KV
- [ ] Fallback to local storage for local development (detect environment)
- [ ] Atomic operations for queue management (prevent race conditions)
- [ ] TTL not set (data should persist indefinitely)
- [ ] Migration script to transfer local state to KV
- [ ] Manual test: State persists across Vercel function invocations
- [ ] Manual test: Concurrent access doesn't corrupt state

**Dependencies:** Task 3.2

**Deliverables:**
- Updated `lib/state-manager.js` with KV support
- Migration script `scripts/migrate-state-to-kv.js`
- Environment detection logic

**Technical Notes:**
```javascript
// Detect environment
const isProduction = process.env.VERCEL_ENV === 'production';
const useKV = isProduction || process.env.USE_KV === 'true';
```

---

#### Task 3.4: Main Logging Serverless Function
**Priority:** Must Have
**Estimated Effort:** 6 hours
**Assignee:** Developer

**Description:**
Create the primary serverless function that runs hourly to log recent Spotify plays to Google Sheets.

**Acceptance Criteria:**
- [ ] `/api/log-spotify.js` serverless function created with:
  - HTTP handler that can be triggered by cron or manual request
  - Complete logging flow from Sprint 2
  - Response with execution summary (tracks logged, errors, duration)
  - Proper HTTP status codes (200 success, 500 error)
- [ ] Function optimized for cold start:
  - Dependencies imported only when needed
  - Connection pooling for API clients
  - Minimal initialization code
- [ ] Execution time tracking and logging
- [ ] Error handling with proper HTTP responses
- [ ] Memory and timeout optimization (target <30s execution, <256MB memory)
- [ ] Manual test: Trigger function via URL and verify sheet update
- [ ] Manual test: Function completes in <30 seconds

**Dependencies:** Task 3.3

**Deliverables:**
- `/api/log-spotify.js`
- Function performance metrics
- API documentation (endpoint, parameters, responses)

**Technical Notes:**
```javascript
// Vercel serverless function format
export default async function handler(req, res) {
  try {
    const startTime = Date.now();

    // Logging logic here

    const duration = Date.now() - startTime;
    res.status(200).json({
      success: true,
      tracksLogged: count,
      duration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

---

#### Task 3.5: Authentication Serverless Function
**Priority:** Must Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Create a serverless function to handle Spotify token refresh, callable by other functions or as a standalone endpoint.

**Acceptance Criteria:**
- [ ] `/api/auth-spotify.js` serverless function created with:
  - Token refresh logic from Sprint 1
  - Token storage in KV with expiration
  - Response with new access token and expiry
  - Error handling for auth failures
- [ ] Function can be called internally by other functions
- [ ] Function can be triggered manually via HTTP for debugging
- [ ] Token cached in KV with 55-minute TTL (tokens expire in 60 minutes)
- [ ] Automatic refresh when token within 5 minutes of expiration
- [ ] Manual test: Refresh token via endpoint
- [ ] Manual test: Verify token cached and reused

**Dependencies:** Tasks 3.2, 3.3

**Deliverables:**
- `/api/auth-spotify.js`
- Token caching logic
- Testing instructions

**Technical Notes:**
- Store token in KV with key: `spotify:access_token`
- Store expiry in KV with key: `spotify:token_expiry`

---

#### Task 3.6: Cron Job Configuration
**Priority:** Must Have
**Estimated Effort:** 2 hours
**Assignee:** Developer

**Description:**
Configure Vercel Cron Jobs to trigger the main logging function every hour automatically.

**Acceptance Criteria:**
- [ ] Cron job defined in `vercel.json`:
  - Schedule: Every hour (`0 * * * *`)
  - Target: `/api/log-spotify` endpoint
  - Timezone: UTC
- [ ] Cron job verified in Vercel dashboard
- [ ] Execution logs visible in Vercel dashboard
- [ ] Manual test: Wait for scheduled execution and verify sheet update
- [ ] Manual test: Check execution logs for errors
- [ ] Backup cron configuration documented (GitHub Actions as fallback)

**Dependencies:** Task 3.4

**Deliverables:**
- Configured cron job in `vercel.json`
- Monitoring dashboard access
- Fallback cron documentation

**Technical Notes:**
```json
{
  "crons": [
    {
      "path": "/api/log-spotify",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

#### Task 3.7: Production Deployment and Testing
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Deploy the complete application to Vercel production and conduct end-to-end testing over 24 hours.

**Acceptance Criteria:**
- [ ] Application deployed to production via Vercel CLI or dashboard
- [ ] Production environment variables verified
- [ ] All API endpoints accessible and functional
- [ ] Cron job running hourly successfully
- [ ] 24-hour monitoring period with checks:
  - Minimum 20 hourly executions successful
  - No missed cron triggers
  - Tracks logged accurately match Spotify history
  - No duplicate entries
  - State persists correctly across executions
- [ ] Performance metrics collected:
  - Average execution time
  - Memory usage
  - API call counts
  - Error rate
- [ ] Manual tests:
  - Play songs and verify they appear in sheet within 2 hours
  - Check error handling by forcing an API failure
  - Verify deduplication with repeated plays

**Dependencies:** All Sprint 3 tasks

**Deliverables:**
- Production deployment URL
- 24-hour test report with metrics
- Performance optimization recommendations
- Production monitoring dashboard

**Testing Checklist:**
```
Hour 1: Initial deployment verification
Hour 2: First cron execution check
Hour 4: Deduplication testing (play same song twice)
Hour 8: Error recovery testing
Hour 24: Full audit of logged data vs Spotify history
```

---

### Sprint 3 Definition of Done

- [ ] Application deployed to Vercel production
- [ ] Hourly cron job running reliably
- [ ] State managed in Vercel KV successfully
- [ ] 24-hour test period shows 95%+ success rate
- [ ] All manually triggered API calls working
- [ ] Function execution under 30 seconds
- [ ] No duplicate logs observed
- [ ] Documentation updated with deployment instructions

### Sprint 3 Retrospective Points

- Vercel platform reliability assessment
- KV storage performance and reliability
- Cron job accuracy and timing
- Cold start optimization effectiveness
- Production error rate and types

---

## Sprint 4: Robustness & Monitoring

**Sprint Goal:** Add production-grade error handling, retry mechanisms, historical data import, and monitoring/alerting capabilities

**Duration:** 5 days

**Dependencies:** Completed Sprint 3

**Risks:**
- Retry queue complexity → Mitigation: Keep retry logic simple, max 3 attempts
- Historical import hitting rate limits → Mitigation: Implement throttling and progress tracking
- Alert fatigue → Mitigation: Threshold-based alerts only for critical issues

### Tasks

#### Task 4.1: Error Recovery Function
**Priority:** Must Have
**Estimated Effort:** 5 hours
**Assignee:** Developer

**Description:**
Create a serverless function to process failed attempts from the retry queue, updating ERROR status rows when successful.

**Acceptance Criteria:**
- [ ] `/api/retry-failed.js` serverless function created with:
  - Load failed queue from KV state
  - Process each failed entry (max 3 attempts per entry)
  - Retry Spotify API calls for missing data
  - Update corresponding ERROR rows in sheet with complete data
  - Remove successful retries from queue
  - Increment retry count for continued failures
  - Alert after 3 failed attempts
- [ ] Execution limits:
  - Process max 50 failed entries per run
  - Stop after 45 seconds to avoid timeout
- [ ] Retry strategy:
  - Attempt 1: Immediate (via failed queue)
  - Attempt 2: 1 hour later
  - Attempt 3: 24 hours later
  - After 3 failures: Move to permanent error log and alert user
- [ ] Manual test: Add item to failed queue and verify retry succeeds
- [ ] Manual test: Verify ERROR row updated with complete data

**Dependencies:** None (uses existing infrastructure)

**Deliverables:**
- `/api/retry-failed.js`
- Retry logic documentation
- Test cases for retry scenarios

**Technical Notes:**
```javascript
// Queue entry structure
{
  trackId: 'spotify:track:xxx',
  attemptCount: 1,
  lastAttempt: '2024-01-01T12:00:00Z',
  error: 'Rate limit exceeded',
  sheetRowIndex: 42,  // Row to update when successful
  partialData: { /* available data */ }
}
```

---

#### Task 4.2: Historical Import Function
**Priority:** Should Have
**Estimated Effort:** 6 hours
**Assignee:** Developer

**Description:**
Create a serverless function to perform a one-time import of the last 50 songs from Spotify into the "Historical Data" sheet.

**Acceptance Criteria:**
- [ ] `/api/import-history.js` serverless function created with:
  - Fetch last 50 tracks from Spotify (API limit)
  - Enrich with audio features and metadata
  - Write to "Historical Data" sheet (not "Listening Log")
  - Add import timestamp column
  - Update state to prevent re-importing same tracks
  - Rate limiting and throttling (1 request per 500ms)
- [ ] Idempotent: Can be run multiple times without duplicating data
- [ ] Progress tracking in case of failure mid-import
- [ ] Execution time optimization with batching
- [ ] Manual test: Import 50 songs successfully
- [ ] Manual test: Re-run doesn't duplicate data
- [ ] Manual test: Verify all fields populated correctly

**Dependencies:** None (uses existing infrastructure)

**Deliverables:**
- `/api/import-history.js`
- Historical import documentation
- Execution instructions for one-time setup

**Technical Notes:**
- Use Spotify `/v1/me/player/recently-played?limit=50` endpoint
- Batch audio features requests (max 100 tracks per request)
- Use separate "Historical Data" sheet to distinguish from real-time logs

---

#### Task 4.3: System Logging Module
**Priority:** Should Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Implement comprehensive system logging to the "System Logs" sheet for monitoring and debugging.

**Acceptance Criteria:**
- [ ] `/lib/system-logger.js` module created with functions:
  - `logInfo(eventType, details)` - Log informational events
  - `logWarning(eventType, details, affectedTracks)` - Log warnings
  - `logError(eventType, details, error, affectedTracks)` - Log errors
  - `logRetry(trackId, attemptCount, error)` - Log retry attempts
  - `logResolution(trackId, resolutionTime)` - Log successful recovery
- [ ] Logs written to "System Logs" sheet with all fields:
  - Timestamp, Log Level, Event Type, Details, Retry Count, Resolution Time, Affected Tracks
- [ ] Event types defined:
  - SPOTIFY_AUTH_REFRESH, SPOTIFY_API_ERROR, SHEETS_API_ERROR, DEDUPLICATION_SKIP, RETRY_SUCCESS, RETRY_FAILURE, CRON_EXECUTION_START, CRON_EXECUTION_END
- [ ] Batch log writes (write every 10 logs or at end of execution)
- [ ] Log retention logic (keep last 1000 entries, archive older)
- [ ] Manual test: Generate various log types and verify in sheet

**Dependencies:** None (uses existing Sheets API wrapper)

**Deliverables:**
- `lib/system-logger.js`
- Log event type documentation
- Log retention policy

---

#### Task 4.4: Performance Monitoring and Metrics
**Priority:** Should Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Implement performance tracking and metrics collection to monitor system health and identify bottlenecks.

**Acceptance Criteria:**
- [ ] `/lib/metrics.js` module created with:
  - `trackExecutionTime(functionName, duration)` - Track function performance
  - `trackAPICall(service, endpoint, duration, success)` - Track API performance
  - `trackError(errorType, error)` - Track error patterns
  - `getMetricsSummary()` - Get aggregated metrics
  - `resetMetrics()` - Reset counters (daily)
- [ ] Metrics stored in KV with daily aggregation:
  - Average execution time per hour
  - API call counts (Spotify, Sheets)
  - Error counts by type
  - Success rate percentage
  - Tracks logged per day
- [ ] Weekly metrics summary written to System Logs
- [ ] Metrics accessible via `/api/metrics` endpoint (protected)
- [ ] Manual test: Generate metrics and verify summary
- [ ] Manual test: Check metrics persist across executions

**Dependencies:** Tasks 3.3 (KV storage), 4.3 (System Logger)

**Deliverables:**
- `lib/metrics.js`
- `/api/metrics.js` endpoint
- Metrics dashboard query examples

**Technical Notes:**
```javascript
// Store metrics in KV with date-based keys
await kv.hincrby('metrics:2024-01-01', 'tracksLogged', 5);
await kv.hset('metrics:2024-01-01', 'avgExecutionTime', 23.5);
```

---

#### Task 4.5: Alerting System
**Priority:** Should Have
**Estimated Effort:** 5 hours
**Assignee:** Developer

**Description:**
Implement alerting mechanism to notify when critical issues occur or when manual intervention is needed.

**Acceptance Criteria:**
- [ ] `/lib/alerting.js` module created with:
  - `sendAlert(level, title, message, metadata)` - Send alert via configured channel
  - `checkAlertThresholds()` - Check if thresholds exceeded
  - `alertConsecutiveFailures(count)` - Alert on repeated failures
  - `alertRateLimit()` - Alert on API rate limiting
  - `alertDataLoss(trackIds)` - Alert on unrecoverable data loss
- [ ] Alert delivery options (configure via env vars):
  - Console logging (default)
  - Email via SendGrid/Resend (optional)
  - Slack webhook (optional)
  - Discord webhook (optional)
- [ ] Alert thresholds defined:
  - 3 consecutive cron failures
  - 5 tracks in failed queue for >24 hours
  - Execution time >50 seconds
  - Error rate >10% over 24 hours
- [ ] Alert deduplication (max 1 alert per issue per 24 hours)
- [ ] Manual test: Trigger alert conditions and verify delivery
- [ ] Manual test: Verify alert deduplication works

**Dependencies:** Task 4.3 (System Logger)

**Deliverables:**
- `lib/alerting.js`
- Alert configuration documentation
- Alert threshold tuning guide

**Technical Notes:**
```bash
# Environment variables for alerting
ALERT_EMAIL=your-email@example.com
SENDGRID_API_KEY=your_key
SLACK_WEBHOOK_URL=your_webhook
ENABLE_ALERTS=true
```

---

#### Task 4.6: Data Validation and Quality Checks
**Priority:** Should Have
**Estimated Effort:** 3 hours
**Assignee:** Developer

**Description:**
Implement data validation and quality checks to ensure logged data meets quality standards.

**Acceptance Criteria:**
- [ ] `/lib/data-validator.js` module created with:
  - `validateTrackData(track)` - Validate track has all required fields
  - `validateAudioFeatures(features)` - Validate audio feature ranges
  - `validateTimestamps(timestamp)` - Ensure timestamps reasonable (±24 hours)
  - `validateUTF8(text)` - Check for encoding issues
  - `generateQualityReport()` - Summary of data quality issues
- [ ] Validation rules:
  - Track name not empty
  - Duration > 0 and < 1 hour (3,600,000ms)
  - Play duration >= 30 seconds
  - Audio features in valid ranges (0-1 for normalized, appropriate for others)
  - Timestamps within ±24 hours of current time
  - No special characters that break sheet formatting
- [ ] Failed validations logged to System Logs
- [ ] Quality report included in System Logs weekly
- [ ] Manual test: Validate good and bad data samples
- [ ] Manual test: Check quality report accuracy

**Dependencies:** Task 4.3 (System Logger)

**Deliverables:**
- `lib/data-validator.js`
- Validation rules documentation
- Quality metrics examples

---

#### Task 4.7: Documentation and Runbook
**Priority:** Must Have
**Estimated Effort:** 4 hours
**Assignee:** Developer

**Description:**
Create comprehensive documentation including setup guide, operational runbook, and troubleshooting guide.

**Acceptance Criteria:**
- [ ] README.md updated with:
  - Project overview and architecture
  - Prerequisites and dependencies
  - Setup instructions (step-by-step)
  - Environment variable reference
  - Deployment instructions
  - Usage examples
  - FAQ section
- [ ] RUNBOOK.md created with:
  - Common operational tasks (manual triggers, state inspection, etc.)
  - Troubleshooting guide (issue → solution mapping)
  - Monitoring and alerting guide
  - Recovery procedures for common failures
  - Maintenance tasks (token rotation, cleanup)
- [ ] API.md created with:
  - All endpoint documentation
  - Request/response examples
  - Error codes and meanings
  - Rate limits and usage
- [ ] CHANGELOG.md initialized
- [ ] All code documented with JSDoc comments
- [ ] Manual test: Follow setup guide from scratch on clean environment

**Dependencies:** All Sprint 4 tasks

**Deliverables:**
- Updated README.md
- RUNBOOK.md
- API.md
- CHANGELOG.md
- Inline code documentation

**Documentation Sections:**
```markdown
# RUNBOOK.md Sections
1. System Overview
2. Monitoring Dashboard
3. Common Operations
4. Troubleshooting Guide
5. Recovery Procedures
6. Maintenance Tasks
7. Escalation Procedures
```

---

#### Task 4.8: End-to-End Testing and Validation
**Priority:** Must Have
**Estimated Effort:** 6 hours
**Assignee:** Developer

**Description:**
Conduct comprehensive end-to-end testing of the complete system including error scenarios, recovery, and edge cases.

**Acceptance Criteria:**
- [ ] Test suite created covering:
  - Normal operation (successful logging)
  - Spotify API failures (rate limit, server error, auth error)
  - Google Sheets API failures
  - Network failures and timeouts
  - Retry queue processing
  - Historical import
  - State corruption recovery
  - Concurrent execution handling
- [ ] 7-day production monitoring with daily checks:
  - All cron executions successful or recovered
  - Data quality at 99%+
  - No duplicate entries detected
  - All alerts functioning correctly
  - Retry queue processing working
  - Performance within targets (<30s execution)
- [ ] Load testing:
  - 100+ tracks in single run
  - Multiple songs played in quick succession
  - Extended listening sessions
- [ ] Edge case testing:
  - Podcasts vs music tracks
  - Very long artist lists (collaborations)
  - Special characters in track names
  - Tracks without audio features
- [ ] Manual validation:
  - Compare sheet data with Spotify web history (100% accuracy target)
  - Verify audio features match Spotify API data
  - Check timestamp accuracy (±1 minute tolerance)

**Dependencies:** All Sprint 4 tasks

**Deliverables:**
- Test suite with results
- 7-day production report
- Edge case documentation
- Final validation report

**Test Scenarios:**
```
Scenario 1: Normal day (10 songs played)
Scenario 2: Heavy usage (50+ songs in one day)
Scenario 3: Spotify API rate limit hit
Scenario 4: Network outage during execution
Scenario 5: Duplicate play detection (same song 3x)
Scenario 6: Long listening session (6+ hours continuous)
```

---

### Sprint 4 Definition of Done

- [ ] Retry queue processing working reliably
- [ ] Historical import completed successfully
- [ ] System logging capturing all events
- [ ] Performance metrics tracked and accessible
- [ ] Alerting system functional and tested
- [ ] Data validation catching quality issues
- [ ] Complete documentation delivered
- [ ] 7-day production test shows 99%+ reliability
- [ ] All edge cases handled gracefully
- [ ] System ready for long-term unattended operation

### Sprint 4 Retrospective Points

- Error recovery effectiveness
- Alert accuracy and usefulness
- Documentation completeness and clarity
- Overall system reliability
- Performance optimization opportunities
- Future enhancement ideas

---

## Post-Sprint Activities

### Week 5+: Optional Enhancements (Phase 5)

These features can be added after the core system is stable and running reliably:

#### Enhancement 1: Web Dashboard
- Visualizations of listening habits
- Stats and insights
- Manual trigger interface
- State inspection UI

#### Enhancement 2: Advanced Analytics
- Music taste analysis
- Discovery rate tracking
- Genre distribution over time
- Artist/album listening patterns

#### Enhancement 3: Playlist Generation
- Auto-create playlists from top songs
- Weekly/monthly discovery playlists
- Mood-based playlist creation

#### Enhancement 4: Data Export
- JSON export of all data
- CSV export with custom fields
- Integration with Last.fm
- Integration with music analysis tools

#### Enhancement 5: Social Features
- Share listening stats
- Compare with friends
- Collaborative playlists from shared tastes

---

## Risk Management Matrix

| Risk | Probability | Impact | Mitigation Strategy | Owner |
|------|-------------|--------|---------------------|-------|
| Spotify API rate limiting | Medium | High | Implement caching, request batching, exponential backoff | Developer |
| Token expiration issues | Low | High | Automatic refresh, monitoring alerts | Developer |
| Google Sheets quota exceeded | Low | Medium | Batch operations, monitor usage | Developer |
| Vercel function timeout | Medium | Medium | Optimize execution, split into smaller functions | Developer |
| KV storage corruption | Low | High | Regular backups, state validation | Developer |
| Cron job failures | Low | High | Alerting, manual trigger fallback | Developer |
| Data loss during errors | Medium | High | Error placeholders, retry queue | Developer |
| Duplicate logging | Medium | Medium | Robust deduplication, state management | Developer |
| Performance degradation | Low | Medium | Metrics tracking, optimization | Developer |
| Service account key exposure | Low | Critical | Environment variables, .gitignore | Developer |

---

## Success Metrics and KPIs

### Functional Metrics
- **Capture Rate**: 95%+ of 30+ second plays logged
- **Data Completeness**: 99%+ of rows have all 28 fields populated
- **Deduplication Accuracy**: 0% duplicate entries for same play session
- **Error Recovery**: 90%+ of failed attempts successfully retried

### Performance Metrics
- **Execution Time**: Average <30 seconds per run
- **Uptime**: 99%+ monthly (max 7 hours downtime/month)
- **API Success Rate**: 99%+ for Spotify and Sheets calls
- **Cold Start Time**: <5 seconds for function initialization

### Quality Metrics
- **Data Accuracy**: 100% match with Spotify history (verified by sampling)
- **Timestamp Accuracy**: ±1 minute tolerance
- **Audio Features Accuracy**: 100% match with Spotify API data

### Operational Metrics
- **Alert Frequency**: <5 critical alerts per month
- **Manual Intervention**: <2 hours per month required
- **Token Refresh Success**: 100% automated token refresh

---

## Dependencies and Prerequisites

### Before Sprint 1
- [ ] Spotify Developer Account created
- [ ] Spotify App registered and credentials obtained
- [ ] Development environment set up (Node.js 18+)
- [ ] Git repository initialized
- [ ] Code editor configured

### Before Sprint 2
- [ ] Google Cloud Account created
- [ ] Google Cloud Project created
- [ ] Target Google Sheet created (ID: 1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ)

### Before Sprint 3
- [ ] Vercel account created
- [ ] Payment method added (if needed for KV usage)
- [ ] Domain configured (if custom domain desired)

### Before Sprint 4
- [ ] Email/Slack/Discord for alerts configured (optional)
- [ ] Monitoring tools access (Vercel dashboard, etc.)

---

## Glossary

**Audio Features**: Spotify's analysis of musical characteristics (tempo, energy, etc.)

**Cold Start**: First execution of serverless function after idle period

**Deduplication**: Process of preventing same play from being logged multiple times

**Idempotent**: Operation that can be run multiple times with same result

**KV Storage**: Key-Value database (Redis-compatible)

**Play Duration**: How long user actually listened (vs total track duration)

**Refresh Token**: Long-lived OAuth token used to obtain access tokens

**Retry Queue**: List of failed operations pending retry

**Service Account**: Google Cloud account for server-to-server API access

**State Management**: Tracking what has been processed to avoid duplicates

---

## Appendix: Example Workflows

### Workflow 1: Normal Hourly Execution
1. Vercel Cron triggers `/api/log-spotify` at top of hour
2. Function loads state from KV (last processed track)
3. Function refreshes Spotify token if needed via `/api/auth-spotify`
4. Function fetches recently played tracks from Spotify
5. Function filters for new 30+ second plays
6. Function enriches with audio features and metadata
7. Function checks for duplicates against state
8. Function writes new rows to "Listening Log" sheet
9. Function updates state in KV with latest processed track
10. Function logs summary to "System Logs" sheet
11. Function returns success response
12. Metrics updated in KV

### Workflow 2: Error Recovery
1. Spotify API call fails for track X
2. Partial data available (timestamp, track ID)
3. Error placeholder row written to sheet with ERROR status
4. Track X added to failed queue in KV with error details
5. Next hourly run processes failed queue first
6. Retry succeeds and gets complete data
7. ERROR row updated with complete data, status changed to COMPLETED
8. Track X removed from failed queue
9. Success logged to "System Logs"

### Workflow 3: Historical Import
1. User triggers `/api/import-history` manually
2. Function fetches last 50 tracks from Spotify
3. Function enriches with audio features (batched)
4. Function writes to "Historical Data" sheet (not main log)
5. Function updates state to mark import complete
6. Function returns summary of imported tracks

### Workflow 4: Alert Escalation
1. Cron execution fails 3 times in a row
2. Alert threshold exceeded
3. Alert sent via configured channel (email/Slack)
4. Error details logged to "System Logs"
5. User investigates via Vercel dashboard
6. User triggers manual retry via `/api/log-spotify` URL
7. Issue resolved, consecutive failure count resets

---

## Contact and Support

**Project Owner**: Michael Evans
**Repository**: https://github.com/yourusername/spotify-song-logger
**Documentation**: https://your-docs-site.com
**Issues**: https://github.com/yourusername/spotify-song-logger/issues

---

**Version**: 1.0.0
**Last Updated**: October 2024
**Next Review**: After Sprint 4 completion
