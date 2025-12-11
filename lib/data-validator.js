/**
 * Data Validation and Quality Checks Module
 *
 * Ensures logged data meets quality standards:
 * - Required fields are present
 * - Values are in valid ranges
 * - Timestamps are reasonable
 * - No encoding issues
 *
 * Validation Rules:
 * - Track name not empty
 * - Duration > 0 and < 1 hour (3,600,000ms)
 * - Play duration >= 30 seconds
 * - Audio features in valid ranges (0-1 for normalized)
 * - Timestamps within ±24 hours of current time
 * - No special characters that break sheet formatting
 */

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 */

// Validation thresholds
const MAX_DURATION_MS = 3600000; // 1 hour
const MIN_PLAY_DURATION_MS = 30000; // 30 seconds
const MAX_TIMESTAMP_DRIFT_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STRING_LENGTH = 500;

/**
 * Validate that a required field is present and not empty
 * @param {any} value - Value to check
 * @param {string} fieldName - Name of the field
 * @returns {string|null} Error message or null if valid
 */
function validateRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return `${fieldName} is required but missing`;
  }
  return null;
}

/**
 * Validate that a number is within a range
 * @param {number} value - Value to check
 * @param {string} fieldName - Name of the field
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {string|null} Error message or null if valid
 */
function validateRange(value, fieldName, min, max) {
  if (value === null || value === undefined) {
    return null; // Optional field
  }

  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a number`;
  }

  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}, got ${value}`;
  }

  return null;
}

/**
 * Validate that a string doesn't contain problematic characters
 * @param {string} value - String to check
 * @param {string} fieldName - Name of the field
 * @returns {string|null} Error message or null if valid
 */
