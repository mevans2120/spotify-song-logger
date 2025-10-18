import axios from 'axios';
import { getAccessToken } from './spotify-auth.js';

/**
 * Spotify API Wrapper Module
 *
 * Provides high-level functions for interacting with Spotify Web API:
 * - Fetch recently played tracks
 * - Get current playback state
 * - Retrieve track, artist, and album details
 * - Fetch audio features for tracks
 *
 * Includes:
 * - Automatic authentication
 * - Rate limit handling with exponential backoff
 * - Error handling and retry logic
 * - Response caching for metadata
 */

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Simple in-memory cache for metadata (24-hour TTL)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get item from cache if not expired
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if expired/missing
 */
function getFromCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

/**
 * Store item in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds (default: 24 hours)
 */
function setInCache(key, value, ttl = CACHE_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

/**
 * Make authenticated request to Spotify API with retry logic
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {object} options - Axios options
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<object>} API response data
 * @throws {Error} If request fails after all retries
 */
async function makeSpotifyRequest(endpoint, options = {}, retryCount = 0) {
  try {
    const accessToken = await getAccessToken();

    const response = await axios({
      method: options.method || 'GET',
      url: `${SPOTIFY_API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
      },
      ...options
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;

    // Handle rate limiting (429)
    if (status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '1', 10);
      const waitTime = retryAfter * 1000;

      console.warn(`[Spotify API] Rate limited. Waiting ${retryAfter}s before retry...`);

      if (retryCount < MAX_RETRIES) {
        await sleep(waitTime);
        return makeSpotifyRequest(endpoint, options, retryCount + 1);
      }
    }

    // Handle server errors (5xx) with exponential backoff
    if (status >= 500 && status < 600 && retryCount < MAX_RETRIES) {
      const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`[Spotify API] Server error (${status}). Retrying in ${backoffDelay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

      await sleep(backoffDelay);
      return makeSpotifyRequest(endpoint, options, retryCount + 1);
    }

    // Handle auth errors (401)
    if (status === 401) {
      console.error('[Spotify API] Authentication error. Token may be invalid.');
      throw new Error('Spotify authentication failed. Please refresh your token.');
    }

    // Log and throw other errors
    console.error(`[Spotify API] Request failed (${status}):`, errorData?.error?.message || error.message);
    throw new Error(errorData?.error?.message || error.message);
  }
}

/**
 * Get recently played tracks
 * @param {number} limit - Number of tracks to fetch (max 50)
 * @param {number} after - Unix timestamp to fetch tracks after (optional)
 * @returns {Promise<object>} Recently played response with items array
 */
export async function getRecentlyPlayed(limit = 50, after = null) {
  const params = new URLSearchParams({ limit: Math.min(limit, 50).toString() });
  if (after) {
    params.append('after', after.toString());
  }

  const endpoint = `/me/player/recently-played?${params.toString()}`;
  console.log(`[Spotify API] Fetching recently played tracks (limit: ${limit})`);

  return await makeSpotifyRequest(endpoint);
}

/**
 * Get currently playing track
 * @returns {Promise<object|null>} Current playback or null if nothing playing
 */
export async function getCurrentlyPlaying() {
  console.log('[Spotify API] Fetching currently playing track');

  try {
    return await makeSpotifyRequest('/me/player/currently-playing');
  } catch (error) {
    // Return null if nothing is currently playing (204 status)
    if (error.response?.status === 204) {
      return null;
    }
    throw error;
  }
}

/**
 * Get detailed track information
 * @param {string} trackId - Spotify track ID
 * @returns {Promise<object>} Track details
 */
export async function getTrackDetails(trackId) {
  // Check cache first
  const cacheKey = `track:${trackId}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Spotify API] Using cached track details for ${trackId}`);
    return cached;
  }

  console.log(`[Spotify API] Fetching track details for ${trackId}`);
  const track = await makeSpotifyRequest(`/tracks/${trackId}`);

  // Cache the result
  setInCache(cacheKey, track);

  return track;
}

/**
 * Get audio features for a track
 * @param {string} trackId - Spotify track ID
 * @returns {Promise<object>} Audio features (tempo, energy, etc.)
 */
export async function getAudioFeatures(trackId) {
  // Check cache first
  const cacheKey = `audio-features:${trackId}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Spotify API] Using cached audio features for ${trackId}`);
    return cached;
  }

  console.log(`[Spotify API] Fetching audio features for ${trackId}`);
  const features = await makeSpotifyRequest(`/audio-features/${trackId}`);

  // Cache the result
  setInCache(cacheKey, features);

  return features;
}

/**
 * Get audio features for multiple tracks in batch
 * @param {string[]} trackIds - Array of Spotify track IDs (max 100)
 * @returns {Promise<object[]>} Array of audio features
 */
export async function getBatchAudioFeatures(trackIds) {
  if (!trackIds || trackIds.length === 0) {
    return [];
  }

  // Limit to 100 tracks per request (Spotify API limit)
  const ids = trackIds.slice(0, 100);
  const params = new URLSearchParams({ ids: ids.join(',') });

  console.log(`[Spotify API] Fetching audio features for ${ids.length} tracks (batch)`);
  const response = await makeSpotifyRequest(`/audio-features?${params.toString()}`);

  // Cache individual results
  response.audio_features.forEach((features, index) => {
    if (features) {
      setInCache(`audio-features:${ids[index]}`, features);
    }
  });

  return response.audio_features;
}

/**
 * Get artist details including genres
 * @param {string} artistId - Spotify artist ID
 * @returns {Promise<object>} Artist details
 */
export async function getArtistDetails(artistId) {
  // Check cache first
  const cacheKey = `artist:${artistId}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Spotify API] Using cached artist details for ${artistId}`);
    return cached;
  }

  console.log(`[Spotify API] Fetching artist details for ${artistId}`);
  const artist = await makeSpotifyRequest(`/artists/${artistId}`);

  // Cache the result
  setInCache(cacheKey, artist);

  return artist;
}

/**
 * Get details for multiple artists in batch
 * @param {string[]} artistIds - Array of Spotify artist IDs (max 50)
 * @returns {Promise<object[]>} Array of artist details
 */
export async function getBatchArtistDetails(artistIds) {
  if (!artistIds || artistIds.length === 0) {
    return [];
  }

  // Limit to 50 artists per request (Spotify API limit)
  const ids = artistIds.slice(0, 50);
  const params = new URLSearchParams({ ids: ids.join(',') });

  console.log(`[Spotify API] Fetching artist details for ${ids.length} artists (batch)`);
  const response = await makeSpotifyRequest(`/artists?${params.toString()}`);

  // Cache individual results
  response.artists.forEach((artist, index) => {
    if (artist) {
      setInCache(`artist:${ids[index]}`, artist);
    }
  });

  return response.artists;
}

/**
 * Get album details
 * @param {string} albumId - Spotify album ID
 * @returns {Promise<object>} Album details
 */
export async function getAlbumDetails(albumId) {
  // Check cache first
  const cacheKey = `album:${albumId}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Spotify API] Using cached album details for ${albumId}`);
    return cached;
  }

  console.log(`[Spotify API] Fetching album details for ${albumId}`);
  const album = await makeSpotifyRequest(`/albums/${albumId}`);

  // Cache the result
  setInCache(cacheKey, album);

  return album;
}

/**
 * Clear all cached data (useful for testing)
 */
export function clearCache() {
  cache.clear();
  console.log('[Spotify API] Cache cleared');
}

/**
 * Get cache statistics (for debugging)
 * @returns {object} Cache stats
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
}
