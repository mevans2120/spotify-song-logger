# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-10

### Added

#### Sprint 1: Local Development & Spotify Integration
- Spotify OAuth token management with automatic refresh
- Spotify API wrapper with rate limiting and caching
- Data transformation for 28-column sheet schema
- 30-second play duration filter
- Local console logging script for testing

#### Sprint 2: Google Sheets Integration
- Google Sheets API wrapper with batch operations
- Sheet schema initialization script
- State management (local file storage)
- Deduplication logic to prevent duplicate entries
- End-to-end local logger script
- Error placeholder rows for failed tracks

#### Sprint 3: Cloud Deployment
- Vercel serverless function deployment
- Vercel KV state storage (Redis)
- Hourly cron job for automatic logging
- Authentication endpoint for token testing
- Production deployment configuration

#### Sprint 4: Robustness & Monitoring
- Error recovery function with retry queue processing
- Historical import function (last 50 songs)
- System logging to "System Logs" sheet
- Performance metrics tracking
- Alerting system (Slack, Discord, console)
- Data validation and sanitization
- Metrics dashboard endpoint
- Comprehensive documentation (README, RUNBOOK, API.md)
- Unit test suite

### Technical Details

- **Runtime**: Node.js 18+
- **Platform**: Vercel Functions
- **State Storage**: Vercel KV (production), local JSON (development)
- **APIs**: Spotify Web API, Google Sheets API v4
- **Testing**: Jest 29

---

## [Unreleased]

### Planned
- Web dashboard for viewing listening statistics
- Advanced analytics and insights
- Playlist generation from logged data
- Export to additional formats (JSON, CSV)
