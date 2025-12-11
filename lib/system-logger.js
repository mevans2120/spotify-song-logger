import { appendRows, createSheetIfNotExists } from './sheets-api.js';

/**
 * System Logging Module
 *
 * Implements comprehensive system logging to the "System Logs" sheet
 * for monitoring, debugging, and operational visibility.
 *
 * Log Levels:
 * - INFO: Informational events (cron runs, successful operations)
 * - WARNING: Potential issues (rate limits, retries, degraded performance)
 * - ERROR: Actual errors (API failures, data issues)
 *
 * Event Types:
 * - SPOTIFY_AUTH_REFRESH
 * - SPOTIFY_API_ERROR
 * - SHEETS_API_ERROR
 * - DEDUPLICATION_SKIP
 * - RETRY_SUCCESS
 * - RETRY_FAILURE
 * - RETRY_MAX_ATTEMPTS
 * - CRON_EXECUTION_START
 * - CRON_EXECUTION_END
 * - HISTORICAL_IMPORT
 * - STATE_UPDATE
 * - ALERT_SENT
 */

const SYSTEM_LOGS_SHEET = 'System Logs';
const MAX_LOG_BATCH_SIZE = 10;
const LOG_RETENTION_COUNT = 1000;

// In-memory log buffer for batching
let logBuffer = [];
let isSheetInitialized = false;

/**
 * System log entry structure
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} level - INFO, WARNING, ERROR
 * @property {string} eventType - Event category
 * @property {string} details - Detailed message
 * @property {number} retryCount - Number of retry attempts (if applicable)
 * @property {string} resolutionTime - When issue was resolved (if applicable)
 * @property {string} affectedTracks - Track IDs affected (comma-separated)
 */

/**
 * Get system logs sheet headers
 * @returns {array} Header row
 */
function getSystemLogHeaders() {
  return [
    'Timestamp',
    'Log Level',
    'Event Type',
    'Details',
    'Retry Count',
    'Resolution Time',
    'Affected Tracks'
  ];
}

/**
 * Ensure system logs sheet exists
 * @returns {Promise<void>}
 */
async function ensureSheetExists() {
  if (isSheetInitialized) {
    return;
  }

  try {
    await createSheetIfNotExists(SYSTEM_LOGS_SHEET, getSystemLogHeaders());
    isSheetInitialized = true;
  } catch (error) {
    console.error('[System Logger] Failed to initialize sheet:', error.message);
    // Don't throw - we can still log to console
  }
}

/**
 * Format log entry as sheet row
 * @param {LogEntry} entry - Log entry
 * @returns {array} Row array for sheets
 */
function formatLogRow(entry) {
  return [
    entry.timestamp,
    entry.level,
    entry.eventType,
    entry.details,
    entry.retryCount || '',
    entry.resolutionTime || '',
    entry.affectedTracks || ''
  ];
}

/**
 * Write buffered logs to sheet
 * @returns {Promise<void>}
 */
async function flushLogs() {
  if (logBuffer.length === 0) {
    return;
  }

  try {
    await ensureSheetExists();

    const rows = logBuffer.map(formatLogRow);
    await appendRows(SYSTEM_LOGS_SHEET, rows);

    console.log(`[System Logger] Flushed ${logBuffer.length} log entries to sheet`);
    logBuffer = [];
  } catch (error) {
    console.error('[System Logger] Failed to flush logs:', error.message);
    // Keep logs in buffer for next attempt
  }
}

/**
 * Add log entry to buffer
 * @param {LogEntry} entry - Log entry to add
 * @returns {Promise<void>}
 */
async function addLogEntry(entry) {
  logBuffer.push(entry);

  // Auto-flush when buffer reaches max size
  if (logBuffer.length >= MAX_LOG_BATCH_SIZE) {
    await flushLogs();
  }
}

/**
 * Log an informational event
 * @param {string} eventType - Event category
 * @param {string} details - Detailed message
 * @param {object} options - Additional options
 * @param {string[]} options.affectedTracks - Track IDs affected
 * @returns {Promise<void>}
 */
export async function logInfo(eventType, details, options = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    eventType,
    details,
    retryCount: null,
    resolutionTime: null,
    affectedTracks: options.affectedTracks?.join(', ') || ''
  };

  console.log(`[INFO] [${eventType}] ${details}`);
  await addLogEntry(entry);
}

/**
 * Log a warning event
 * @param {string} eventType - Event category
 * @param {string} details - Detailed message
 * @param {object} options - Additional options
 * @param {string[]} options.affectedTracks - Track IDs affected
 * @param {number} options.retryCount - Retry attempt number
 * @returns {Promise<void>}
 */
export async function logWarning(eventType, details, options = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'WARNING',
    eventType,
    details,
    retryCount: options.retryCount || null,
    resolutionTime: null,
    affectedTracks: options.affectedTracks?.join(', ') || ''
  };

  console.warn(`[WARNING] [${eventType}] ${details}`);
  await addLogEntry(entry);
}

/**
 * Log an error event
 * @param {string} eventType - Event category
 * @param {string} details - Detailed message
 * @param {Error|string} error - Error object or message
 * @param {object} options - Additional options
 * @param {string[]} options.affectedTracks - Track IDs affected
 * @param {number} options.retryCount - Retry attempt number
 * @returns {Promise<void>}
 */
