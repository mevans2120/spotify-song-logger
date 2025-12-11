import { getRecentlyPlayed, getAudioFeatures, getBatchArtistDetails } from '../lib/spotify-api.js';
import { filterNewPlays, sortTracksByTimestamp, getMostRecentTrack } from '../lib/play-filter.js';
import { formatTrackForLogging, formatAsSheetRow, createErrorPlaceholder } from '../lib/data-formatter.js';
import { appendRows, getAllRows } from '../lib/sheets-api.js';
import { loadState, updateLastProcessed, addToFailedQueue, updateStats, getStats, getStorageBackend } from '../lib/state-manager.js';
import { reconcileState, filterDuplicatesAgainstSheet } from '../lib/deduplication.js';
import { logCronStart, logCronEnd, logSpotifyError, logSheetsError, flush } from '../lib/system-logger.js';
import { startExecution, endExecution, trackApiCall, trackError, trackTracks } from '../lib/metrics.js';
import { trackSuccessfulRun, trackFailedRun, checkAlertThresholds } from '../lib/alerting.js';
import { validateFormattedTrack, sanitizeTrackData } from '../lib/data-validator.js';

/**
 * Vercel Serverless Function: Log Recent Spotify Plays
 *
 * This function runs hourly via cron to:
 * 1. Fetch recently played tracks from Spotify
 * 2. Filter for 30+ second plays
 * 3. Enrich with audio features and metadata
 * 4. Check for duplicates against sheet data
 * 5. Append new rows to Google Sheets
 * 6. Update state with last processed track
 *
 * Endpoint: /api/log-spotify
 * Method: GET (triggered by cron or manual request)
 * Response: JSON execution summary
 */

