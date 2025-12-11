import { getMetricsSummary, getWeeklyMetrics, checkHealth, cleanupOldMetrics } from '../lib/metrics.js';
import { getAlertStatus } from '../lib/alerting.js';
import { getStorageBackend, getStats, getFailedQueue } from '../lib/state-manager.js';

/**
 * Vercel Serverless Function: Metrics Dashboard
 *
 * Provides access to system metrics, health status, and operational data.
 * Useful for monitoring and debugging.
 *
 * Endpoint: /api/metrics
 * Method: GET
 * Query params:
 *   - view=weekly: Get weekly aggregated metrics
 *   - cleanup=true: Run metrics cleanup (removes data >30 days)
 * Response: JSON with metrics data
 */

/**
 * Main serverless handler
 * @param {object} req - Vercel request object
 * @param {object} res - Vercel response object
 */
export default async function handler(req, res) {
  try {
    const view = req.query.view || 'summary';
    const shouldCleanup = req.query.cleanup === 'true';

    console.log(`[Metrics API] Request: view=${view}, cleanup=${shouldCleanup}`);

    // Run cleanup if requested
    if (shouldCleanup) {
      const removed = await cleanupOldMetrics();
      console.log(`[Metrics API] Cleaned up ${removed} days of old metrics`);
    }

    // Get health status
    const health = await checkHealth();

    // Get alert status
    const alertStatus = await getAlertStatus();

    // Get storage backend info
    const storageBackend = getStorageBackend();

    // Get state stats
    const stats = await getStats();
    const failedQueue = await getFailedQueue();

    let metricsData;
    if (view === 'weekly') {
      metricsData = await getWeeklyMetrics();
    } else {
      metricsData = await getMetricsSummary();
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      health: {
        status: health.healthy ? 'healthy' : 'degraded',
        issues: health.issues,
        metrics: health.metrics
      },
      metrics: metricsData,
      state: {
        lastRun: stats.lastRun,
        totalSuccesses: stats.successCount,
        totalFailures: stats.failureCount,
        failedQueueSize: failedQueue.length,
        failedTracks: failedQueue.map(t => ({
          trackName: t.trackName,
          attempts: t.attemptCount,
          lastError: t.error
        }))
      },
      alerts: alertStatus,
      system: {
        storageBackend: storageBackend.backend,
        isVercel: storageBackend.isVercel,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      },
      cleanedUp: shouldCleanup ? 'yes' : 'no'
    });

  } catch (error) {
    console.error('[Metrics API] Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
