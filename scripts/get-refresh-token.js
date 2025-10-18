import http from 'http';
import { exec } from 'child_process';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * One-time Spotify Authorization Script
 *
 * This script helps you obtain a Spotify refresh token by:
 * 1. Opening your browser for Spotify authorization
 * 2. Starting a local server to receive the callback
 * 3. Exchanging the authorization code for a refresh token
 * 4. Displaying the refresh token for you to add to .env
 *
 * Required OAuth Scopes:
 * - user-read-recently-played
 * - user-read-currently-playing
 * - user-read-playback-state
 * - user-read-playback-position
 * - user-library-read
 */

const SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-playback-position',
  'user-library-read'
];

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback';
const PORT = 8888;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env file');
  console.error('');
  console.error('Please add these to your .env file:');
  console.error('  SPOTIFY_CLIENT_ID=your_client_id');
  console.error('  SPOTIFY_CLIENT_SECRET=your_client_secret');
  console.error('');
  console.error('Get credentials at: https://developer.spotify.com/dashboard/applications');
  process.exit(1);
}

/**
 * Open URL in default browser
 * @param {string} url - URL to open
 */
function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' :
                  platform === 'win32' ? 'start' :
                  'xdg-open';

  exec(`${command} "${url}"`, (error) => {
    if (error) {
      console.error('⚠️  Could not auto-open browser. Please manually visit:');
      console.error(`   ${url}`);
    }
  });
}

/**
 * Exchange authorization code for access and refresh tokens
 * @param {string} code - Authorization code from Spotify
 * @returns {Promise<object>} Token response
 */
async function exchangeCodeForTokens(code) {
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('❌ Token exchange failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Start local server to receive OAuth callback
 */
function startAuthServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #e74c3c;">❌ Authorization Error</h1>
                <p>Error: ${error}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`Spotify authorization error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #e74c3c;">❌ Missing Authorization Code</h1>
                <p>No authorization code received from Spotify.</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          console.log('✅ Authorization code received');
          console.log('🔄 Exchanging code for tokens...');

          const tokens = await exchangeCodeForTokens(code);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #27ae60;">✅ Authorization Successful!</h1>
                <p>Your refresh token has been obtained.</p>
                <p>Check your terminal for the token.</p>
                <p><strong>You can close this window now.</strong></p>
              </body>
            </html>
          `);

          server.close();
          resolve(tokens);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #e74c3c;">❌ Token Exchange Failed</h1>
                <p>Error: ${error.message}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          reject(error);
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(PORT, () => {
      console.log(`🌐 Local server started on http://localhost:${PORT}`);
      console.log('');

      // Build authorization URL
      const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(' ')
      }).toString();

      console.log('🔐 Opening Spotify authorization page in your browser...');
      console.log('');
      console.log('If the browser doesn\'t open automatically, visit this URL:');
      console.log(`   ${authUrl}`);
      console.log('');

      openBrowser(authUrl);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error('   Please close any other applications using this port and try again.');
      } else {
        console.error('❌ Server error:', error.message);
      }
      reject(error);
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Spotify Refresh Token Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('This script will help you obtain a Spotify refresh token.');
  console.log('');
  console.log('📋 Required OAuth Scopes:');
  SCOPES.forEach(scope => console.log(`   - ${scope}`));
  console.log('');

  try {
    const tokens = await startAuthServer();

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   ✅ SUCCESS! Tokens Obtained');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🔑 Refresh Token (add this to your .env file):');
    console.log('');
    console.log(`   SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('');
    console.log('📝 Access Token (expires in ' + tokens.expires_in + ' seconds):');
    console.log(`   ${tokens.access_token.substring(0, 20)}...`);
    console.log('');
    console.log('⚠️  IMPORTANT:');
    console.log('   1. Add the SPOTIFY_REFRESH_TOKEN to your .env file');
    console.log('   2. Never share or commit your refresh token');
    console.log('   3. Keep your .env file in .gitignore');
    console.log('');
    console.log('✅ You can now run the Spotify logger scripts!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('   ❌ ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error(error.message);
    console.error('');
    process.exit(1);
  }
}

main();
