import { loadState, saveState } from './state-manager.js';

/**
 * Performance Monitoring and Metrics Module
 *
 * Tracks system health and performance metrics:
 * - Execution times per function
 * - API call counts and success rates
 * - Error counts by type
 * - Tracks logged per day
 * - Weekly aggregated summaries
 *
 * Metrics are stored in state (KV in production, local file in dev)
 * with daily aggregation.
 */

// In-memory metrics for current execution
let currentExecutionMetrics = {
  startTime: null,
  functionName: null,
  apiCalls: [],
  errors: [],
  tracksProcessed: 0,
  tracksLogged: 0
};

/**
 * Get today's date key for metrics storage
 * @returns {string} Date key in YYYY-MM-DD format
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get metrics state from storage
 * @returns {Promise<object>} Metrics state
 */
async function getMetricsState() {
  const state = await loadState();
  return state.metrics || {
    daily: {},
    lastReset: null,
    totals: {
      totalExecutions: 0,
      totalTracksLogged: 0,
      totalErrors: 0,
      totalApiCalls: 0
    }
  };
}

/**
 * Save metrics state to storage
 * @param {object} metricsState - Metrics state to save
 * @returns {Promise<void>}
 */
async function saveMetricsState(metricsState) {
  const state = await loadState();
  state.metrics = metricsState;
  await saveState(state);
}

/**
 * Initialize metrics for daily aggregation
 * @returns {object} Empty daily metrics object
 */
function initDailyMetrics() {
  return {
    executions: 0,
    totalExecutionTime: 0,
    avgExecutionTime: 0,
    maxExecutionTime: 0,
    minExecutionTime: Infinity,
    tracksLogged: 0,
    tracksProcessed: 0,
    apiCalls: {
      spotify: { total: 0, success: 0, failed: 0 },
      sheets: { total: 0, success: 0, failed: 0 }
    },
    errors: {
      spotify: 0,
      sheets: 0,
      validation: 0,
      other: 0
    },
    successRate: 100,
    hourlyExecutions: {}
  };
}

/**
 * Start tracking execution metrics for a function
 * @param {string} functionName - Name of the function being executed
 */
export function startExecution(functionName) {
  currentExecutionMetrics = {
    startTime: Date.now(),
    functionName,
    apiCalls: [],
    errors: [],
    tracksProcessed: 0,
    tracksLogged: 0
  };

  console.log(`[Metrics] Started tracking: ${functionName}`);
}

/**
 * Track an API call
 * @param {string} service - Service name ('spotify' or 'sheets')
 * @param {string} endpoint - API endpoint
 * @param {number} duration - Call duration in ms
 * @param {boolean} success - Whether the call succeeded
 */
export function trackApiCall(service, endpoint, duration, success) {
  currentExecutionMetrics.apiCalls.push({
    service,
    endpoint,
    duration,
    success,
    timestamp: new Date().toISOString()
  });

  if (!success) {
    console.log(`[Metrics] API call failed: ${service}/${endpoint} (${duration}ms)`);
  }
}

/**
 * Track an error
 * @param {string} errorType - Type of error ('spotify', 'sheets', 'validation', 'other')
 * @param {Error|string} error - Error object or message
 */
export function trackError(errorType, error) {
  const errorMessage = error instanceof Error ? error.message : error;

  currentExecutionMetrics.errors.push({
    type: errorType,
    message: errorMessage,
    timestamp: new Date().toISOString()
  });

  console.log(`[Metrics] Error tracked: ${errorType} - ${errorMessage}`);
}

/**
 * Track tracks processed and logged
 * @param {number} processed - Number of tracks processed
 * @param {number} logged - Number of tracks successfully logged
 */
export function trackTracks(processed, logged) {
  currentExecutionMetrics.tracksProcessed += processed;
  currentExecutionMetrics.tracksLogged += logged;
}

/**
 * End execution tracking and save metrics
 * @returns {Promise<object>} Execution summary
 */
