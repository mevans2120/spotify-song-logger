import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * State Management Module (Hybrid: Local File + Vercel KV)
 *
 * Manages persistent state for tracking processed tracks and failed attempts.
 * Supports two backends:
 * - Local: JSON file storage (development)
 * - Vercel KV: Redis-compatible storage (production)
 *
 * Automatically detects environment and uses appropriate backend.
 *
 * State structure:
 * {
 *   lastProcessed: { trackId, timestamp, playedAt },
 *   failedQueue: [{ trackId, attemptCount, lastAttempt, error, partialData }],
 *   stats: { lastRun, successCount, failureCount }
 * }
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_DIR = path.join(__dirname, '..', '.state');
const STATE_FILE = path.join(STATE_DIR, 'logger-state.json');
const BACKUP_FILE = path.join(STATE_DIR, 'logger-state.backup.json');

// KV keys
const KV_STATE_KEY = 'state:full';
const KV_LAST_PROCESSED_KEY = 'state:lastProcessed';
const KV_FAILED_QUEUE_KEY = 'state:failedQueue';
const KV_STATS_KEY = 'state:stats';

// Default empty state
const DEFAULT_STATE = {
  lastProcessed: null,
  failedQueue: [],
  stats: {
    lastRun: null,
    successCount: 0,
    failureCount: 0
  }
};

/**
 * Detect if we should use KV storage
 * @returns {boolean} True if KV should be used
 */
function shouldUseKV() {
  // Use KV if:
  // 1. Running in Vercel production/preview
  // 2. USE_KV environment variable is explicitly set to 'true'
  // 3. KV credentials are available

  const useKV = process.env.USE_KV === 'true';
  const isVercel = process.env.VERCEL_ENV !== undefined;
  const hasKVCredentials = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

  return (useKV || isVercel) && hasKVCredentials;
}

/**
 * Get KV client (lazy loaded)
 * @returns {Promise<object>} KV client
 */
async function getKVClient() {
  if (!shouldUseKV()) {
    throw new Error('KV credentials not available');
  }

  // Dynamic import to avoid loading @vercel/kv in local development
  const { kv } = await import('@vercel/kv');
  return kv;
}

// ============================================================================
// LOCAL FILE BACKEND
// ============================================================================

/**
 * Ensure state directory exists
 */
async function ensureStateDir() {
  try {
    await fs.access(STATE_DIR);
  } catch {
    await fs.mkdir(STATE_DIR, { recursive: true });
    console.log('[State Manager - Local] Created state directory:', STATE_DIR);
  }
}

/**
 * Load state from local JSON file
 * @returns {Promise<object>} Current state
 */
async function loadStateLocal() {
  await ensureStateDir();

  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    console.log('[State Manager - Local] State loaded successfully');
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[State Manager - Local] No existing state file, using default state');
      return { ...DEFAULT_STATE };
    }

    // Try to load from backup
    console.warn('[State Manager - Local] Error loading state, trying backup...', error.message);
    try {
      const backupData = await fs.readFile(BACKUP_FILE, 'utf-8');
      const state = JSON.parse(backupData);
      console.log('[State Manager - Local] Loaded state from backup');
      return state;
    } catch (backupError) {
      console.warn('[State Manager - Local] Could not load backup, using default state');
      return { ...DEFAULT_STATE };
    }
  }
}

/**
 * Save state to local JSON file with backup
 * @param {object} state - State object to save
 * @returns {Promise<void>}
 */
async function saveStateLocal(state) {
  await ensureStateDir();

  try {
    // Create backup of current state if it exists
    try {
      const currentData = await fs.readFile(STATE_FILE, 'utf-8');
      await fs.writeFile(BACKUP_FILE, currentData, 'utf-8');
    } catch (error) {
      // No current file to backup, that's okay
    }

    // Write new state
    const stateJson = JSON.stringify(state, null, 2);
    await fs.writeFile(STATE_FILE, stateJson, 'utf-8');
    console.log('[State Manager - Local] State saved successfully');
  } catch (error) {
    console.error('[State Manager - Local] Error saving state:', error.message);
    throw new Error(`Failed to save state: ${error.message}`);
  }
}

// ============================================================================
// VERCEL KV BACKEND
// ============================================================================

/**
 * Load state from Vercel KV
 * @returns {Promise<object>} Current state
 */