function validateString(value, fieldName) {
  if (!value || typeof value !== 'string') {
    return null; // Optional or not a string
  }

  // Check length
  if (value.length > MAX_STRING_LENGTH) {
    return `${fieldName} exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }

  // Check for control characters (except newline and tab)
  const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  if (controlCharRegex.test(value)) {
    return `${fieldName} contains invalid control characters`;
  }

  return null;
}

/**
 * Validate timestamp is reasonable (within ±24 hours of now)
 * @param {string|Date} timestamp - Timestamp to validate
 * @param {string} fieldName - Name of the field
 * @returns {string|null} Error message or null if valid
 */
function validateTimestamp(timestamp, fieldName) {
  if (!timestamp) {
    return `${fieldName} is required`;
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return `${fieldName} is not a valid date`;
  }

  const now = Date.now();
  const diff = Math.abs(now - date.getTime());

  if (diff > MAX_TIMESTAMP_DRIFT_MS) {
    return `${fieldName} is more than 24 hours from current time`;
  }

  return null;
}

/**
 * Validate UTF-8 encoding
 * @param {string} text - Text to check
 * @param {string} fieldName - Name of the field
 * @returns {string|null} Error message or null if valid
 */
function validateUTF8(text, fieldName) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // Encode and decode to check for valid UTF-8
    const encoded = new TextEncoder().encode(text);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);

    if (decoded !== text) {
      return `${fieldName} contains invalid UTF-8 characters`;
    }
  } catch (error) {
    return `${fieldName} contains invalid UTF-8 encoding`;
  }

  return null;
}

/**
 * Validate track data has all required fields and valid values
 * @param {object} track - Track data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateTrackData(track) {
  const errors = [];
  const warnings = [];

  // Required fields
  const requiredError = validateRequired(track.trackName, 'Track Name');
  if (requiredError) errors.push(requiredError);

  const artistError = validateRequired(track.artists, 'Artist(s)');
  if (artistError) errors.push(artistError);

  const trackIdError = validateRequired(track.trackId, 'Track ID');
  if (trackIdError) errors.push(trackIdError);

  const timestampError = validateTimestamp(track.timestamp, 'Timestamp');
  if (timestampError) errors.push(timestampError);

  // Duration validation
  if (track.duration !== undefined && track.duration !== null) {
    if (track.duration <= 0) {
      errors.push('Duration must be greater than 0');
    } else if (track.duration > MAX_DURATION_MS) {
      warnings.push(`Duration ${track.duration}ms exceeds 1 hour - may be a podcast or audiobook`);
    }
  }

  // Play duration validation (should be at least 30 seconds for logging)
  if (track.playDuration !== undefined && track.playDuration < MIN_PLAY_DURATION_MS) {
    warnings.push(`Play duration ${track.playDuration}ms is less than 30 seconds`);
  }

  // String validation
  const trackNameStringError = validateString(track.trackName, 'Track Name');
  if (trackNameStringError) errors.push(trackNameStringError);

  const artistStringError = validateString(track.artists, 'Artist(s)');
  if (artistStringError) errors.push(artistStringError);

  const albumStringError = validateString(track.album, 'Album');
  if (albumStringError) errors.push(albumStringError);

  // UTF-8 validation
  const trackNameUtf8Error = validateUTF8(track.trackName, 'Track Name');
  if (trackNameUtf8Error) errors.push(trackNameUtf8Error);

  const artistUtf8Error = validateUTF8(track.artists, 'Artist(s)');
  if (artistUtf8Error) errors.push(artistUtf8Error);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate audio features are in valid ranges
 * @param {object} features - Audio features object
 * @returns {ValidationResult} Validation result
 */
export function validateAudioFeatures(features) {
  const errors = [];
  const warnings = [];

  if (!features) {
    return { valid: true, errors: [], warnings: ['No audio features provided'] };
  }

  // Normalized features (0-1 range)
  const normalizedFields = [
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
    'speechiness'
  ];

  for (const field of normalizedFields) {
    const error = validateRange(features[field], field, 0, 1);
    if (error) errors.push(error);
  }

  // Tempo (typically 0-300 BPM)
  const tempoError = validateRange(features.tempo, 'Tempo', 0, 300);
  if (tempoError) errors.push(tempoError);

  // Loudness (typically -60 to 0 dB)
  const loudnessError = validateRange(features.loudness, 'Loudness', -60, 5);
  if (loudnessError) errors.push(loudnessError);

  // Key (0-11)
  const keyError = validateRange(features.key, 'Key', -1, 11);
  if (keyError) errors.push(keyError);

  // Mode (0 or 1)
  const modeError = validateRange(features.mode, 'Mode', 0, 1);
  if (modeError) errors.push(modeError);

  // Time signature (typically 3-7)
  const timeSignatureError = validateRange(features.timeSignature, 'Time Signature', 1, 7);
  if (timeSignatureError) errors.push(timeSignatureError);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a complete formatted track ready for sheets
 * @param {object} formattedTrack - Formatted track object
 * @returns {ValidationResult} Validation result
 */
export function validateFormattedTrack(formattedTrack) {
  const errors = [];
  const warnings = [];

  // Validate track data
  const trackResult = validateTrackData(formattedTrack);
  errors.push(...trackResult.errors);
  warnings.push(...trackResult.warnings);

  // Validate audio features if present
  const audioFeatures = {
    energy: formattedTrack.energy,
    danceability: formattedTrack.danceability,
    valence: formattedTrack.valence,
    acousticness: formattedTrack.acousticness,
    instrumentalness: formattedTrack.instrumentalness,
    speechiness: formattedTrack.speechiness,
    tempo: formattedTrack.tempo,
    loudness: formattedTrack.loudness
  };

  const featuresResult = validateAudioFeatures(audioFeatures);
  errors.push(...featuresResult.errors);
  warnings.push(...featuresResult.warnings);

  // Validate status
  const validStatuses = ['COMPLETED', 'PENDING', 'ERROR'];
  if (formattedTrack.status && !validStatuses.includes(formattedTrack.status)) {
    errors.push(`Invalid status: ${formattedTrack.status}`);
  }

  // Validate completion percentage
  if (formattedTrack.completion !== undefined) {
    const completionError = validateRange(formattedTrack.completion, 'Completion %', 0, 100);
    if (completionError) errors.push(completionError);
  }

  // Validate popularity
  if (formattedTrack.popularity !== undefined) {
    const popularityError = validateRange(formattedTrack.popularity, 'Popularity', 0, 100);
    if (popularityError) errors.push(popularityError);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize a string for safe sheet insertion
 * @param {string} value - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Remove control characters
  let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate if too long
  if (sanitized.length > MAX_STRING_LENGTH) {
    sanitized = sanitized.substring(0, MAX_STRING_LENGTH - 3) + '...';
  }

  return sanitized;
}

/**
 * Sanitize track data for safe sheet insertion
 * @param {object} track - Track data to sanitize
 * @returns {object} Sanitized track data
 */
export function sanitizeTrackData(track) {
  return {
    ...track,
    trackName: sanitizeString(track.trackName),
    artists: sanitizeString(track.artists),
    album: sanitizeString(track.album),
    genres: sanitizeString(track.genres),
    device: sanitizeString(track.device),
    errorDetails: sanitizeString(track.errorDetails)
  };
}

/**
 * Generate a data quality report for a batch of tracks
 * @param {array} tracks - Array of formatted tracks
 * @returns {object} Quality report
 */
export function generateQualityReport(tracks) {
  const report = {
    totalTracks: tracks.length,
    validTracks: 0,
    invalidTracks: 0,
    warningCount: 0,
    errorCount: 0,
    issues: {
      missingFields: {},
      invalidRanges: {},
      encodingIssues: 0,
      timestampIssues: 0
    },
    sampleErrors: []
  };

  for (const track of tracks) {
    const result = validateFormattedTrack(track);

    if (result.valid) {
      report.validTracks++;
    } else {
      report.invalidTracks++;
      report.errorCount += result.errors.length;

      // Add sample errors (max 5)
      if (report.sampleErrors.length < 5) {
        report.sampleErrors.push({
          trackName: track.trackName,
          errors: result.errors
        });
      }

      // Categorize errors
      for (const error of result.errors) {
        if (error.includes('required')) {
          const field = error.split(' ')[0];
          report.issues.missingFields[field] = (report.issues.missingFields[field] || 0) + 1;
        } else if (error.includes('must be between')) {
          const field = error.split(' ')[0];
          report.issues.invalidRanges[field] = (report.issues.invalidRanges[field] || 0) + 1;
        } else if (error.includes('UTF-8') || error.includes('encoding')) {
          report.issues.encodingIssues++;
        } else if (error.includes('timestamp') || error.includes('date')) {
          report.issues.timestampIssues++;
        }
      }
    }

    report.warningCount += result.warnings.length;
  }

  // Calculate quality score (0-100)
  report.qualityScore = tracks.length > 0
    ? Math.round((report.validTracks / tracks.length) * 100)
    : 100;

  return report;
}

/**
 * Check if track is likely a podcast or audiobook
 * @param {object} track - Track data
 * @returns {boolean} True if likely not music
 */
export function isLikelyNonMusic(track) {
  // Long duration (>20 minutes)
  if (track.duration > 20 * 60 * 1000) {
    return true;
  }

  // High speechiness, low musicality
  if (track.speechiness > 0.7 && track.instrumentalness < 0.1) {
    return true;
  }

  // Check for podcast-like patterns in name
  const podcastPatterns = /\b(episode|ep\.|podcast|audiobook|chapter)\b/i;
  if (track.trackName && podcastPatterns.test(track.trackName)) {
    return true;
  }

  return false;
}

/**
 * Quick validation check (returns boolean only)
 * @param {object} track - Track to validate
 * @returns {boolean} True if valid
 */
export function isValid(track) {
  return validateFormattedTrack(track).valid;
}
