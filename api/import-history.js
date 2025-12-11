import { getRecentlyPlayed, getAudioFeatures, getBatchArtistDetails, getBatchAudioFeatures } from '../lib/spotify-api.js';
import { formatTrackForLogging, formatAsSheetRow, getSheetHeaders } from '../lib/data-formatter.js';
import { appendRows, createSheetIfNotExists, getAllRows } from '../lib/sheets-api.js';
import { loadState, saveState } from '../lib/state-manager.js';

/**
 * Vercel Serverless Function: Historical Import
 *
 * Performs a one-time import of the last 50 songs from Spotify into the
 * "Historical Data" sheet. This is separate from the main "Listening Log"
 * to distinguish historical data from real-time logging.
 *
 * Features:
 * - Idempotent: Can be run multiple times without duplicating data
 * - Rate limiting: 1 request per 500ms to avoid hitting Spotify limits
 * - Progress tracking: Stores import state in case of failure
 * - Batch operations: Uses batch audio features API for efficiency
 *
 * Endpoint: /api/import-history
 * Method: GET (manual trigger only)
 * Query params:
 *   - force=true: Force re-import even if already completed
 *   - limit=N: Import only N tracks (default: 50, max: 50)
 * Response: JSON with import results
 */

const SHEET_NAME = 'Historical Data';
const DEFAULT_LIMIT = 50;
const REQUEST_DELAY_MS = 500; // 500ms between API calls to avoid rate limits

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get historical import state
 * @returns {Promise<object>} Import state
 */
async function getImportState() {
  const state = await loadState();
  return state.historicalImport || {
    completed: false,
    lastImportDate: null,
    importedTrackIds: [],
    totalImported: 0
  };
}

/**
 * Save historical import state
 * @param {object} importState - Import state to save
 * @returns {Promise<void>}
 */
async function saveImportState(importState) {
  const state = await loadState();
  state.historicalImport = importState;
  await saveState(state);
}

/**
 * Check if a track was already imported
 * @param {string} trackId - Track ID
 * @param {string} playedAt - Played at timestamp
 * @param {array} existingRows - Existing rows in the sheet
 * @returns {boolean} True if already imported
 */
