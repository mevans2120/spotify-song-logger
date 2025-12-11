import { loadState, saveState } from './state-manager.js';
import { logAlertSent } from './system-logger.js';

/**
 * Alerting System Module
 *
 * Sends alerts when critical issues occur or manual intervention is needed.
 * Supports multiple delivery channels and implements deduplication to prevent
 * alert fatigue.
 *
 * Alert Levels:
 * - INFO: Informational (no action required)
 * - WARNING: Potential issue (monitor closely)
 * - CRITICAL: Requires immediate attention
 *
 * Delivery Channels (configured via env vars):
 * - Console (default, always enabled)
 * - Slack webhook (optional)
 * - Discord webhook (optional)
 * - Email via SendGrid/Resend (optional)
 *
 * Alert Thresholds:
 * - 3 consecutive cron failures
 * - 5 tracks in failed queue for >24 hours
 * - Execution time >50 seconds
 * - Error rate >10% over 24 hours
 */

const ALERT_DEDUP_HOURS = 24; // Only send same alert once per 24 hours

/**
 * Alert configuration from environment variables
 */
function getAlertConfig() {
  return {
    enabled: process.env.ENABLE_ALERTS !== 'false',
    slackWebhook: process.env.SLACK_WEBHOOK_URL || null,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL || null,
    emailEnabled: !!(process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY),
    alertEmail: process.env.ALERT_EMAIL || null,
    sendgridKey: process.env.SENDGRID_API_KEY || null,
    resendKey: process.env.RESEND_API_KEY || null
  };
}

/**
 * Get alert state from storage
 * @returns {Promise<object>} Alert state
 */
async function getAlertState() {
  const state = await loadState();
  return state.alerts || {
    sentAlerts: {},
    consecutiveFailures: 0,
    lastSuccessfulRun: null
  };
}

/**
 * Save alert state to storage
 * @param {object} alertState - Alert state to save
 * @returns {Promise<void>}
 */
async function saveAlertState(alertState) {
  const state = await loadState();
  state.alerts = alertState;
  await saveState(state);
}

/**
 * Check if alert was recently sent (deduplication)
 * @param {string} alertKey - Unique key for the alert
 * @returns {Promise<boolean>} True if alert should be deduplicated
 */
async function isAlertDuplicate(alertKey) {
  const alertState = await getAlertState();
  const lastSent = alertState.sentAlerts[alertKey];

  if (!lastSent) {
    return false;
  }

  const hoursSince = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60 * 60);
  return hoursSince < ALERT_DEDUP_HOURS;
}

/**
 * Mark alert as sent (for deduplication)
 * @param {string} alertKey - Unique key for the alert
 * @returns {Promise<void>}
 */
async function markAlertSent(alertKey) {
  const alertState = await getAlertState();
  alertState.sentAlerts[alertKey] = new Date().toISOString();

  // Clean up old alert keys (older than 7 days)
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(alertState.sentAlerts)) {
    if (new Date(alertState.sentAlerts[key]).getTime() < cutoff) {
      delete alertState.sentAlerts[key];
    }
  }

  await saveAlertState(alertState);
}