export async function endExecution() {
  if (!currentExecutionMetrics.startTime) {
    console.warn('[Metrics] No execution started');
    return null;
  }

  const duration = Date.now() - currentExecutionMetrics.startTime;
  const today = getTodayKey();
  const hour = new Date().getHours().toString();

  // Get current metrics state
  const metricsState = await getMetricsState();

  // Initialize today's metrics if needed
  if (!metricsState.daily[today]) {
    metricsState.daily[today] = initDailyMetrics();
  }

  const dailyMetrics = metricsState.daily[today];

  // Update execution metrics
  dailyMetrics.executions++;
  dailyMetrics.totalExecutionTime += duration;
  dailyMetrics.avgExecutionTime = Math.round(
    dailyMetrics.totalExecutionTime / dailyMetrics.executions
  );
  dailyMetrics.maxExecutionTime = Math.max(dailyMetrics.maxExecutionTime, duration);
  dailyMetrics.minExecutionTime = Math.min(dailyMetrics.minExecutionTime, duration);

  // Track hourly executions
  dailyMetrics.hourlyExecutions[hour] = (dailyMetrics.hourlyExecutions[hour] || 0) + 1;

  // Update track counts
  dailyMetrics.tracksProcessed += currentExecutionMetrics.tracksProcessed;
  dailyMetrics.tracksLogged += currentExecutionMetrics.tracksLogged;

  // Update API call metrics
  for (const call of currentExecutionMetrics.apiCalls) {
    const serviceMetrics = dailyMetrics.apiCalls[call.service];
    if (serviceMetrics) {
      serviceMetrics.total++;
      if (call.success) {
        serviceMetrics.success++;
      } else {
        serviceMetrics.failed++;
      }
    }
  }

  // Update error metrics
  for (const error of currentExecutionMetrics.errors) {
    if (dailyMetrics.errors[error.type] !== undefined) {
      dailyMetrics.errors[error.type]++;
    } else {
      dailyMetrics.errors.other++;
    }
  }

  // Calculate success rate
  const totalOps = dailyMetrics.tracksProcessed;
  const failedOps = Object.values(dailyMetrics.errors).reduce((a, b) => a + b, 0);
  dailyMetrics.successRate = totalOps > 0
    ? Math.round(((totalOps - failedOps) / totalOps) * 100)
    : 100;

  // Update totals
  metricsState.totals.totalExecutions++;
  metricsState.totals.totalTracksLogged += currentExecutionMetrics.tracksLogged;
  metricsState.totals.totalErrors += currentExecutionMetrics.errors.length;
  metricsState.totals.totalApiCalls += currentExecutionMetrics.apiCalls.length;

  // Save updated metrics
  await saveMetricsState(metricsState);

  // Create execution summary
  const summary = {
    functionName: currentExecutionMetrics.functionName,
    duration,
    tracksProcessed: currentExecutionMetrics.tracksProcessed,
    tracksLogged: currentExecutionMetrics.tracksLogged,
    apiCalls: currentExecutionMetrics.apiCalls.length,
    errors: currentExecutionMetrics.errors.length
  };

  console.log(`[Metrics] Execution complete: ${duration}ms, ${summary.tracksLogged} tracks, ${summary.errors} errors`);

  // Reset current execution
  currentExecutionMetrics = {
    startTime: null,
    functionName: null,
    apiCalls: [],
    errors: [],
    tracksProcessed: 0,
    tracksLogged: 0
  };

  return summary;
}

/**
 * Get metrics summary for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (default: today)
 * @returns {Promise<object>} Daily metrics summary
 */
export async function getDailyMetrics(date = getTodayKey()) {
  const metricsState = await getMetricsState();
  return metricsState.daily[date] || initDailyMetrics();
}

/**
 * Get aggregated metrics summary
 * @returns {Promise<object>} Aggregated metrics
 */
export async function getMetricsSummary() {
  const metricsState = await getMetricsState();
  const today = getTodayKey();
  const todayMetrics = metricsState.daily[today] || initDailyMetrics();

  return {
    today: todayMetrics,
    totals: metricsState.totals,
    lastReset: metricsState.lastReset
  };
}

/**
 * Get weekly metrics summary
 * @returns {Promise<object>} Weekly aggregated metrics
 */
