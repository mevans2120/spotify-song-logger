/**
 * Deduplication Logic Module
 *
 * Prevents duplicate logging of the same play session while allowing repeat plays of the same song.
 * Handles state reconciliation when local state and sheet data diverge.
 *
 * Duplicate detection rules:
 * - Same track ID AND timestamp within 30 seconds = duplicate
 * - Same track ID AND same progress position = duplicate
 * - Same track ID BUT 30+ seconds apart = new play (log it)
 */

const MIN_PLAY_DURATION_MS = 30000; // 30 seconds

/**
 * Check if a track is a duplicate based on state
 * This function is similar to isDuplicate in play-filter.js but specifically
 * for checking against persisted state
 *
 * @param {object} track - Track to check
 * @param {object} lastProcessed - Last processed track from state
 * @returns {boolean} True if track is a duplicate
 */
export function isDuplicate(track, lastProcessed) {
  if (!lastProcessed || !lastProcessed.trackId) {
    return false; // No previous track, can't be duplicate
  }

  const trackId = track.track?.id;
  const playedAt = new Date(track.played_at).getTime();
  const lastPlayedAt = new Date(lastProcessed.playedAt).getTime();

  // Same track ID
  if (trackId === lastProcessed.trackId) {
    // Check timestamp difference
    const timeDiff = Math.abs(playedAt - lastPlayedAt);

    // If played within 30 seconds of last log, it's likely a duplicate
    if (timeDiff < MIN_PLAY_DURATION_MS) {
      console.log(`[Deduplication] Duplicate detected: ${track.track?.name} (time diff: ${timeDiff}ms)`);
      return true;
    }

    // If more than 30 seconds apart, it's a new play of the same song
    console.log(`[Deduplication] Repeat play allowed: ${track.track?.name} (time diff: ${timeDiff}ms)`);
    return false;
  }

  // Different track ID = definitely not a duplicate
  return false;
}

/**
 * Extract last processed track from sheet rows
 * @param {array} sheetRows - Rows from the sheet (including header)
 * @returns {object|null} Last processed track info or null
 */
export function findLastProcessedInSheet(sheetRows) {
  if (!sheetRows || sheetRows.length <= 1) {
    // No data rows (only header or empty)
    return null;
  }

  // Get the last row (most recent entry)
  const lastRow = sheetRows[sheetRows.length - 1];

  // Sheet column indices (0-based)
  // 0: Timestamp, 1: Track Name, 7: Track ID
  const timestamp = lastRow[0];
  const trackName = lastRow[1];
  const trackId = lastRow[7];

  if (!trackId || !timestamp) {
    console.warn('[Deduplication] Last row in sheet is missing track ID or timestamp');
    return null;
  }

  return {
    trackId: trackId,
    trackName: trackName,
    timestamp: timestamp,
    playedAt: timestamp // Use the logged timestamp as playedAt
  };
}

/**
 * Reconcile state when local state and sheet data diverge
 * This happens when:
 * - State file was deleted
 * - Manual edits to the sheet
 * - Multiple instances running (shouldn't happen, but just in case)
 *
 * @param {array} sheetData - All rows from the sheet
 * @param {object} localState - Current local state
 * @returns {object} Reconciled state to use
 */
export function reconcileState(sheetData, localState) {
  const sheetLastProcessed = findLastProcessedInSheet(sheetData);

  // If no data in sheet, use local state
  if (!sheetLastProcessed) {
    console.log('[Deduplication] Sheet is empty, using local state');
    return localState;
  }

  // If no local state, use sheet data
  if (!localState || !localState.lastProcessed) {
    console.log('[Deduplication] No local state, using sheet data as source of truth');
    return {
      lastProcessed: sheetLastProcessed,
      failedQueue: localState?.failedQueue || [],
      stats: localState?.stats || { lastRun: null, successCount: 0, failureCount: 0 }
    };
  }

  // Both exist - compare timestamps
  const sheetTime = new Date(sheetLastProcessed.playedAt).getTime();
  const localTime = new Date(localState.lastProcessed.playedAt).getTime();

  if (sheetTime > localTime) {
    console.warn('[Deduplication] Sheet has newer data than local state. Using sheet data.');
    console.warn(`  Sheet last: ${sheetLastProcessed.trackName} at ${sheetLastProcessed.playedAt}`);
    console.warn(`  Local last: ${localState.lastProcessed.trackId} at ${localState.lastProcessed.playedAt}`);

    return {
      lastProcessed: sheetLastProcessed,
      failedQueue: localState.failedQueue,
      stats: localState.stats
    };
  }

  if (localTime > sheetTime) {
    console.warn('[Deduplication] Local state has newer data than sheet. This is unusual.');
    console.warn(`  Local last: ${localState.lastProcessed.trackId} at ${localState.lastProcessed.playedAt}`);
    console.warn(`  Sheet last: ${sheetLastProcessed.trackName} at ${sheetLastProcessed.playedAt}`);
    console.warn('  Using local state, but this may indicate a sync issue.');
  }

  // Local state is newer or equal - use it
  return localState;
}

/**
 * Check if a track is already in the sheet
 * @param {object} track - Track to check
 * @param {array} sheetRows - All rows from sheet (including header)
 * @returns {boolean} True if track is already logged
 */
export function isTrackInSheet(track, sheetRows) {
  if (!sheetRows || sheetRows.length <= 1) {
    return false; // No data rows
  }

  const trackId = track.track?.id;
  const playedAt = new Date(track.played_at).getTime();

  // Skip header row
  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const rowTrackId = row[7]; // Track ID column
    const rowTimestamp = row[0]; // Timestamp column

    if (!rowTrackId || !rowTimestamp) {
      continue;
    }

    // Check if same track and similar timestamp (within 30 seconds)
    if (rowTrackId === trackId) {
      const rowTime = new Date(rowTimestamp).getTime();
      const timeDiff = Math.abs(playedAt - rowTime);

      if (timeDiff < MIN_PLAY_DURATION_MS) {
        console.log(`[Deduplication] Track already in sheet: ${track.track?.name}`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter out tracks that are already in the sheet
 * @param {array} tracks - Array of tracks to check
 * @param {array} sheetRows - All rows from sheet
 * @returns {array} Tracks not in sheet
 */
export function filterDuplicatesAgainstSheet(tracks, sheetRows) {
  if (!tracks || tracks.length === 0) {
    return [];
  }

  const filtered = tracks.filter(track => !isTrackInSheet(track, sheetRows));

  const duplicateCount = tracks.length - filtered.length;
  if (duplicateCount > 0) {
    console.log(`[Deduplication] Filtered out ${duplicateCount} duplicate(s) found in sheet`);
  }

  return filtered;
}

/**
 * Validate state structure
 * @param {object} state - State to validate
 * @returns {boolean} True if state is valid
 */
export function validateState(state) {
  if (!state) {
    return false;
  }

  // Check required fields exist
  if (typeof state !== 'object') {
    return false;
  }

  // Validate failedQueue is an array
  if (state.failedQueue && !Array.isArray(state.failedQueue)) {
    return false;
  }

  // Validate stats structure
  if (state.stats) {
    if (typeof state.stats !== 'object') {
      return false;
    }
    if (typeof state.stats.successCount !== 'number' || typeof state.stats.failureCount !== 'number') {
      return false;
    }
  }

  // Validate lastProcessed structure
  if (state.lastProcessed) {
    if (typeof state.lastProcessed !== 'object') {
      return false;
    }
    if (!state.lastProcessed.trackId || !state.lastProcessed.playedAt) {
      return false;
    }
  }

  return true;
}