/**
 * Main serverless handler
 * @param {object} req - Vercel request object
 * @param {object} res - Vercel response object
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const executionLog = [];

  // Start metrics and logging
  startExecution('log-spotify');
  await logCronStart('log-spotify');

  try {
    // Log backend information
    const backend = getStorageBackend();
    executionLog.push(`Using storage backend: ${backend.backend}`);
    console.log('[Log Spotify] Using storage backend:', backend.backend);

    // Step 1: Load state
    console.log('[Log Spotify] Loading state...');
    let state = await loadState();
    const stats = await getStats();
    executionLog.push(`State loaded (${state.failedQueue.length} items in failed queue)`);

    if (stats.lastRun) {
      executionLog.push(`Last run: ${new Date(stats.lastRun).toLocaleString()}`);
    }

    // Step 2: Fetch recently played tracks
    console.log('[Log Spotify] Fetching recently played tracks...');
    const limit = parseInt(process.env.SPOTIFY_FETCH_LIMIT || '50', 10);
    const recentlyPlayed = await getRecentlyPlayed(limit);
    const tracks = recentlyPlayed.items || [];
    executionLog.push(`Fetched ${tracks.length} tracks from Spotify`);

    if (tracks.length === 0) {
      executionLog.push('No recent tracks found');
      return res.status(200).json({
        success: true,
        message: 'No recent tracks to process',
        stats: {
          fetched: 0,
          filtered: 0,
          unique: 0,
          logged: 0,
          failed: 0,
          executionTimeMs: Date.now() - startTime
        },
        log: executionLog
      });
    }

    // Step 3: Filter for new plays
    console.log('[Log Spotify] Filtering for 30+ second plays...');
    const filteredTracks = filterNewPlays(tracks, state);
    const sortedTracks = sortTracksByTimestamp(filteredTracks);
    executionLog.push(`Filtered to ${filteredTracks.length} new plays`);

    if (filteredTracks.length === 0) {
      executionLog.push('No new plays to log. Everything is up to date!');
      return res.status(200).json({
        success: true,
        message: 'No new plays to log',
        stats: {
          fetched: tracks.length,
          filtered: 0,
          unique: 0,
          logged: 0,
          failed: 0,
          executionTimeMs: Date.now() - startTime
        },
        log: executionLog
      });
    }

    // Step 4: Load sheet data for deduplication
    console.log('[Log Spotify] Loading existing sheet data for deduplication...');
    const sheetRows = await getAllRows('Listening Log');
    executionLog.push(`Loaded ${sheetRows.length} rows from sheet`);

    // Reconcile state with sheet data
    state = reconcileState(sheetRows, state);
    executionLog.push('State reconciled with sheet data');

    // Step 5: Filter duplicates against sheet
    console.log('[Log Spotify] Checking for duplicates in sheet...');
    const uniqueTracks = filterDuplicatesAgainstSheet(sortedTracks, sheetRows);
    const duplicateCount = sortedTracks.length - uniqueTracks.length;
    executionLog.push(`${uniqueTracks.length} unique tracks to log (${duplicateCount} duplicates filtered)`);

    if (uniqueTracks.length === 0) {
      executionLog.push('All tracks already logged. Nothing new to add!');
      return res.status(200).json({
        success: true,
        message: 'All tracks already logged',
        stats: {
          fetched: tracks.length,
          filtered: filteredTracks.length,
          unique: 0,
          logged: 0,
          failed: 0,
          executionTimeMs: Date.now() - startTime
        },
        log: executionLog
      });
    }

    // Step 6: Enrich with audio features and metadata
    console.log('[Log Spotify] Enriching tracks with audio features and metadata...');
    const formattedTracks = [];
    const failedTracks = [];

    for (const track of uniqueTracks) {
      try {
        // Fetch audio features
        const audioFeatures = await getAudioFeatures(track.track.id);

        // Fetch artist details for genres
        const artistIds = track.track.artists.map(a => a.id);
        const artists = await getBatchArtistDetails(artistIds);
        const primaryArtist = artists[0];

        // Format track
        const formatted = formatTrackForLogging(
          track.track,
          track,
          audioFeatures,
          primaryArtist
        );

        // Validate and sanitize
        const validation = validateFormattedTrack(formatted);
        if (!validation.valid) {
          console.warn(`[Log Spotify] Validation warnings for ${track.track.name}:`, validation.errors);
        }
        const sanitized = sanitizeTrackData(formatted);

        formattedTracks.push(sanitized);
        successCount++;
      } catch (error) {
        console.warn(`[Log Spotify] Error enriching ${track.track.name}:`, error.message);

        // Track the error
        trackError('spotify', error);
        await logSpotifyError('audio-features', error, { affectedTracks: [track.track.id] });

        // Create error placeholder
        const errorPlaceholder = createErrorPlaceholder(track, error.message);
        formattedTracks.push(errorPlaceholder);

        // Add to failed queue
        failedTracks.push({ track, error: error.message });
        failureCount++;
      }
    }
    executionLog.push(`Enriched ${formattedTracks.length} tracks (${successCount} success, ${failureCount} failures)`);

    // Step 7: Format for sheets
    console.log('[Log Spotify] Formatting data for Google Sheets...');
    const rowsToAppend = formattedTracks.map(track => formatAsSheetRow(track));

    // Step 8: Write to sheets
    console.log('[Log Spotify] Appending to Google Sheets "Listening Log"...');
    const appendResult = await appendRows('Listening Log', rowsToAppend);
    executionLog.push(`Successfully wrote ${appendResult.updates.updatedRows} row(s) to sheet`);

    // Step 9: Update state
    console.log('[Log Spotify] Updating state...');

    // Update last processed track
    const mostRecent = getMostRecentTrack(uniqueTracks);
    if (mostRecent) {
      await updateLastProcessed(mostRecent);
      executionLog.push(`Updated last processed: ${mostRecent.track.name}`);
    }

    // Add failed tracks to queue
    for (const failed of failedTracks) {
      await addToFailedQueue(failed.track, failed.error);
    }
    if (failedTracks.length > 0) {
      executionLog.push(`Added ${failedTracks.length} track(s) to failed queue`);
    }

    // Update stats
    await updateStats(successCount, failureCount);
    executionLog.push('Updated stats');

    // Step 10: Finalize metrics and logging
    const executionTimeMs = Date.now() - startTime;
    const executionTimeSec = (executionTimeMs / 1000).toFixed(2);

    // Track metrics
    trackTracks(uniqueTracks.length, successCount);
    const executionSummary = await endExecution();

    // Log completion
    await logCronEnd('log-spotify', {
      duration: executionTimeMs,
      tracksLogged: successCount,
      errors: failureCount
    });

    // Check alert thresholds
    await checkAlertThresholds({
      executionTimeMs,
      totalTracks: uniqueTracks.length,
      errorCount: failureCount
    });

    // Track successful run for consecutive failure counter
    await trackSuccessfulRun();

    // Flush any remaining logs
    await flush();

    console.log(`[Log Spotify] Execution complete in ${executionTimeSec}s`);

    return res.status(200).json({
      success: true,
      message: 'Logging complete',
      stats: {
        fetched: tracks.length,
        filtered: filteredTracks.length,
        unique: uniqueTracks.length,
        logged: successCount,
        failed: failureCount,
        executionTimeMs: executionTimeMs,
        executionTimeSec: executionTimeSec
      },
      recentTracks: formattedTracks.slice(0, 5).map(t => ({
        name: t.trackName,
        artist: t.artists,
        timestamp: t.timestamp
      })),
      backend: backend,
      log: executionLog
    });

  } catch (error) {
    console.error('[Log Spotify] Fatal error:', error);

    const executionTimeMs = Date.now() - startTime;

    // Track the fatal error
    trackError('other', error);
    await logSpotifyError('fatal', error);

    // End metrics tracking
    await endExecution();

    // Track failed run for alerting
    await trackFailedRun();

    // Flush logs
    await flush();

    // Return error response
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      stats: {
        fetched: 0,
        filtered: 0,
        unique: 0,
        logged: successCount,
        failed: failureCount,
        executionTimeMs: executionTimeMs
      },
      log: executionLog
    });
  }
}
