/**
 * Play Filter Module
 *
 * Implements logic to filter tracks that were played for at least 30 seconds.
 * Handles deduplication to avoid logging the same play session multiple times
 * while still capturing repeat plays of the same song.
 *
 * Filtering Rules:
 * - Track must be played for at least 30 seconds (30,000ms)
 * - Same track ID with same timestamp = duplicate (skip)
 * - Same track ID but 30+ seconds apart = new play (log it)
 * - Different track ID = new play (log it)
 */

const MIN_PLAY_DURATION_MS = 30000; // 30 seconds

/**
 * Check if a play qualifies for logging (30+ seconds)
 * @param {object} track - Recently played track item
 * @param {number} minDuration - Minimum duration in ms (default: 30000)
 * @returns {boolean} True if play qualifies for logging
 */
export function isValidPlay(track, minDuration = MIN_PLAY_DURATION_MS) {
  // For recently-played endpoint, we don't have precise play duration
  // We assume that if the track appears in recently-played, it was played for a significant duration
  // However, we can estimate based on track duration
  const trackDuration = track.track?.duration_ms || 0;

  // If track is shorter than minimum duration, it must have been played fully
  if (trackDuration < minDuration) {
    return trackDuration > 0; // Any playback of very short tracks counts
  }

  // For longer tracks, we assume they were played for at least the minimum duration
  // if they appear in the recently-played list
  // This is a limitation of the Spotify API - we don't get exact play duration
  return true;
}

/**
 * Calculate actual play time from track data
 * Note: Spotify's recently-played endpoint doesn't provide actual play duration,
 * only that the track was played. We can estimate based on context.
 *
 * @param {object} track - Recently played track item
 * @returns {number} Estimated play duration in milliseconds
 */
export function calculateActualPlayTime(track) {
  const trackDuration = track.track?.duration_ms || 0;

  // If we have progress_ms from currently-playing endpoint
  if (track.progress_ms !== undefined) {
    return track.progress_ms;
  }

  // For recently-played, we estimate that the track was played through
  // This is an assumption - Spotify doesn't provide exact play duration
  // in the recently-played endpoint
  return trackDuration;
}

/**
 * Check if a track is a duplicate of the last processed track
 * @param {object} track - Track to check
 * @param {object} lastProcessed - Last processed track state
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
    // (same play session, potential API inconsistency)
    if (timeDiff < MIN_PLAY_DURATION_MS) {
      console.log(`[Play Filter] Duplicate detected: ${track.track?.name} (time diff: ${timeDiff}ms)`);
      return true;
    }

    // If more than 30 seconds apart, it's a new play of the same song
    console.log(`[Play Filter] Repeat play detected: ${track.track?.name} (time diff: ${timeDiff}ms)`);
    return false;
  }

  // Different track ID = definitely not a duplicate
  return false;
}

/**
 * Filter new plays from recently played tracks
 * Returns only tracks that:
 * - Were played for at least 30 seconds
 * - Are not duplicates of already processed tracks
 * - Are newer than the last processed track
 *
 * @param {array} recentTracks - Array of recently played track items from Spotify API
 * @param {object} lastProcessedState - State containing last processed track info
 * @returns {array} Filtered array of tracks to log
 */
export function filterNewPlays(recentTracks, lastProcessedState) {
  if (!recentTracks || recentTracks.length === 0) {
    console.log('[Play Filter] No recent tracks to filter');
    return [];
  }

  console.log(`[Play Filter] Filtering ${recentTracks.length} recent tracks`);

  const lastProcessedTime = lastProcessedState?.lastProcessed?.playedAt
    ? new Date(lastProcessedState.lastProcessed.playedAt).getTime()
    : 0;

  const filteredTracks = recentTracks.filter(track => {
    // Check if valid play (30+ seconds)
    if (!isValidPlay(track)) {
      console.log(`[Play Filter] Skipping (too short): ${track.track?.name}`);
      return false;
    }

    // Check if duplicate
    if (isDuplicate(track, lastProcessedState?.lastProcessed)) {
      return false;
    }

    // Check if newer than last processed
    const playedAt = new Date(track.played_at).getTime();
    if (playedAt <= lastProcessedTime) {
      console.log(`[Play Filter] Skipping (already processed): ${track.track?.name}`);
      return false;
    }

    return true;
  });

  console.log(`[Play Filter] Filtered to ${filteredTracks.length} new plays`);

  return filteredTracks;
}

/**
 * Sort tracks by played_at timestamp (oldest first)
 * Ensures tracks are logged in chronological order
 *
 * @param {array} tracks - Array of track items
 * @returns {array} Sorted array of tracks
 */
export function sortTracksByTimestamp(tracks) {
  return [...tracks].sort((a, b) => {
    const timeA = new Date(a.played_at).getTime();
    const timeB = new Date(b.played_at).getTime();
    return timeA - timeB; // Oldest first
  });
}

/**
 * Get the most recent track from a list
 * @param {array} tracks - Array of track items
 * @returns {object|null} Most recent track or null if empty
 */
export function getMostRecentTrack(tracks) {
  if (!tracks || tracks.length === 0) {
    return null;
  }

  return tracks.reduce((latest, current) => {
    const latestTime = new Date(latest.played_at).getTime();
    const currentTime = new Date(current.played_at).getTime();
    return currentTime > latestTime ? current : latest;
  });
}

/**
 * Create state object for the last processed track
 * Used to update state after successful logging
 *
 * @param {object} track - Recently played track item
 * @returns {object} State object with trackId, timestamp, and playedAt
 */
export function createLastProcessedState(track) {
  return {
    trackId: track.track?.id || '',
    timestamp: new Date().toISOString(),
    playedAt: track.played_at
  };
}

/**
 * Detect if user is listening to same song on repeat
 * @param {array} tracks - Array of recent track items
 * @returns {object} Analysis of repeat behavior
 */
export function analyzeRepeatBehavior(tracks) {
  if (!tracks || tracks.length < 2) {
    return { isRepeating: false, repeatCount: 0 };
  }

  const firstTrackId = tracks[0].track?.id;
  let repeatCount = 1;

  for (let i = 1; i < tracks.length; i++) {
    if (tracks[i].track?.id === firstTrackId) {
      repeatCount++;
    } else {
      break;
    }
  }

  return {
    isRepeating: repeatCount > 1,
    repeatCount,
    trackName: tracks[0].track?.name
  };
}