function isAlreadyImported(trackId, playedAt, existingRows) {
  // Check sheet rows for existing entry
  // Track ID is column 8 (index 7), Timestamp is column 1 (index 0)
  for (let i = 1; i < existingRows.length; i++) {
    const row = existingRows[i];
    const rowTrackId = row[7];
    const rowTimestamp = row[0];

    if (rowTrackId === trackId) {
      // Check if timestamps are within a few minutes
      const rowTime = new Date(rowTimestamp).getTime();
      const targetTime = new Date(playedAt).getTime();
      const timeDiff = Math.abs(rowTime - targetTime);

      if (timeDiff < 5 * 60 * 1000) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get headers for Historical Data sheet (same as Listening Log + Import Timestamp)
 * @returns {array} Header row
 */
function getHistoricalHeaders() {
  const baseHeaders = getSheetHeaders();
  return [...baseHeaders, 'Import Timestamp'];
}

/**
 * Main serverless handler
 * @param {object} req - Vercel request object
 * @param {object} res - Vercel response object
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  const results = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    tracks: []
  };

  try {
    const forceImport = req.query.force === 'true';
    const limit = Math.min(
      parseInt(req.query.limit || DEFAULT_LIMIT, 10),
      50 // Spotify API max
    );

    console.log('[Import History] Starting historical import...');
    console.log(`[Import History] Force: ${forceImport}, Limit: ${limit}`);

    // Check if already imported (unless force=true)
    const importState = await getImportState();

    if (importState.completed && !forceImport) {
      console.log('[Import History] Already completed. Use force=true to re-import.');
      return res.status(200).json({
        success: true,
        message: 'Historical import already completed',
        lastImportDate: importState.lastImportDate,
        totalImported: importState.totalImported,
        hint: 'Use ?force=true to re-import'
      });
    }

    // Ensure the Historical Data sheet exists
    console.log('[Import History] Ensuring sheet exists...');
    await createSheetIfNotExists(SHEET_NAME, getHistoricalHeaders());

    // Get existing rows for deduplication
    const existingRows = await getAllRows(SHEET_NAME);
    console.log(`[Import History] Found ${existingRows.length - 1} existing entries`);

    // Fetch recently played tracks from Spotify
    console.log(`[Import History] Fetching last ${limit} tracks from Spotify...`);
    const recentlyPlayed = await getRecentlyPlayed(limit);
    const tracks = recentlyPlayed.items || [];
    results.fetched = tracks.length;

    console.log(`[Import History] Fetched ${tracks.length} tracks`);

    if (tracks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No tracks found to import',
        stats: results,
        executionTimeMs: Date.now() - startTime
      });
    }

    // Batch fetch audio features for all tracks
    console.log('[Import History] Fetching audio features (batch)...');
    const trackIds = tracks.map(t => t.track.id);
    const audioFeaturesMap = {};

    try {
      const batchFeatures = await getBatchAudioFeatures(trackIds);
      batchFeatures.forEach((features, index) => {
        if (features) {
          audioFeaturesMap[trackIds[index]] = features;
        }
      });
      console.log(`[Import History] Got audio features for ${Object.keys(audioFeaturesMap).length} tracks`);
    } catch (error) {
      console.warn('[Import History] Batch audio features failed:', error.message);
    }

    // Process each track
    const rowsToAppend = [];
    const importTimestamp = new Date().toISOString();

    for (const item of tracks) {
      const track = item.track;
      const trackId = track.id;
      const playedAt = item.played_at;

      // Check for duplicates
      if (isAlreadyImported(trackId, playedAt, existingRows)) {
        console.log(`[Import History] Skipping (duplicate): ${track.name}`);
        results.skipped++;
        continue;
      }

      try {
        // Get audio features (from batch or fetch individually)
        let audioFeatures = audioFeaturesMap[trackId];
        if (!audioFeatures) {
          await sleep(REQUEST_DELAY_MS);
          try {
            audioFeatures = await getAudioFeatures(trackId);
          } catch (e) {
            console.warn(`[Import History] Could not get audio features for: ${track.name}`);
          }
        }

        // Get artist details for genres
        let primaryArtist = null;
        if (track.artists && track.artists.length > 0) {
          await sleep(REQUEST_DELAY_MS);
          try {
            const artistIds = track.artists.map(a => a.id);
            const artists = await getBatchArtistDetails(artistIds.slice(0, 1));
            primaryArtist = artists[0] || null;
          } catch (e) {
            console.warn(`[Import History] Could not get artist details for: ${track.name}`);
          }
        }

        // Format track data
        const formatted = formatTrackForLogging(
          track,
          item,
          audioFeatures,
          primaryArtist,
          'COMPLETED',
          ''
        );

        // Convert to sheet row and add import timestamp
        const row = formatAsSheetRow(formatted);
        row.push(importTimestamp); // Add import timestamp as last column

        rowsToAppend.push(row);
        results.imported++;
        results.tracks.push({
          name: track.name,
          artist: track.artists?.[0]?.name || 'Unknown',
          playedAt: playedAt
        });

        console.log(`[Import History] Prepared: ${track.name}`);

      } catch (error) {
        console.error(`[Import History] Error processing ${track.name}:`, error.message);
        results.failed++;
      }
    }

    // Batch append all rows to the sheet
    if (rowsToAppend.length > 0) {
      console.log(`[Import History] Appending ${rowsToAppend.length} rows to sheet...`);
      await appendRows(SHEET_NAME, rowsToAppend);
      console.log('[Import History] Rows appended successfully');
    }

    // Update import state
    const newImportState = {
      completed: true,
      lastImportDate: importTimestamp,
      importedTrackIds: tracks.map(t => t.track.id),
      totalImported: (importState.totalImported || 0) + results.imported
    };
    await saveImportState(newImportState);

    const executionTimeMs = Date.now() - startTime;
    console.log(`[Import History] Completed in ${executionTimeMs}ms`);

    return res.status(200).json({
      success: true,
      message: 'Historical import completed',
      stats: results,
      recentTracks: results.tracks.slice(0, 5),
      executionTimeMs
    });

  } catch (error) {
    console.error('[Import History] Fatal error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stats: results,
      executionTimeMs: Date.now() - startTime
    });
  }
}
