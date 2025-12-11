# Spotify Song Logger - Operational Runbook

This runbook provides operational procedures for maintaining and troubleshooting the Spotify Song Logger system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Monitoring Dashboard](#monitoring-dashboard)
3. [Common Operations](#common-operations)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Recovery Procedures](#recovery-procedures)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Escalation Procedures](#escalation-procedures)

---

## System Overview

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vercel Cron   │────▶│  /api/log-      │────▶│  Google Sheets  │
│   (Hourly)      │     │  spotify.js     │     │  (Listening Log)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Spotify API    │
                        │  - Recently     │
                        │    Played       │
                        │  - Audio        │
                        │    Features     │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Vercel KV      │
                        │  (State Store)  │
                        └─────────────────┘
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Main Logger | Hourly logging function | `/api/log-spotify.js` |
| Auth Handler | Token refresh | `/api/auth-spotify.js` |
| Retry Handler | Process failed tracks | `/api/retry-failed.js` |
| Historical Import | One-time import | `/api/import-history.js` |
| State Manager | Track processed state | `/lib/state-manager.js` |
| System Logger | Operational logging | `/lib/system-logger.js` |
| Metrics | Performance tracking | `/lib/metrics.js` |
| Alerting | Issue notifications | `/lib/alerting.js` |

### Data Flow

1. Vercel cron triggers `/api/log-spotify` every hour
2. Function authenticates with Spotify (auto-refreshes token if needed)
3. Fetches recently played tracks (last 50)
4. Filters for 30+ second plays not already logged
5. Enriches with audio features and metadata
6. Appends to Google Sheets "Listening Log"
7. Updates state in Vercel KV
8. Logs execution summary to "System Logs"

---

## Monitoring Dashboard

### Vercel Dashboard

**Access**: https://vercel.com/dashboard → Your Project

**Key Metrics to Monitor**:
- Function invocations (should be ~24/day for hourly cron)
- Average execution time (target: <30s)
- Error rate (target: <1%)
- KV storage usage

### Google Sheets

**Listening Log Sheet**:
- New rows appearing hourly
- Status column = "COMPLETED" for successful logs
- Status column = "ERROR" indicates issues

**System Logs Sheet**:
- Check for ERROR level entries
- Monitor RETRY_FAILURE events
- Review CRON_EXECUTION_END entries for duration

### Health Check Endpoints

```bash
# Check authentication status
curl https://your-project.vercel.app/api/auth-spotify

# Manual logging test
curl https://your-project.vercel.app/api/log-spotify

# Check metrics
curl https://your-project.vercel.app/api/metrics
```

---

## Common Operations

### 1. Manual Trigger of Logging

When you need to force a logging run outside the hourly schedule:

```bash
curl https://your-project.vercel.app/api/log-spotify
```

Expected response:
```json
{
  "success": true,
  "message": "Logging complete",
  "stats": {
    "fetched": 15,
    "filtered": 5,
    "unique": 5,
    "logged": 5,
    "failed": 0
  }
}
```

### 2. Process Failed Queue

To manually retry failed tracks:

```bash
curl https://your-project.vercel.app/api/retry-failed
```

### 3. Import Historical Data

One-time import of last 50 songs:

```bash
# First import
curl https://your-project.vercel.app/api/import-history

# Force re-import
curl "https://your-project.vercel.app/api/import-history?force=true"
```

### 4. Check Current State

View the current state via Vercel KV dashboard or CLI:

```bash
# Pull environment variables
vercel env pull .env.local

# Use a KV client to inspect state
# Key: state:full
```

### 5. Force Token Refresh

```bash
curl "https://your-project.vercel.app/api/auth-spotify?refresh=true"
```

### 6. View Recent Logs

```bash
# Real-time logs
vercel logs --follow

# Last 100 logs
vercel logs
```

---

## Troubleshooting Guide

### Issue: No Songs Being Logged

**Symptoms**:
- No new rows in Listening Log
- Cron appears to run but 0 tracks logged

**Diagnosis**:
1. Check if music was played for 30+ seconds
2. Verify cron is running: Vercel Dashboard → Cron Jobs
3. Check System Logs sheet for errors
4. Test authentication: `curl /api/auth-spotify`

**Resolution**:
1. If auth error: Refresh token (see below)
2. If rate limited: Wait 1 hour
3. If state issue: Reset state (see Recovery Procedures)

---

### Issue: Authentication Errors

**Symptoms**:
- "Invalid refresh token" error
- 401 responses from Spotify API

**Diagnosis**:
```bash
curl https://your-project.vercel.app/api/auth-spotify
```

Look for:
- `success: false`
- `errorType: 'invalid_refresh_token'`

**Resolution**:
1. Generate new refresh token locally:
   ```bash
   node scripts/get-refresh-token.js
   ```
2. Update Vercel environment variable:
   ```bash
   vercel env rm SPOTIFY_REFRESH_TOKEN production
   vercel env add SPOTIFY_REFRESH_TOKEN production
   # Paste new token when prompted
   ```
3. Redeploy:
   ```bash
   vercel --prod
   ```

---

### Issue: Google Sheets Permission Error

**Symptoms**:
- "Permission denied" error
- 403 response from Sheets API

**Diagnosis**:
- Check if service account email has Editor access to sheet
- Verify sheet ID is correct

**Resolution**:
1. Open Google Sheet
2. Click "Share"
3. Add service account email with "Editor" role
4. Verify `GOOGLE_SHEETS_ID` matches sheet URL

---

### Issue: Duplicate Entries

**Symptoms**:
- Same song appearing multiple times with similar timestamps

**Diagnosis**:
- Check state storage for lastProcessed track
- Review System Logs for DEDUPLICATION_SKIP events
- Compare timestamps of duplicate entries

**Resolution**:
1. Check KV state:
   ```
   Key: state:lastProcessed
   ```
2. If state is corrupted, reset (see Recovery Procedures)
3. Manually remove duplicate rows from sheet

---

### Issue: Rate Limiting (429 Errors)

**Symptoms**:
- "Rate limit exceeded" errors
- Partial track data logged

**Diagnosis**:
- Check System Logs for SPOTIFY_API_ERROR events
- Review metrics for API call counts

**Resolution**:
1. Wait 1 hour for rate limits to reset
2. If persistent, reduce `SPOTIFY_FETCH_LIMIT` env var
3. Check for runaway retries in failed queue

---

### Issue: Function Timeout

**Symptoms**:
- Function killed after 60 seconds
- Incomplete logging

**Diagnosis**:
- Check Vercel logs for timeout messages
- Review average execution time in metrics

**Resolution**:
1. Reduce batch size: Set `SPOTIFY_FETCH_LIMIT=25`
2. Check for slow API responses
3. Consider upgrading Vercel plan for longer timeouts

---

### Issue: KV Storage Errors

**Symptoms**:
- "KV_REST_API_URL is not defined" error
- State not persisting between runs

**Diagnosis**:
```bash
vercel env ls
```
Look for KV_REST_API_URL and KV_REST_API_TOKEN

**Resolution**:
1. Verify KV database is connected to project:
   - Vercel Dashboard → Storage → Your KV → Connect to Project
2. Redeploy: `vercel --prod`
3. If still failing, recreate KV database

---

## Recovery Procedures

### Procedure 1: Reset State

When state is corrupted and causing issues:

```bash
# 1. Backup current state (if accessible)
# Via Vercel KV dashboard, export state:full key

# 2. Clear state via code modification
# Add temporary endpoint or use KV dashboard to delete:
# - state:full
# - state:lastProcessed
# - state:failedQueue
# - state:stats

# 3. The next cron run will recreate default state
# Note: This may cause some duplicate logging for recent tracks
```

### Procedure 2: Recover from Auth Failure

Complete authentication recovery:

```bash
# 1. Generate new refresh token
cd spotify-song-logger
node scripts/get-refresh-token.js
# Follow browser prompts

# 2. Update Vercel
vercel env rm SPOTIFY_REFRESH_TOKEN production
vercel env add SPOTIFY_REFRESH_TOKEN production

# 3. Redeploy
vercel --prod

# 4. Test
curl https://your-project.vercel.app/api/auth-spotify
```

### Procedure 3: Recover from Data Loss

If tracks were missed due to extended outage:

```bash
# 1. Run historical import to capture recent tracks
curl "https://your-project.vercel.app/api/import-history?force=true"

# 2. Check Historical Data sheet for imported tracks

# 3. Optionally move relevant rows to Listening Log manually
```

### Procedure 4: Full System Reset

Nuclear option - complete reset:

```bash
# 1. Delete and recreate KV database
# Via Vercel Dashboard → Storage

# 2. Clear Google Sheet data (keep headers)
# Manual: Select all data rows → Delete

# 3. Regenerate Spotify token
node scripts/get-refresh-token.js

# 4. Update all environment variables
vercel env rm SPOTIFY_REFRESH_TOKEN production
vercel env add SPOTIFY_REFRESH_TOKEN production
# (repeat for KV credentials after recreating database)

# 5. Redeploy
vercel --prod

# 6. Initialize sheets
curl https://your-project.vercel.app/api/import-history
```

---

## Maintenance Tasks

### Weekly Tasks

1. **Review System Logs**
   - Check for recurring errors
   - Monitor execution times
   - Review failed queue size

2. **Verify Data Quality**
   - Spot check recent entries
   - Verify audio features are populated
   - Check for any ERROR status rows

### Monthly Tasks

1. **Token Rotation Check**
   - Spotify tokens don't expire but may be revoked
   - Test authentication endpoint
   - Regenerate if any issues

2. **Clean Up Old Metrics**
   - Metrics auto-cleanup keeps 30 days
   - Verify cleanup is working

3. **Review Alerts**
   - Check alert deduplication is working
   - Test alert delivery channels

### Quarterly Tasks

1. **Google Service Account Key Rotation**
   - Generate new service account key
   - Update `GOOGLE_PRIVATE_KEY` in Vercel
   - Delete old key from Google Cloud Console

2. **Dependency Updates**
   - Run `npm audit`
   - Update dependencies: `npm update`
   - Test locally before deploying

3. **Cost Review**
   - Check Vercel usage dashboard
   - Verify within free tier limits
   - Review Google Cloud API usage

---

## Escalation Procedures

### Alert Thresholds

| Alert | Threshold | Action |
|-------|-----------|--------|
| Consecutive Failures | 3 | Check auth, review logs |
| Consecutive Failures | 5 | Critical - immediate investigation |
| Execution Time | >50s | Optimize or reduce batch size |
| Error Rate | >10% | Review API status, check rate limits |
| Stuck Tracks | >5 for 24h | Manual review of failed queue |

### Alert Channels

Configure via environment variables:

```env
ENABLE_ALERTS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERT_EMAIL=your-email@example.com
```

### Escalation Path

1. **Level 1** (Automated): Alert sent to configured channels
2. **Level 2** (Self-Service): Follow runbook procedures
3. **Level 3** (Manual): Check Vercel status page, Spotify API status

### External Dependencies

- **Spotify API Status**: https://status.spotify.dev/
- **Google Cloud Status**: https://status.cloud.google.com/
- **Vercel Status**: https://www.vercel-status.com/

---

## Contact Information

**Repository**: https://github.com/mevans2120/spotify-song-logger
**Issues**: https://github.com/mevans2120/spotify-song-logger/issues

---

## Appendix

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify app client secret |
| `SPOTIFY_REFRESH_TOKEN` | Yes | Long-lived refresh token |
| `GOOGLE_SHEETS_ID` | Yes | Google Sheet document ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account email |
| `GOOGLE_PRIVATE_KEY` | Yes | Service account private key |
| `KV_REST_API_URL` | Yes (prod) | Vercel KV REST URL |
| `KV_REST_API_TOKEN` | Yes (prod) | Vercel KV REST token |
| `ENABLE_ALERTS` | No | Enable alerting (default: true) |
| `SLACK_WEBHOOK_URL` | No | Slack webhook for alerts |
| `DISCORD_WEBHOOK_URL` | No | Discord webhook for alerts |
| `SPOTIFY_FETCH_LIMIT` | No | Tracks to fetch (default: 50) |
| `MAX_RETRY_ATTEMPTS` | No | Max retry attempts (default: 3) |

### API Response Codes

| Endpoint | Success | Common Errors |
|----------|---------|---------------|
| `/api/log-spotify` | 200 | 500 (internal), 401 (auth) |
| `/api/auth-spotify` | 200 | 500 (refresh failed) |
| `/api/retry-failed` | 200 | 500 (internal) |
| `/api/import-history` | 200 | 500 (internal) |

### Useful Commands

```bash
# View logs
vercel logs --follow

# List deployments
vercel ls

# Rollback deployment
vercel promote <deployment-url>

# Pull env vars
vercel env pull .env.local

# Local development
vercel dev
```

---

*Last Updated: Sprint 4 Implementation*
*Version: 1.0.0*
