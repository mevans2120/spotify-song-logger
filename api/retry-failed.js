import { getFailedQueue, clearFromFailedQueue, updateStats, loadState, saveState } from '../lib/state-manager.js';
import { getAudioFeatures, getBatchArtistDetails } from '../lib/spotify-api.js';
import { formatTrackForLogging, formatAsSheetRow } from '../lib/data-formatter.js';
import { updateRow, getAllRows } from '../lib/sheets-api.js';

/**
 * Vercel Serverless Function: Retry Failed Tracks
 *
 * This function processes failed attempts from the retry queue:
 * 1. Load failed entries from state
 * 2. Retry Spotify API calls for missing data
 * 3. Update corresponding ERROR rows in sheet with complete data
 * 4. Remove successful retries from queue
 * 5. Alert after 3 failed attempts
 *
 * Endpoint: /api/retry-failed
 * Method: GET (triggered by cron or manual request)
 * Response: JSON with retry results
 *
 * Retry Strategy:
 * - Attempt 1: Immediate (via this function)
 * - Attempt 2: 1 hour later
 * - Attempt 3: 24 hours later
 * - After 3 failures: Move to permanent error and alert
 */

const MAX_RETRY_ATTEMPTS = 3;
const MAX_ENTRIES_PER_RUN = 50;
const EXECUTION_TIMEOUT_MS = 45000; // 45 seconds to leave buffer

/**
 * Find the row index of an error entry in the sheet by track ID and timestamp
 * @param {array} sheetRows - All rows from the sheet
 * @param {string} trackId - Track ID to find
 * @param {string} playedAt - Played at timestamp
 * @returns {number|null} Row index (1-indexed) or null if not found
 */
function findErrorRowIndex(sheetRows, trackId, playedAt) {
  // Header is row 1, data starts at row 2
  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    // Track ID is column 8 (index 7), Status is column 27 (index 26)
    const rowTrackId = row[7];
    const rowStatus = row[26];
    const rowTimestamp = row[0];

    // Match by track ID, ERROR status, and similar timestamp
    if (rowTrackId === trackId && rowStatus === 'ERROR') {
      // Check if timestamps are within a few minutes of each other
      const rowTime = new Date(rowTimestamp).getTime();
      const targetTime = new Date(playedAt).getTime();
      const timeDiff = Math.abs(rowTime - targetTime);

      // Within 5 minutes is considered a match
      if (timeDiff < 5 * 60 * 1000) {
        return i + 1; // Return 1-indexed row number
      }
    }
  }

  return null;
}

/**
 * Check if enough time has passed since last retry attempt
 * @param {object} failedEntry - Failed queue entry
 * @returns {boolean} True if ready for retry
 */
function isReadyForRetry(failedEntry) {
  const lastAttempt = new Date(failedEntry.lastAttempt).getTime();
  const now = Date.now();
  const timeSinceLastAttempt = now - lastAttempt;

  // Retry intervals based on attempt count
  switch (failedEntry.attemptCount) {
    case 1:
      // First retry: at least 1 hour (3600000ms)
      return timeSinceLastAttempt >= 3600000;
    case 2:
      // Second retry: at least 24 hours (86400000ms)
      return timeSinceLastAttempt >= 86400000;
    default:
      // Already at max attempts
      return false;
  }
}

/**
 * Process a single failed entry
 * @param {object} failedEntry - Failed queue entry
 * @param {array} sheetRows - Current sheet data
 * @returns {Promise<object>} Result of the retry attempt
 */
async function processFailedEntry(failedEntry, sheetRows) {
  const { trackId, trackName, playedAt, partialData } = failedEntry;

  console.log(`[Retry Failed] Processing: ${trackName} (attempt ${failedEntry.attemptCount + 1})`);

  try {
    // Try to fetch missing data
    const track = partialData.track;

    // Fetch audio features
    const audioFeatures = await getAudioFeatures(track.id);

    // Fetch artist details for genres
    const artistIds = track.artists?.map(a => a.id) || [];
    const artists = artistIds.length > 0 ? await getBatchArtistDetails(artistIds) : [];
    const primaryArtist = artists[0] || null;

    // Format the complete track data
    const formatted = formatTrackForLogging(
      track,
      partialData,
      audioFeatures,
      primaryArtist,
      'COMPLETED',
      ''
    );

    // Find the ERROR row in the sheet
    const rowIndex = findErrorRowIndex(sheetRows, trackId, playedAt);

    if (rowIndex) {
      // Update the existing ERROR row with complete data
      const rowData = formatAsSheetRow(formatted);
      await updateRow('Listening Log', rowIndex, rowData);
      console.log(`[Retry Failed] Updated row ${rowIndex} for: ${trackName}`);
    } else {
      console.warn(`[Retry Failed] Could not find ERROR row for: ${trackName}`);
    }

    return {
      success: true,
      trackId,
      trackName,
      message: 'Retry successful'
    };

  } catch (error) {
    console.error(`[Retry Failed] Error retrying ${trackName}:`, error.message);

    return {
      success: false,
      trackId,
      trackName,
      error: error.message,
      attemptCount: failedEntry.attemptCount + 1
    };
  }
}