export async function logError(eventType, details, error, options = {}) {
  const errorMessage = error instanceof Error ? error.message : error;
  const fullDetails = `${details}: ${errorMessage}`;

  const entry = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    eventType,
    details: fullDetails,
    retryCount: options.retryCount || null,
    resolutionTime: null,
    affectedTracks: options.affectedTracks?.join(', ') || ''
  };

  console.error(`[ERROR] [${eventType}] ${fullDetails}`);
  await addLogEntry(entry);
}

/**
 * Log a retry attempt
 * @param {string} trackId - Track ID being retried
 * @param {string} trackName - Track name for readability
 * @param {number} attemptCount - Current attempt number
 * @param {string} error - Error message
 * @returns {Promise<void>}
 */
export async function logRetry(trackId, trackName, attemptCount, error) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: attemptCount >= 3 ? 'ERROR' : 'WARNING',
    eventType: attemptCount >= 3 ? 'RETRY_MAX_ATTEMPTS' : 'RETRY_FAILURE',
    details: `Retry ${attemptCount}/3 for "${trackName}": ${error}`,
    retryCount: attemptCount,
    resolutionTime: null,
    affectedTracks: trackId
  };

  console.warn(`[RETRY] Attempt ${attemptCount}/3 for "${trackName}": ${error}`);
  await addLogEntry(entry);
}

/**
 * Log successful resolution of an issue
 * @param {string} trackId - Track ID that was resolved
 * @param {string} trackName - Track name for readability
 * @param {string} originalTimestamp - When the issue first occurred
 * @returns {Promise<void>}
 */
export async function logResolution(trackId, trackName, originalTimestamp) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    eventType: 'RETRY_SUCCESS',
    details: `Successfully resolved issue for "${trackName}"`,
    retryCount: null,
    resolutionTime: new Date().toISOString(),
    affectedTracks: trackId
  };

  console.log(`[RESOLVED] Successfully resolved issue for "${trackName}"`);
  await addLogEntry(entry);
}

/**
 * Log cron execution start
 * @param {string} functionName - Name of the function being executed
 * @returns {Promise<void>}
 */
export async function logCronStart(functionName) {
  await logInfo('CRON_EXECUTION_START', `Starting ${functionName} execution`);
}

/**
 * Log cron execution end
 * @param {string} functionName - Name of the function
 * @param {object} stats - Execution statistics
 * @param {number} stats.duration - Execution time in ms
 * @param {number} stats.tracksLogged - Number of tracks logged
 * @param {number} stats.errors - Number of errors
 * @returns {Promise<void>}
 */
export async function logCronEnd(functionName, stats) {
  const details = `Completed ${functionName}: ${stats.tracksLogged || 0} tracks logged, ${stats.errors || 0} errors, ${stats.duration}ms`;
  await logInfo('CRON_EXECUTION_END', details);
}

/**
 * Log Spotify API error
 * @param {string} endpoint - API endpoint that failed
 * @param {Error|string} error - Error object or message
 * @param {object} options - Additional context
 * @returns {Promise<void>}
 */
export async function logSpotifyError(endpoint, error, options = {}) {
  await logError('SPOTIFY_API_ERROR', `Spotify API error on ${endpoint}`, error, options);
}

/**
 * Log Sheets API error
 * @param {string} operation - Operation that failed
 * @param {Error|string} error - Error object or message
 * @param {object} options - Additional context
 * @returns {Promise<void>}
 */
export async function logSheetsError(operation, error, options = {}) {
  await logError('SHEETS_API_ERROR', `Sheets API error during ${operation}`, error, options);
}

/**
 * Log authentication refresh
 * @param {boolean} success - Whether refresh was successful
 * @param {string} reason - Reason for refresh
 * @returns {Promise<void>}
 */
export async function logAuthRefresh(success, reason = 'Token expired') {
  if (success) {
    await logInfo('SPOTIFY_AUTH_REFRESH', `Token refreshed successfully: ${reason}`);
  } else {
    await logError('SPOTIFY_AUTH_REFRESH', 'Token refresh failed', reason);
  }
}

/**
 * Log deduplication skip
 * @param {string} trackId - Track ID that was skipped
 * @param {string} trackName - Track name
 * @param {string} reason - Reason for skipping
 * @returns {Promise<void>}
 */
export async function logDeduplicationSkip(trackId, trackName, reason) {
  await logInfo('DEDUPLICATION_SKIP', `Skipped "${trackName}": ${reason}`, {
    affectedTracks: [trackId]
  });
}

/**
 * Log alert sent
 * @param {string} alertType - Type of alert
 * @param {string} channel - Channel used (email, slack, etc.)
 * @param {string} message - Alert message
 * @returns {Promise<void>}
 */
export async function logAlertSent(alertType, channel, message) {
  await logInfo('ALERT_SENT', `Alert sent via ${channel}: ${alertType} - ${message}`);
}

/**
 * Flush any remaining logs in buffer
 * Should be called at the end of function execution
 * @returns {Promise<void>}
 */
export async function flush() {
  await flushLogs();
}

/**
 * Get current log buffer size (for debugging)
 * @returns {number} Number of logs in buffer
 */
export function getBufferSize() {
  return logBuffer.length;
}

/**
 * Clear log buffer without writing (for testing)
 */
export function clearBuffer() {
  logBuffer = [];
}

/**
 * Write a summary log entry at end of execution
 * @param {string} functionName - Function name
 * @param {object} summary - Execution summary
 * @returns {Promise<void>}
 */
export async function logExecutionSummary(functionName, summary) {
  const details = Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  await logInfo('EXECUTION_SUMMARY', `${functionName} - ${details}`);

  // Always flush at end of execution
  await flush();
}
