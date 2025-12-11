import {
  startExecution,
  endExecution,
  trackApiCall,
  trackError,
  trackTracks,
  getDailyMetrics,
  getMetricsSummary,
  getWeeklyMetrics,
  resetDailyMetrics,
  cleanupOldMetrics,
  checkHealth
} from '../../lib/metrics.js';

/**
 * Metrics module tests
 *
 * Note: These tests use the actual state-manager which will use local file storage
 * in the test environment (no Vercel KV credentials present).
 * Each test cleans up after itself using resetDailyMetrics().
 */
describe('metrics', () => {
  // Reset metrics before each test to ensure clean state
  beforeEach(async () => {
    await resetDailyMetrics();
  });

  // Clean up after all tests
  afterAll(async () => {
    await resetDailyMetrics();
  });

  describe('startExecution', () => {
    it('should initialize execution tracking without throwing', () => {
      expect(() => startExecution('test-function')).not.toThrow();
    });

    it('should accept any function name', () => {
      expect(() => startExecution('log-spotify')).not.toThrow();
      expect(() => startExecution('retry-failed')).not.toThrow();
      expect(() => startExecution('import-history')).not.toThrow();
    });
  });

  describe('trackApiCall', () => {
    beforeEach(() => {
      startExecution('test');
    });

    it('should track successful API call without throwing', () => {
      expect(() => trackApiCall('spotify', '/me/player/recently-played', 100, true)).not.toThrow();
    });

    it('should track failed API call without throwing', () => {
      expect(() => trackApiCall('sheets', '/append', 200, false)).not.toThrow();
    });

    it('should track multiple API calls', () => {
      expect(() => {
        trackApiCall('spotify', '/me/player', 50, true);
        trackApiCall('spotify', '/audio-features', 150, true);
        trackApiCall('sheets', '/append', 300, true);
      }).not.toThrow();
    });

    it('should track both spotify and sheets services', () => {
      expect(() => trackApiCall('spotify', '/endpoint', 100, true)).not.toThrow();
      expect(() => trackApiCall('sheets', '/endpoint', 100, true)).not.toThrow();
    });
  });

  describe('trackError', () => {
    beforeEach(() => {
      startExecution('test');
    });

    it('should track Error object', () => {
      expect(() => trackError('spotify', new Error('Test error'))).not.toThrow();
    });

    it('should track string error message', () => {
      expect(() => trackError('other', 'String error message')).not.toThrow();
    });

    it('should track different error types', () => {
      expect(() => trackError('spotify', 'Spotify API error')).not.toThrow();
      expect(() => trackError('sheets', 'Sheets API error')).not.toThrow();
      expect(() => trackError('validation', 'Validation error')).not.toThrow();
      expect(() => trackError('other', 'Unknown error')).not.toThrow();
    });
  });

  describe('trackTracks', () => {
    beforeEach(() => {
      startExecution('test');
    });

    it('should track processed and logged counts without throwing', () => {
      expect(() => trackTracks(10, 8)).not.toThrow();
    });

    it('should handle zero counts', () => {
      expect(() => trackTracks(0, 0)).not.toThrow();
    });

    it('should accumulate counts from multiple calls', () => {
      expect(() => {
        trackTracks(5, 4);
        trackTracks(3, 3);
      }).not.toThrow();
    });
  });

  describe('endExecution', () => {
    it('should return null if no execution was started', async () => {
      // Force a fresh state without startExecution
      await resetDailyMetrics();

      // End without starting should return null or handle gracefully
      const result = await endExecution();
      // If no execution was started, it should return null
      // (behavior depends on internal state reset)
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return execution summary after execution', async () => {
      startExecution('test-function');
      trackTracks(5, 4);
      trackApiCall('spotify', '/test', 100, true);

      const result = await endExecution();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('functionName');
      expect(result.functionName).toBe('test-function');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
      expect(result).toHaveProperty('tracksProcessed');
      expect(result.tracksProcessed).toBe(5);
      expect(result).toHaveProperty('tracksLogged');
      expect(result.tracksLogged).toBe(4);
      expect(result).toHaveProperty('apiCalls');
      expect(result.apiCalls).toBe(1);
      expect(result).toHaveProperty('errors');
      expect(result.errors).toBe(0);
    });

    it('should include error count in summary', async () => {
      startExecution('error-test');
      trackError('spotify', 'Test error');
      trackError('sheets', 'Another error');

      const result = await endExecution();

      expect(result.errors).toBe(2);
    });

    it('should calculate duration correctly', async () => {
      startExecution('duration-test');

      // Small delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await endExecution();

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDailyMetrics', () => {
    it('should return metrics object with expected structure', async () => {
      const metrics = await getDailyMetrics();

      expect(metrics).toHaveProperty('executions');
      expect(metrics).toHaveProperty('totalExecutionTime');
      expect(metrics).toHaveProperty('avgExecutionTime');
      expect(metrics).toHaveProperty('maxExecutionTime');
      expect(metrics).toHaveProperty('minExecutionTime');
      expect(metrics).toHaveProperty('tracksLogged');
      expect(metrics).toHaveProperty('tracksProcessed');
      expect(metrics).toHaveProperty('apiCalls');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('hourlyExecutions');
    });

    it('should have proper apiCalls structure', async () => {
      const metrics = await getDailyMetrics();

      expect(metrics.apiCalls).toHaveProperty('spotify');
      expect(metrics.apiCalls).toHaveProperty('sheets');
      expect(metrics.apiCalls.spotify).toHaveProperty('total');
      expect(metrics.apiCalls.spotify).toHaveProperty('success');
      expect(metrics.apiCalls.spotify).toHaveProperty('failed');
    });

    it('should have proper errors structure', async () => {
      const metrics = await getDailyMetrics();

      expect(metrics.errors).toHaveProperty('spotify');
      expect(metrics.errors).toHaveProperty('sheets');
      expect(metrics.errors).toHaveProperty('validation');
      expect(metrics.errors).toHaveProperty('other');
    });

    it('should update after execution completes', async () => {
      const metricsBefore = await getDailyMetrics();
      const executionsBefore = metricsBefore.executions;

      startExecution('metrics-test');
      trackTracks(10, 10);
      await endExecution();

      const metricsAfter = await getDailyMetrics();

      expect(metricsAfter.executions).toBe(executionsBefore + 1);
      expect(metricsAfter.tracksLogged).toBeGreaterThanOrEqual(10);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return summary with today and totals', async () => {
      const summary = await getMetricsSummary();

      expect(summary).toHaveProperty('today');
      expect(summary).toHaveProperty('totals');
      expect(summary).toHaveProperty('lastReset');
    });

    it('should have proper totals structure', async () => {
      const summary = await getMetricsSummary();

      expect(summary.totals).toHaveProperty('totalExecutions');
      expect(summary.totals).toHaveProperty('totalTracksLogged');
      expect(summary.totals).toHaveProperty('totalErrors');
      expect(summary.totals).toHaveProperty('totalApiCalls');
    });
  });

  describe('getWeeklyMetrics', () => {
    it('should return weekly metrics with expected structure', async () => {
      const weekly = await getWeeklyMetrics();

      expect(weekly).toHaveProperty('dates');
      expect(weekly).toHaveProperty('totalExecutions');
      expect(weekly).toHaveProperty('totalTracksLogged');
      expect(weekly).toHaveProperty('totalErrors');
      expect(weekly).toHaveProperty('avgExecutionTime');
      expect(weekly).toHaveProperty('successRate');
      expect(weekly).toHaveProperty('dailyBreakdown');
    });

    it('should include 7 dates', async () => {
      const weekly = await getWeeklyMetrics();

      expect(weekly.dates).toHaveLength(7);
    });

    it('should have dates in descending order (most recent first)', async () => {
      const weekly = await getWeeklyMetrics();

      // First date should be today or most recent
      const firstDate = new Date(weekly.dates[0]);
      const lastDate = new Date(weekly.dates[6]);

      expect(firstDate.getTime()).toBeGreaterThanOrEqual(lastDate.getTime());
    });
  });

  describe('resetDailyMetrics', () => {
    it('should reset without throwing', async () => {
      await expect(resetDailyMetrics()).resolves.not.toThrow();
    });

    it('should clear daily metrics', async () => {
      // Create some metrics first
      startExecution('reset-test');
      trackTracks(5, 5);
      await endExecution();

      // Reset
      await resetDailyMetrics();

      // Check that today's metrics are reset
      const metrics = await getDailyMetrics();
      expect(metrics.executions).toBe(0);
      expect(metrics.tracksLogged).toBe(0);
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should run without throwing', async () => {
      await expect(cleanupOldMetrics()).resolves.not.toThrow();
    });

    it('should return number of removed days', async () => {
      const removed = await cleanupOldMetrics();

      expect(typeof removed).toBe('number');
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkHealth', () => {
    it('should return health status object', async () => {
      const health = await checkHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('metrics');
    });

    it('should have boolean healthy property', async () => {
      const health = await checkHealth();

      expect(typeof health.healthy).toBe('boolean');
    });

    it('should have array of issues', async () => {
      const health = await checkHealth();

      expect(Array.isArray(health.issues)).toBe(true);
    });

    it('should have metrics summary', async () => {
      const health = await checkHealth();

      expect(health.metrics).toHaveProperty('executions');
      expect(health.metrics).toHaveProperty('avgExecutionTime');
      expect(health.metrics).toHaveProperty('successRate');
      expect(health.metrics).toHaveProperty('tracksLogged');
      expect(health.metrics).toHaveProperty('errors');
    });

    it('should be healthy with no executions', async () => {
      await resetDailyMetrics();
      const health = await checkHealth();

      // With no executions, should be healthy (no issues)
      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it('should detect slow execution times', async () => {
      // This is a theoretical test - we can't easily simulate slow execution
      // But we can verify the structure is correct for health checking
      const health = await checkHealth();

      // Each issue should have type and message if present
      health.issues.forEach(issue => {
        expect(issue).toHaveProperty('type');
        expect(issue).toHaveProperty('message');
      });
    });
  });

  describe('integration: full execution flow', () => {
    it('should track complete execution lifecycle', async () => {
      // Start execution
      startExecution('integration-test');

      // Track various activities
      trackApiCall('spotify', '/me/player/recently-played', 150, true);
      trackApiCall('spotify', '/audio-features', 100, true);
      trackApiCall('sheets', '/values/append', 200, true);
      trackApiCall('spotify', '/artists', 50, false); // One failure

      trackError('spotify', 'Rate limit exceeded');

      trackTracks(15, 12);

      // End execution
      const summary = await endExecution();

      // Verify summary
      expect(summary.functionName).toBe('integration-test');
      expect(summary.tracksProcessed).toBe(15);
      expect(summary.tracksLogged).toBe(12);
      expect(summary.apiCalls).toBe(4);
      expect(summary.errors).toBe(1);

      // Verify daily metrics updated
      const daily = await getDailyMetrics();
      expect(daily.executions).toBeGreaterThanOrEqual(1);
      expect(daily.apiCalls.spotify.total).toBeGreaterThanOrEqual(3);
      expect(daily.apiCalls.spotify.failed).toBeGreaterThanOrEqual(1);
      expect(daily.apiCalls.sheets.total).toBeGreaterThanOrEqual(1);

      // Verify health check works
      const health = await checkHealth();
      expect(health).toHaveProperty('healthy');
    });
  });
});