/**
 * Send alert to console (always enabled)
 * @param {string} level - Alert level
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 */
function sendConsoleAlert(level, title, message) {
  const prefix = level === 'CRITICAL' ? '🚨' : level === 'WARNING' ? '⚠️' : 'ℹ️';
  console.log(`\n${prefix} [ALERT - ${level}] ${title}`);
  console.log(`   ${message}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);
}

/**
 * Send alert to Slack webhook
 * @param {string} level - Alert level
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {object} metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
async function sendSlackAlert(level, title, message, metadata = {}) {
  const config = getAlertConfig();
  if (!config.slackWebhook) {
    return false;
  }

  const color = level === 'CRITICAL' ? '#FF0000' : level === 'WARNING' ? '#FFA500' : '#36A64F';

  const payload = {
    attachments: [{
      color,
      title: `${level}: ${title}`,
      text: message,
      fields: Object.entries(metadata).map(([key, value]) => ({
        title: key,
        value: String(value),
        short: true
      })),
      footer: 'Spotify Song Logger',
      ts: Math.floor(Date.now() / 1000)
    }]
  };

  try {
    const response = await fetch(config.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    console.error('[Alerting] Failed to send Slack alert:', error.message);
    return false;
  }
}

/**
 * Send alert to Discord webhook
 * @param {string} level - Alert level
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {object} metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
async function sendDiscordAlert(level, title, message, metadata = {}) {
  const config = getAlertConfig();
  if (!config.discordWebhook) {
    return false;
  }

  const color = level === 'CRITICAL' ? 0xFF0000 : level === 'WARNING' ? 0xFFA500 : 0x36A64F;

  const payload = {
    embeds: [{
      title: `${level}: ${title}`,
      description: message,
      color,
      fields: Object.entries(metadata).map(([name, value]) => ({
        name,
        value: String(value),
        inline: true
      })),
      footer: { text: 'Spotify Song Logger' },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(config.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    console.error('[Alerting] Failed to send Discord alert:', error.message);
    return false;
  }
}

/**
 * Send alert to all configured channels
 * @param {string} level - Alert level (INFO, WARNING, CRITICAL)
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {object} metadata - Additional context
 * @returns {Promise<object>} Delivery results
 */
export async function sendAlert(level, title, message, metadata = {}) {
  const config = getAlertConfig();

  if (!config.enabled) {
    console.log('[Alerting] Alerts disabled, skipping');
    return { sent: false, reason: 'alerts_disabled' };
  }

  // Create unique key for deduplication
  const alertKey = `${level}:${title}`;

  // Check deduplication
  if (await isAlertDuplicate(alertKey)) {
    console.log(`[Alerting] Alert deduplicated: ${title}`);
    return { sent: false, reason: 'deduplicated' };
  }

  const results = {
    console: true,
    slack: false,
    discord: false,
    email: false
  };

  // Always send to console
  sendConsoleAlert(level, title, message);

  // Send to Slack if configured
  if (config.slackWebhook) {
    results.slack = await sendSlackAlert(level, title, message, metadata);
  }

  // Send to Discord if configured
  if (config.discordWebhook) {
    results.discord = await sendDiscordAlert(level, title, message, metadata);
  }

  // Mark alert as sent
  await markAlertSent(alertKey);

  // Log alert sent
  const channels = Object.entries(results)
    .filter(([, sent]) => sent)
    .map(([channel]) => channel)
    .join(', ');

  await logAlertSent(title, channels, message);

  return {
    sent: true,
    channels: results
  };
}

/**
 * Alert for consecutive cron failures
 * @param {number} failureCount - Number of consecutive failures
 * @returns {Promise<object>} Alert result
 */
export async function alertConsecutiveFailures(failureCount) {
  if (failureCount < 3) {
    return { sent: false, reason: 'below_threshold' };
  }

  const level = failureCount >= 5 ? 'CRITICAL' : 'WARNING';

  return await sendAlert(
    level,
    'Consecutive Cron Failures',
    `The Spotify logging cron has failed ${failureCount} times in a row. Manual intervention may be required.`,
    { 'Failure Count': failureCount }
  );
}

/**
 * Alert for tracks stuck in failed queue
 * @param {array} stuckTracks - Tracks that have been in queue >24 hours
 * @returns {Promise<object>} Alert result
 */
export async function alertStuckTracks(stuckTracks) {
  if (stuckTracks.length < 5) {
    return { sent: false, reason: 'below_threshold' };
  }

  return await sendAlert(
    'WARNING',
    'Tracks Stuck in Failed Queue',
    `${stuckTracks.length} tracks have been in the failed queue for over 24 hours and may require manual review.`,
    {
      'Stuck Tracks': stuckTracks.length,
      'Sample': stuckTracks.slice(0, 3).map(t => t.trackName).join(', ')
    }
  );
}

/**
 * Alert for slow execution time
 * @param {number} executionTimeMs - Execution time in milliseconds
 * @returns {Promise<object>} Alert result
 */
export async function alertSlowExecution(executionTimeMs) {
  if (executionTimeMs < 50000) {
    return { sent: false, reason: 'below_threshold' };
  }

  const level = executionTimeMs >= 55000 ? 'CRITICAL' : 'WARNING';

  return await sendAlert(
    level,
    'Slow Execution Time',
    `Cron execution took ${(executionTimeMs / 1000).toFixed(1)} seconds, approaching the 60-second timeout limit.`,
    { 'Execution Time': `${(executionTimeMs / 1000).toFixed(1)}s` }
  );
}

/**
 * Alert for high error rate
 * @param {number} errorRate - Error rate percentage
 * @param {number} totalTracks - Total tracks processed
 * @returns {Promise<object>} Alert result
 */
export async function alertHighErrorRate(errorRate, totalTracks) {
  if (errorRate < 10 || totalTracks < 10) {
    return { sent: false, reason: 'below_threshold' };
  }

  const level = errorRate >= 25 ? 'CRITICAL' : 'WARNING';

  return await sendAlert(
    level,
    'High Error Rate',
    `Error rate is ${errorRate.toFixed(1)}% (${Math.round(totalTracks * errorRate / 100)} out of ${totalTracks} tracks).`,
    { 'Error Rate': `${errorRate.toFixed(1)}%`, 'Total Tracks': totalTracks }
  );
}

/**
 * Alert for rate limiting
 * @param {string} service - Service that was rate limited
 * @returns {Promise<object>} Alert result
 */
export async function alertRateLimit(service) {
  return await sendAlert(
    'WARNING',
    'API Rate Limited',
    `The ${service} API returned a rate limit response. Requests are being throttled.`,
    { 'Service': service }
  );
}

/**
 * Alert for authentication failure
 * @param {string} service - Service with auth failure
 * @param {string} error - Error message
 * @returns {Promise<object>} Alert result
 */
export async function alertAuthFailure(service, error) {
  return await sendAlert(
    'CRITICAL',
    'Authentication Failure',
    `Failed to authenticate with ${service}. Manual token refresh may be required.`,
    { 'Service': service, 'Error': error }
  );
}

/**
 * Alert for data loss
 * @param {array} trackIds - Track IDs that were lost
 * @returns {Promise<object>} Alert result
 */
export async function alertDataLoss(trackIds) {
  return await sendAlert(
    'CRITICAL',
    'Potential Data Loss',
    `${trackIds.length} track(s) could not be recovered after maximum retry attempts and may be permanently lost.`,
    {
      'Lost Tracks': trackIds.length,
      'Track IDs': trackIds.slice(0, 5).join(', ')
    }
  );
}

/**
 * Track successful run (resets consecutive failure counter)
 * @returns {Promise<void>}
 */
export async function trackSuccessfulRun() {
  const alertState = await getAlertState();
  alertState.consecutiveFailures = 0;
  alertState.lastSuccessfulRun = new Date().toISOString();
  await saveAlertState(alertState);
}

/**
 * Track failed run (increments consecutive failure counter)
 * @returns {Promise<number>} New consecutive failure count
 */
export async function trackFailedRun() {
  const alertState = await getAlertState();
  alertState.consecutiveFailures++;
  await saveAlertState(alertState);

  // Check if we should alert
  await alertConsecutiveFailures(alertState.consecutiveFailures);

  return alertState.consecutiveFailures;
}

/**
 * Check alert thresholds based on current metrics
 * @param {object} metrics - Current metrics
 * @returns {Promise<array>} Alerts sent
 */
export async function checkAlertThresholds(metrics) {
  const alertsSent = [];

  // Check execution time
  if (metrics.executionTimeMs) {
    const result = await alertSlowExecution(metrics.executionTimeMs);
    if (result.sent) alertsSent.push('slow_execution');
  }

  // Check error rate
  if (metrics.totalTracks && metrics.errorCount) {
    const errorRate = (metrics.errorCount / metrics.totalTracks) * 100;
    const result = await alertHighErrorRate(errorRate, metrics.totalTracks);
    if (result.sent) alertsSent.push('high_error_rate');
  }

  return alertsSent;
}

/**
 * Get current alert state (for debugging)
 * @returns {Promise<object>} Alert state
 */
export async function getAlertStatus() {
  const alertState = await getAlertState();
  const config = getAlertConfig();

  return {
    enabled: config.enabled,
    channels: {
      slack: !!config.slackWebhook,
      discord: !!config.discordWebhook,
      email: config.emailEnabled
    },
    consecutiveFailures: alertState.consecutiveFailures,
    lastSuccessfulRun: alertState.lastSuccessfulRun,
    recentAlerts: Object.keys(alertState.sentAlerts).length
  };
}