async function loadStateKV() {
  try {
    const kv = await getKVClient();
    const state = await kv.get(KV_STATE_KEY);

    if (state) {
      console.log('[State Manager - KV] State loaded successfully');
      return state;
    }

    console.log('[State Manager - KV] No existing state, using default state');
    return { ...DEFAULT_STATE };
  } catch (error) {
    console.error('[State Manager - KV] Error loading state:', error.message);
    // Fallback to default state
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save state to Vercel KV
 * @param {object} state - State object to save
 * @returns {Promise<void>}
 */
async function saveStateKV(state) {
  try {
    const kv = await getKVClient();

    // Save full state
    await kv.set(KV_STATE_KEY, state);

    // Also save individual components for easier querying
    await kv.set(KV_LAST_PROCESSED_KEY, state.lastProcessed);
    await kv.set(KV_FAILED_QUEUE_KEY, state.failedQueue);
    await kv.set(KV_STATS_KEY, state.stats);

    console.log('[State Manager - KV] State saved successfully');
  } catch (error) {
    console.error('[State Manager - KV] Error saving state:', error.message);
    throw new Error(`Failed to save state to KV: ${error.message}`);
  }
}

// ============================================================================
// UNIFIED PUBLIC API
// ============================================================================

/**
 * Load state from appropriate backend
 * @returns {Promise<object>} Current state
 */
export async function loadState() {
  if (shouldUseKV()) {
    return await loadStateKV();
  } else {
    return await loadStateLocal();
  }
}

/**
 * Save state to appropriate backend
 * @param {object} state - State object to save
 * @returns {Promise<void>}
 */
export async function saveState(state) {
  if (shouldUseKV()) {
    await saveStateKV(state);
  } else {
    await saveStateLocal(state);
  }
}

/**
 * Get last processed track info
 * @returns {Promise<object|null>} Last processed track or null
 */
export async function getLastProcessed() {
  const state = await loadState();
  return state.lastProcessed;
}

/**
 * Update last processed track
 * @param {object} track - Recently played track item
 * @returns {Promise<void>}
 */
export async function updateLastProcessed(track) {
  const state = await loadState();

  state.lastProcessed = {
    trackId: track.track?.id || '',
    timestamp: new Date().toISOString(),
    playedAt: track.played_at
  };

  await saveState(state);
  console.log('[State Manager] Updated last processed track:', track.track?.name);
}

/**
 * Add failed track to retry queue
 * @param {object} track - Track that failed to process
 * @param {string} error - Error message
 * @returns {Promise<void>}
 */
export async function addToFailedQueue(track, error) {
  const state = await loadState();

  const failedEntry = {
    trackId: track.track?.id || '',
    trackName: track.track?.name || 'Unknown',
    playedAt: track.played_at,
    attemptCount: 1,
    lastAttempt: new Date().toISOString(),
    error: error,
    partialData: track
  };

  // Check if track is already in queue
  const existingIndex = state.failedQueue.findIndex(
    item => item.trackId === failedEntry.trackId && item.playedAt === failedEntry.playedAt
  );

  if (existingIndex >= 0) {
    // Update existing entry
    state.failedQueue[existingIndex].attemptCount++;
    state.failedQueue[existingIndex].lastAttempt = failedEntry.lastAttempt;
    state.failedQueue[existingIndex].error = error;
    console.log(`[State Manager] Updated failed queue entry (attempt ${state.failedQueue[existingIndex].attemptCount}):`, failedEntry.trackName);
  } else {
    // Add new entry
    state.failedQueue.push(failedEntry);
    console.log('[State Manager] Added to failed queue:', failedEntry.trackName);
  }

  await saveState(state);
}

/**
 * Get failed queue
 * @returns {Promise<array>} Array of failed tracks
 */
export async function getFailedQueue() {
  const state = await loadState();
  return state.failedQueue || [];
}

/**
 * Remove track from failed queue (after successful retry)
 * @param {string} trackId - Track ID to remove
 * @param {string} playedAt - Played at timestamp
 * @returns {Promise<void>}
 */
export async function clearFromFailedQueue(trackId, playedAt) {
  const state = await loadState();

  const originalLength = state.failedQueue.length;
  state.failedQueue = state.failedQueue.filter(
    item => !(item.trackId === trackId && item.playedAt === playedAt)
  );

  const removed = originalLength - state.failedQueue.length;
  if (removed > 0) {
    await saveState(state);
    console.log(`[State Manager] Removed ${removed} item(s) from failed queue`);
  }
}

/**
 * Update stats after run
 * @param {number} successCount - Number of successful logs
 * @param {number} failureCount - Number of failures
 * @returns {Promise<void>}
 */
export async function updateStats(successCount, failureCount) {
  const state = await loadState();

  state.stats.lastRun = new Date().toISOString();
  state.stats.successCount += successCount;
  state.stats.failureCount += failureCount;

  await saveState(state);
  console.log(`[State Manager] Updated stats: +${successCount} success, +${failureCount} failures`);
}

/**
 * Get current stats
 * @returns {Promise<object>} Stats object
 */
export async function getStats() {
  const state = await loadState();
  return state.stats || DEFAULT_STATE.stats;
}

/**
 * Reset stats (for testing or new period)
 * @returns {Promise<void>}
 */
export async function resetStats() {
  const state = await loadState();
  state.stats = { ...DEFAULT_STATE.stats };
  await saveState(state);
  console.log('[State Manager] Stats reset');
}

/**
 * Clear all state (for testing)
 * @returns {Promise<void>}
 */
export async function clearAllState() {
  await saveState({ ...DEFAULT_STATE });
  console.log('[State Manager] All state cleared');
}

/**
 * Get full state (for debugging)
 * @returns {Promise<object>} Full state object
 */
export async function getFullState() {
  return await loadState();
}

/**
 * Get storage backend info (for debugging)
 * @returns {object} Backend information
 */
export function getStorageBackend() {
  const usingKV = shouldUseKV();
  return {
    backend: usingKV ? 'vercel-kv' : 'local-file',
    isVercel: process.env.VERCEL_ENV !== undefined,
    hasKVCredentials: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    useKVForced: process.env.USE_KV === 'true',
    stateFile: usingKV ? null : STATE_FILE
  };
}
