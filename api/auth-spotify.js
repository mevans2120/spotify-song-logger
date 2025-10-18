import { getAccessToken, refreshAccessToken, isTokenExpired } from '../lib/spotify-auth.js';

/**
 * Vercel Serverless Function: Test Spotify Authentication
 *
 * This function provides a manual way to test Spotify authentication
 * and view current token status. Useful for debugging authentication
 * issues in production.
 *
 * Endpoint: /api/auth-spotify
 * Method: GET
 * Query params:
 *   - refresh=true: Force token refresh (default: false)
 * Response: JSON with token status and metadata
 *
 * Example usage:
 *   GET /api/auth-spotify
 *   GET /api/auth-spotify?refresh=true
 */

/**
 * Main serverless handler
 * @param {object} req - Vercel request object
 * @param {object} res - Vercel response object
 */
export default async function handler(req, res) {
  try {
    const forceRefresh = req.query.refresh === 'true';

    console.log('[Auth Spotify] Testing Spotify authentication...');
    console.log('[Auth Spotify] Force refresh:', forceRefresh);

    let tokenInfo;
    let accessToken;

    if (forceRefresh) {
      // Force token refresh
      console.log('[Auth Spotify] Forcing token refresh...');
      tokenInfo = await refreshAccessToken();
      accessToken = tokenInfo.access_token;
    } else {
      // Get token (will auto-refresh if needed)
      console.log('[Auth Spotify] Getting access token...');
      accessToken = await getAccessToken();
      tokenInfo = {
        access_token: accessToken,
        // Note: getAccessToken() doesn't return full token info
        // Only refreshAccessToken() does
      };
    }

    // Check if credentials are present (without exposing them)
    const hasClientId = !!process.env.SPOTIFY_CLIENT_ID;
    const hasClientSecret = !!process.env.SPOTIFY_CLIENT_SECRET;
    const hasRefreshToken = !!process.env.SPOTIFY_REFRESH_TOKEN;

    // Mask the access token for security (show first/last 4 chars)
    const maskedAccessToken = accessToken
      ? `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}`
      : null;

    console.log('[Auth Spotify] Authentication successful');

    return res.status(200).json({
      success: true,
      message: 'Spotify authentication successful',
      credentials: {
        hasClientId,
        hasClientSecret,
        hasRefreshToken,
        allPresent: hasClientId && hasClientSecret && hasRefreshToken
      },
      token: {
        present: !!accessToken,
        masked: maskedAccessToken,
        length: accessToken ? accessToken.length : 0,
        expiresIn: tokenInfo.expires_in || null,
        tokenType: tokenInfo.token_type || 'Bearer',
        scope: tokenInfo.scope || null
      },
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION || 'unknown'
      }
    });

  } catch (error) {
    console.error('[Auth Spotify] Authentication failed:', error);

    // Check for common error scenarios
    let errorType = 'unknown';
    let helpMessage = null;

    if (error.message.includes('Missing Spotify credentials')) {
      errorType = 'missing_credentials';
      helpMessage = 'Check that SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN are set in environment variables';
    } else if (error.message.includes('invalid_grant')) {
      errorType = 'invalid_refresh_token';
      helpMessage = 'Your refresh token may be expired or invalid. Generate a new one using scripts/get-refresh-token.js';
    } else if (error.message.includes('invalid_client')) {
      errorType = 'invalid_client_credentials';
      helpMessage = 'Your SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET may be incorrect';
    } else if (error.response?.status === 429) {
      errorType = 'rate_limit';
      helpMessage = 'Spotify API rate limit exceeded. Wait a moment and try again.';
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: errorType,
      help: helpMessage,
      credentials: {
        hasClientId: !!process.env.SPOTIFY_CLIENT_ID,
        hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        hasRefreshToken: !!process.env.SPOTIFY_REFRESH_TOKEN
      },
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
