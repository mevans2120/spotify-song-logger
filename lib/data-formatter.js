/**
 * Data Transformation and Formatting Module
 *
 * Transforms Spotify API responses into the standardized format needed for Google Sheets logging.
 * Handles all 28 required fields and manages edge cases like missing data, multiple artists, etc.
 *
 * Sheet columns (28 total):
 * 1. Timestamp
 * 2. Track Name
 * 3. Artist(s)
 * 4. Album
 * 5. Duration (ms)
 * 6. Play Duration (ms)
 * 7. Completion %
 * 8. Track ID
 * 9. Album ID
 * 10. Artist ID(s)
 * 11. Genres
 * 12. Tempo
 * 13. Energy
 * 14. Danceability
 * 15. Valence
 * 16. Acousticness
 * 17. Instrumentalness
 * 18. Speechiness
 * 19. Loudness
 * 20. Popularity
 * 21. Device
 * 22. Device Type
 * 23. Context
 * 24. Context URI
 * 25. Explicit
 * 26. Release Date
 * 27. Status
 * 28. Error Details
 */

/**
 * Format timestamp in ISO 8601 format
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted timestamp
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toISOString();
}

/**
 * Extract playback context information
 * @param {object} playbackInfo - Recently played item or current playback data
 * @returns {object} Extracted context data
 */
export function extractPlaybackContext(playbackInfo) {
  const context = playbackInfo.context || {};

  return {
    device: playbackInfo.device?.name || 'Unknown Device',
    deviceType: playbackInfo.device?.type || 'Unknown',
    contextType: context.type || 'None',
    contextUri: context.uri || '',
    shuffleState: playbackInfo.shuffle_state || false,
    repeatState: playbackInfo.repeat_state || 'off'
  };
}

/**
 * Calculate actual play duration based on track and playback info
 * @param {object} track - Track data
 * @param {object} playbackInfo - Playback information
 * @returns {number} Play duration in milliseconds
 */
export function calculatePlayDuration(track, playbackInfo) {
  // For recently-played endpoint, we don't have precise play duration
  // We'll estimate based on the track duration unless we have specific data
  const trackDuration = track.duration_ms || 0;

  // If we have progress info from currently-playing endpoint
  if (playbackInfo.progress_ms !== undefined) {
    return playbackInfo.progress_ms;
  }

  // Default to full track duration for recently played tracks
  // (They played it through if it appears in recently played)
  return trackDuration;
}

/**
 * Calculate completion percentage
 * @param {number} playDuration - Duration played in ms
 * @param {number} trackDuration - Total track duration in ms
 * @returns {number} Completion percentage (0-100)
 */
export function calculateCompletionPercentage(playDuration, trackDuration) {
  if (!trackDuration || trackDuration === 0) {
    return 0;
  }

  const percentage = (playDuration / trackDuration) * 100;
  return Math.min(100, Math.round(percentage * 100) / 100); // Round to 2 decimals
}

/**
 * Format track data for logging to Google Sheets
 * Combines track data, playback info, and audio features into a single formatted object
 *
 * @param {object} track - Track data from Spotify API
 * @param {object} playbackInfo - Playback context and device info
 * @param {object} audioFeatures - Audio features from Spotify API (optional)
 * @param {object} artistDetails - Artist details including genres (optional)
 * @param {string} status - Status of the logging attempt (COMPLETED, PENDING, ERROR)
 * @param {string} errorDetails - Error details if status is ERROR
 * @returns {object} Formatted data object ready for Google Sheets
 */
export function formatTrackForLogging(
  track,
  playbackInfo,
  audioFeatures = null,
  artistDetails = null,
  status = 'COMPLETED',
  errorDetails = ''
) {
  // Extract basic track info
  const trackName = track.name || 'Unknown Track';
  const artists = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
  const artistIds = track.artists?.map(a => a.id).join(', ') || '';
  const album = track.album?.name || 'Unknown Album';
  const albumId = track.album?.id || '';
  const trackId = track.id || '';
  const duration = track.duration_ms || 0;
  const popularity = track.popularity || 0;
  const explicit = track.explicit || false;
  const releaseDate = track.album?.release_date || '';

  // Extract playback context
  const context = extractPlaybackContext(playbackInfo);

  // Calculate play duration and completion
  const playDuration = calculatePlayDuration(track, playbackInfo);
  const completion = calculateCompletionPercentage(playDuration, duration);

  // Extract timestamp
  const timestamp = formatTimestamp(playbackInfo.played_at || playbackInfo.timestamp);

  // Extract genres from artist details
  let genres = '';
  if (artistDetails && artistDetails.genres) {
    genres = artistDetails.genres.join(', ');
  } else if (track.artists && track.artists[0]?.genres) {
    genres = track.artists[0].genres.join(', ');
  }

  // Extract audio features with defaults
  const tempo = audioFeatures?.tempo || null;
  const energy = audioFeatures?.energy || null;
  const danceability = audioFeatures?.danceability || null;
  const valence = audioFeatures?.valence || null;
  const acousticness = audioFeatures?.acousticness || null;
  const instrumentalness = audioFeatures?.instrumentalness || null;
  const speechiness = audioFeatures?.speechiness || null;
  const loudness = audioFeatures?.loudness || null;

  // Return formatted object matching Google Sheets structure (28 columns)
  return {
    timestamp,
    trackName,
    artists,
    album,
    duration,
    playDuration,
    completion,
    trackId,
    albumId,
    artistIds,
    genres,
    tempo,
    energy,
    danceability,
    valence,
    acousticness,
    instrumentalness,
    speechiness,
    loudness,
    popularity,
    device: context.device,
    deviceType: context.deviceType,
    context: context.contextType,
    contextUri: context.contextUri,
    explicit,
    releaseDate,
    status,
    errorDetails
  };
}

