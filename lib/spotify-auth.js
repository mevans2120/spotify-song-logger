import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Spotify OAuth Token Management Module
 *
 * Handles Spotify authentication including:
 * - Access token retrieval
 * - Token refresh
 * - Token expiration checking
 *
 * Required OAuth scopes:
 * - user-read-recently-played
 * - user-read-currently-playing
 * - user-read-playback-state
 * - user-read-playback-position
 * - user-library-read
 */

// In-memory token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

/**
 * Check if the current access token is expired or about to expire
 * @param {number} bufferSeconds - Seconds before expiry to consider token expired (default: 300 = 5 minutes)
 * @returns {boolean} True if token is expired or will expire soon
 */
export function isTokenExpired(bufferSeconds = 300) {
  if (!tokenCache.accessToken || !tokenCache.expiresAt) {
    return true;
  }

  const now = Date.now();
  const expiryWithBuffer = tokenCache.expiresAt - (bufferSeconds * 1000);

  return now >= expiryWithBuffer;
}

/**
 * Refresh the Spotify access token using the refresh token
 * @returns {Promise<string>} New access token
 * @throws {Error} If refresh fails
 */
export async function refreshAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Spotify credentials in environment variables');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        }
      }
    );

    const { access_token, expires_in } = response.data;

    // Update token cache
    tokenCache.accessToken = access_token;
    tokenCache.expiresAt = Date.now() + (expires_in * 1000);

    console.log('[Spotify Auth] Access token refreshed successfully');
    console.log('[Spotify Auth] Token expires at:', new Date(tokenCache.expiresAt).toISOString());

    return access_token;
  } catch (error) {
    console.error('[Spotify Auth] Token refresh failed:', error.response?.data || error.message);
    throw new Error(`Failed to refresh Spotify access token: ${error.response?.data?.error_description || error.message}`);
  }
}

/**
 * Get a valid Spotify access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 * @throws {Error} If unable to obtain valid token
 */
export async function getAccessToken() {
  // If token is expired or about to expire, refresh it
  if (isTokenExpired()) {
    console.log('[Spotify Auth] Token expired or expiring soon, refreshing...');
    return await refreshAccessToken();
  }

  // Return cached token if still valid
  console.log('[Spotify Auth] Using cached access token');
  return tokenCache.accessToken;
}

/**
 * Clear the token cache (useful for testing or forcing refresh)
 */
export function clearTokenCache() {
  tokenCache = {
    accessToken: null,
    expiresAt: null
  };
  console.log('[Spotify Auth] Token cache cleared');
}

/**
 * Get token cache status (for debugging)
 * @returns {object} Current token cache state
 */
export function getTokenCacheStatus() {
  return {
    hasToken: !!tokenCache.accessToken,
    expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null,
    isExpired: isTokenExpired(),
    timeUntilExpiry: tokenCache.expiresAt ? Math.max(0, tokenCache.expiresAt - Date.now()) : 0
  };
}