export async function getWeeklyMetrics() {
  const metricsState = await getMetricsState();

  // Get dates for last 7 days
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  // Aggregate metrics for the week
  const weeklyMetrics = {
    dates,
    totalExecutions: 0,
    totalTracksLogged: 0,
    totalErrors: 0,
    avgExecutionTime: 0,
    successRate: 0,
    dailyBreakdown: {}
  };

  let totalExecutionTime = 0;
  let daysWithData = 0;

  for (const date of dates) {
    const daily = metricsState.daily[date];
    if (daily) {
      weeklyMetrics.dailyBreakdown[date] = {
        executions: daily.executions,
        tracksLogged: daily.tracksLogged,
        avgExecutionTime: daily.avgExecutionTime,
        successRate: daily.successRate
      };

      weeklyMetrics.totalExecutions += daily.executions;
      weeklyMetrics.totalTracksLogged += daily.tracksLogged;
      weeklyMetrics.totalErrors += Object.values(daily.errors).reduce((a, b) => a + b, 0);
      totalExecutionTime += daily.totalExecutionTime;
      daysWithData++;
    }
  }

  // Calculate averages
  if (weeklyMetrics.totalExecutions > 0) {
    weeklyMetrics.avgExecutionTime = Math.round(
      totalExecutionTime / weeklyMetrics.totalExecutions
    );
  }

  if (weeklyMetrics.totalTracksLogged > 0) {
    weeklyMetrics.successRate = Math.round(
      ((weeklyMetrics.totalTracksLogged - weeklyMetrics.totalErrors) /
        weeklyMetrics.totalTracksLogged) * 100
    );
  } else {
    weeklyMetrics.successRate = 100;
  }

  return weeklyMetrics;
}

/**
 * Reset daily metrics (for testing or new period)
 * @returns {Promise<void>}
 */
export async function resetDailyMetrics() {
  const metricsState = await getMetricsState();
  metricsState.daily = {};
  metricsState.lastReset = new Date().toISOString();
  await saveMetricsState(metricsState);
  console.log('[Metrics] Daily metrics reset');
}

/**
 * Clean up old metrics (keep last 30 days)
 * @returns {Promise<number>} Number of days removed
 */
export async function cleanupOldMetrics() {
  const metricsState = await getMetricsState();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const cutoffKey = cutoffDate.toISOString().split('T')[0];

  let removedCount = 0;
  for (const dateKey of Object.keys(metricsState.daily)) {
    if (dateKey < cutoffKey) {
      delete metricsState.daily[dateKey];
      removedCount++;
    }
  }

  if (removedCount > 0) {
    await saveMetricsState(metricsState);
    console.log(`[Metrics] Cleaned up ${removedCount} old days of metrics`);
  }

  return removedCount;
}

/**
 * Check if metrics indicate potential issues
 * @returns {Promise<object>} Health check result
 */
export async function checkHealth() {
  const today = await getDailyMetrics();
  const issues = [];

  // Check execution time
  if (today.avgExecutionTime > 50000) {
    issues.push({
      type: 'SLOW_EXECUTION',
      message: `Average execution time is ${today.avgExecutionTime}ms (threshold: 50000ms)`
    });
  }

  // Check success rate
  if (today.successRate < 90 && today.executions > 0) {
    issues.push({
      type: 'LOW_SUCCESS_RATE',
      message: `Success rate is ${today.successRate}% (threshold: 90%)`
    });
  }

  // Check error rate
  const totalErrors = Object.values(today.errors).reduce((a, b) => a + b, 0);
  if (totalErrors > 10) {
    issues.push({
      type: 'HIGH_ERROR_COUNT',
      message: `${totalErrors} errors today (threshold: 10)`
    });
  }

  // Check API failures
  const spotifyFailRate = today.apiCalls.spotify.total > 0
    ? (today.apiCalls.spotify.failed / today.apiCalls.spotify.total) * 100
    : 0;
  if (spotifyFailRate > 5) {
    issues.push({
      type: 'SPOTIFY_API_ISSUES',
      message: `Spotify API failure rate is ${spotifyFailRate.toFixed(1)}% (threshold: 5%)`
    });
  }

  return {
    healthy: issues.length === 0,
    issues,
    metrics: {
      executions: today.executions,
      avgExecutionTime: today.avgExecutionTime,
      successRate: today.successRate,
      tracksLogged: today.tracksLogged,
      errors: totalErrors
    }
  };
}