/**
 * Convert formatted track object to Google Sheets row array
 * @param {object} formattedTrack - Track data formatted by formatTrackForLogging
 * @returns {array} Array of values in correct column order for Google Sheets
 */
export function formatAsSheetRow(formattedTrack) {
  return [
    formattedTrack.timestamp,
    formattedTrack.trackName,
    formattedTrack.artists,
    formattedTrack.album,
    formattedTrack.duration,
    formattedTrack.playDuration,
    formattedTrack.completion,
    formattedTrack.trackId,
    formattedTrack.albumId,
    formattedTrack.artistIds,
    formattedTrack.genres,
    formattedTrack.tempo,
    formattedTrack.energy,
    formattedTrack.danceability,
    formattedTrack.valence,
    formattedTrack.acousticness,
    formattedTrack.instrumentalness,
    formattedTrack.speechiness,
    formattedTrack.loudness,
    formattedTrack.popularity,
    formattedTrack.device,
    formattedTrack.deviceType,
    formattedTrack.context,
    formattedTrack.contextUri,
    formattedTrack.explicit,
    formattedTrack.releaseDate,
    formattedTrack.status,
    formattedTrack.errorDetails
  ];
}

/**
 * Get Google Sheets header row
 * @returns {array} Header row for the Listening Log sheet
 */
export function getSheetHeaders() {
  return [
    'Timestamp',
    'Track Name',
    'Artist(s)',
    'Album',
    'Duration (ms)',
    'Play Duration (ms)',
    'Completion %',
    'Track ID',
    'Album ID',
    'Artist ID(s)',
    'Genres',
    'Tempo',
    'Energy',
    'Danceability',
    'Valence',
    'Acousticness',
    'Instrumentalness',
    'Speechiness',
    'Loudness',
    'Popularity',
    'Device',
    'Device Type',
    'Context',
    'Context URI',
    'Explicit',
    'Release Date',
    'Status',
    'Error Details'
  ];
}

/**
 * Validate that a formatted track has all required fields
 * @param {object} formattedTrack - Formatted track object
 * @returns {object} Validation result with { valid: boolean, missing: string[] }
 */
export function validateFormattedTrack(formattedTrack) {
  const requiredFields = [
    'timestamp',
    'trackName',
    'artists',
    'album',
    'trackId',
    'status'
  ];

  const missing = requiredFields.filter(field => !formattedTrack[field]);

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Create error placeholder row for failed track processing
 * @param {object} partialTrack - Partial track data available
 * @param {string} error - Error message
 * @returns {object} Formatted track object with ERROR status
 */
export function createErrorPlaceholder(partialTrack, error) {
  return {
    timestamp: formatTimestamp(partialTrack.played_at || new Date()),
    trackName: partialTrack.track?.name || 'ERROR: Unable to fetch',
    artists: partialTrack.track?.artists?.[0]?.name || 'Unknown',
    album: partialTrack.track?.album?.name || 'Unknown',
    duration: partialTrack.track?.duration_ms || 0,
    playDuration: 0,
    completion: 0,
    trackId: partialTrack.track?.id || '',
    albumId: partialTrack.track?.album?.id || '',
    artistIds: partialTrack.track?.artists?.[0]?.id || '',
    genres: '',
    tempo: null,
    energy: null,
    danceability: null,
    valence: null,
    acousticness: null,
    instrumentalness: null,
    speechiness: null,
    loudness: null,
    popularity: null,
    device: 'Unknown',
    deviceType: 'Unknown',
    context: 'None',
    contextUri: '',
    explicit: false,
    releaseDate: '',
    status: 'ERROR',
    errorDetails: error
  };
}
