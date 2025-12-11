# Spotify Song Logger API Reference

## Overview

This document describes the HTTP API endpoints for the Spotify Song Logger application. All endpoints are serverless functions deployed on Vercel.

## Base URL

- **Production**: `https://your-project.vercel.app`
- **Development**: `http://localhost:3000`

---

## Endpoints

### POST/GET `/api/log-spotify`

Main logging function that fetches recent Spotify plays and logs them to Google Sheets.

**Trigger**: Vercel Cron (hourly) or manual HTTP request

**Response**:

```json
{
  "success": true,
  "message": "Logging complete",
  "stats": {
    "fetched": 15,
    "filtered": 8,
    "unique": 5,
    "logged": 5,
    "failed": 0,
    "executionTimeMs": 12500,
    "executionTimeSec": "12.50"
  },
  "recentTracks": [
    {
      "name": "Song Title",
      "artist": "Artist Name",
      "timestamp": "2024-01-15T12:00:00Z"
    }
  ],
  "backend": {
    "backend": "vercel-kv",
    "isVercel": true
  },
  "log": ["Step 1...", "Step 2..."]
}
```

**Error Response** (500):

```json
{
  "success": false,
  "error": "Error message",
  "stats": { ... },
  "log": [...]
}
```

---

### GET `/api/auth-spotify`

Tests Spotify authentication and optionally refreshes the access token.

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `refresh` | boolean | Set to `true` to force token refresh |

**Response**:

```json
{
  "success": true,
  "message": "Spotify authentication successful",
  "credentials": {
    "hasClientId": true,
    "hasClientSecret": true,
    "hasRefreshToken": true,
    "allPresent": true
  },
  "token": {
    "present": true,
    "masked": "BQAx...abcd",
    "length": 256,
    "expiresIn": 3600,
    "tokenType": "Bearer"
  },
  "timestamp": "2024-01-15T12:00:00Z"
}
```

---

### GET `/api/retry-failed`

Processes tracks from the failed queue, retrying API calls to complete their data.

**Trigger**: Vercel Cron (every 6 hours) or manual HTTP request

**Response**:

```json
{
  "success": true,
  "message": "Retry processing complete",
  "stats": {
    "processed": 3,
    "succeeded": 2,
    "failed": 1,
    "skipped": 0,
    "maxedOut": 0
  },
  "maxedOutTracks": [],
  "executionTimeMs": 5000
}
```

---

### GET `/api/import-history`

One-time import of the last 50 songs from Spotify to the "Historical Data" sheet.

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `force` | boolean | Set to `true` to re-import even if already done |
| `limit` | number | Number of tracks to import (max: 50) |

**Response**:

```json
{
  "success": true,
  "message": "Historical import completed",
  "stats": {
    "fetched": 50,
    "imported": 48,
    "skipped": 2,
    "failed": 0
  },
  "recentTracks": [...],
  "executionTimeMs": 25000
}
```

---

### GET `/api/metrics`

Returns system metrics, health status, and operational data.

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `view` | string | `summary` (default) or `weekly` |
| `cleanup` | boolean | Set to `true` to remove metrics older than 30 days |

**Response**:

```json
{
  "success": true,
  "timestamp": "2024-01-15T12:00:00Z",
  "health": {
    "status": "healthy",
    "issues": [],
    "metrics": {
      "executions": 24,
      "avgExecutionTime": 15000,
      "successRate": 98,
      "tracksLogged": 120,
      "errors": 2
    }
  },
  "metrics": {
    "today": { ... },
    "totals": { ... }
  },
  "state": {
    "lastRun": "2024-01-15T11:00:00Z",
    "totalSuccesses": 1500,
    "totalFailures": 10,
    "failedQueueSize": 2
  },
  "alerts": {
    "enabled": true,
    "channels": { "slack": true, "discord": false }
  }
}
```

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 500 | Internal server error (see `error` field) |

## Rate Limits

- **Spotify API**: 180 requests/minute (handled internally with caching)
- **Google Sheets API**: 300 requests/minute (uses batch operations)
- **Vercel Functions**: 125,000 invocations/month (free tier)

## Authentication

All endpoints use server-side authentication via environment variables:

- Spotify: OAuth 2.0 with refresh token
- Google Sheets: Service account credentials

No client-side authentication is required to call these endpoints, but they are designed to be triggered by cron jobs or administrators only.

---

## Cron Schedules

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/log-spotify` | `0 * * * *` | Every hour at minute 0 |
| `/api/retry-failed` | `0 */6 * * *` | Every 6 hours at minute 0 |