/**
 * Main serverless handler
 * @param {object} req - Vercel request object
 * @param {object} res - Vercel response object
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    maxedOut: 0,
    details: []
  };

  try {
    console.log('[Retry Failed] Starting retry processing...');

    // Load failed queue
    const failedQueue = await getFailedQueue();

    if (failedQueue.length === 0) {
      console.log('[Retry Failed] No failed entries to process');
      return res.status(200).json({
        success: true,
        message: 'No failed entries to process',
        stats: results,
        executionTimeMs: Date.now() - startTime
      });
    }

    console.log(`[Retry Failed] Found ${failedQueue.length} failed entries`);

    // Load sheet data for finding ERROR rows
    const sheetRows = await getAllRows('Listening Log');
    console.log(`[Retry Failed] Loaded ${sheetRows.length} rows from sheet`);

    // Load current state for updates
    const state = await loadState();

    // Process entries (max 50 per run, stop at 45s)
    const entriesToProcess = failedQueue.slice(0, MAX_ENTRIES_PER_RUN);
    const entriesToRemove = [];
    const entriesToUpdate = [];
    const maxedOutEntries = [];

    for (const entry of entriesToProcess) {
      // Check timeout
      if (Date.now() - startTime > EXECUTION_TIMEOUT_MS) {
        console.log('[Retry Failed] Approaching timeout, stopping processing');
        break;
      }

      // Check if entry has exceeded max attempts
      if (entry.attemptCount >= MAX_RETRY_ATTEMPTS) {
        console.log(`[Retry Failed] Max attempts reached for: ${entry.trackName}`);
        maxedOutEntries.push(entry);
        results.maxedOut++;
        continue;
      }

      // Check if ready for retry (based on time since last attempt)
      if (!isReadyForRetry(entry)) {
        console.log(`[Retry Failed] Not ready for retry: ${entry.trackName}`);
        results.skipped++;
        continue;
      }

      // Process the entry
      const result = await processFailedEntry(entry, sheetRows);
      results.processed++;
      results.details.push(result);

      if (result.success) {
        results.succeeded++;
        entriesToRemove.push({ trackId: entry.trackId, playedAt: entry.playedAt });
      } else {
        results.failed++;
        // Update entry with new attempt count
        entriesToUpdate.push({
          ...entry,
          attemptCount: result.attemptCount,
          lastAttempt: new Date().toISOString(),
          error: result.error
        });
      }
    }

    // Update state: remove successful retries
    for (const { trackId, playedAt } of entriesToRemove) {
      await clearFromFailedQueue(trackId, playedAt);
    }

    // Update state: update failed entries with new attempt counts
    if (entriesToUpdate.length > 0) {
      const currentState = await loadState();
      for (const updatedEntry of entriesToUpdate) {
        const index = currentState.failedQueue.findIndex(
          e => e.trackId === updatedEntry.trackId && e.playedAt === updatedEntry.playedAt
        );
        if (index >= 0) {
          currentState.failedQueue[index] = updatedEntry;
        }
      }
      await saveState(currentState);
    }

    // Handle maxed out entries (remove from queue, they're permanent failures)
    if (maxedOutEntries.length > 0) {
      const currentState = await loadState();
      for (const entry of maxedOutEntries) {
        currentState.failedQueue = currentState.failedQueue.filter(
          e => !(e.trackId === entry.trackId && e.playedAt === entry.playedAt)
        );
      }
      await saveState(currentState);
      console.log(`[Retry Failed] Removed ${maxedOutEntries.length} maxed-out entries from queue`);

      // TODO: Send alert for maxed out entries (Task 4.5)
    }

    // Update stats
    await updateStats(results.succeeded, results.failed);

    const executionTimeMs = Date.now() - startTime;
    console.log(`[Retry Failed] Completed in ${executionTimeMs}ms`);

    return res.status(200).json({
      success: true,
      message: 'Retry processing complete',
      stats: results,
      maxedOutTracks: maxedOutEntries.map(e => ({
        trackId: e.trackId,
        trackName: e.trackName,
        lastError: e.error
      })),
      executionTimeMs
    });

  } catch (error) {
    console.error('[Retry Failed] Fatal error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stats: results,
      executionTimeMs: Date.now() - startTime
    });
  }
}
