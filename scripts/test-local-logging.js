import dotenv from 'dotenv';
import { getRecentlyPlayed, getAudioFeatures, getBatchArtistDetails } from '../lib/spotify-api.js';
import { filterNewPlays, sortTracksByTimestamp, analyzeRepeatBehavior } from '../lib/play-filter.js';
import { formatTrackForLogging, formatAsSheetRow } from '../lib/data-formatter.js';

dotenv.config();

/**
 * Local Console Logger Script
 *
 * Tests the complete Spotify logging flow locally by:
 * 1. Fetching recently played tracks
 * 2. Filtering for new 30+ second plays
 * 3. Enriching with audio features and metadata
 * 4. Formatting data for logging
 * 5. Displaying results in console (without writing to sheets)
 *
 * Usage:
 *   node scripts/test-local-logging.js
 *   node scripts/test-local-logging.js --limit 20
 *   node scripts/test-local-logging.js --verbose
 */

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 20,
    verbose: false
  };

  args.forEach((arg, index) => {
    if (arg === '--limit' && args[index + 1]) {
      options.limit = parseInt(args[index + 1], 10);
    }
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  });

  return options;
}

/**
 * Format duration in milliseconds to human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Display track in formatted console output
 * @param {object} formattedTrack - Formatted track data
 * @param {number} index - Track index
 */
function displayTrack(formattedTrack, index) {
  console.log(`${colors.bright}${colors.cyan}────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bright}Track #${index + 1}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.green}🎵 ${formattedTrack.trackName}${colors.reset}`);
  console.log(`${colors.yellow}   ${formattedTrack.artists}${colors.reset}`);
  console.log(`${colors.dim}   ${formattedTrack.album}${colors.reset}`);
  console.log('');
  console.log(`${colors.white}⏰ Played:${colors.reset}      ${formattedTrack.timestamp}`);
  console.log(`${colors.white}⏱️  Duration:${colors.reset}    ${formatDuration(formattedTrack.duration)}`);
  console.log(`${colors.white}📊 Completion:${colors.reset}  ${formattedTrack.completion}%`);
  console.log('');

  if (formattedTrack.tempo) {
    console.log(`${colors.magenta}Audio Features:${colors.reset}`);
    console.log(`  Tempo: ${formattedTrack.tempo?.toFixed(1)} BPM | Energy: ${formattedTrack.energy?.toFixed(2)} | Danceability: ${formattedTrack.danceability?.toFixed(2)}`);
    console.log(`  Valence: ${formattedTrack.valence?.toFixed(2)} | Acousticness: ${formattedTrack.acousticness?.toFixed(2)}`);
  } else {
    console.log(`${colors.dim}  No audio features available${colors.reset}`);
  }

  console.log('');
  console.log(`${colors.blue}Device:${colors.reset}        ${formattedTrack.device} (${formattedTrack.deviceType})`);
  console.log(`${colors.blue}Context:${colors.reset}       ${formattedTrack.context}`);

  if (formattedTrack.genres) {
    console.log(`${colors.blue}Genres:${colors.reset}        ${formattedTrack.genres}`);
  }

  console.log('');
}

/**
 * Display summary statistics
 * @param {object} stats - Summary statistics
 */
function displaySummary(stats) {
  console.log('');
  console.log(`${colors.bright}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}  Summary${colors.reset}`);
  console.log(`${colors.bright}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log('');
  console.log(`  Total tracks fetched:     ${colors.bright}${stats.totalFetched}${colors.reset}`);
  console.log(`  New plays to log:         ${colors.bright}${colors.green}${stats.newPlays}${colors.reset}`);
  console.log(`  Duplicates filtered:      ${colors.dim}${stats.duplicates}${colors.reset}`);
  console.log(`  Execution time:           ${colors.cyan}${stats.executionTime}${colors.reset}`);
  console.log('');

  if (stats.repeatBehavior.isRepeating) {
    console.log(`  ${colors.yellow}🔁 Repeat detected:${colors.reset} "${stats.repeatBehavior.trackName}" played ${stats.repeatBehavior.repeatCount}x`);
    console.log('');
  }
}

/**
 * Main execution function
 */
async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('');
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}  Spotify Song Logger - Local Test${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log('');

  try {
    // Step 1: Fetch recently played tracks
    console.log(`${colors.cyan}[1/4] Fetching recently played tracks...${colors.reset}`);
    const recentlyPlayed = await getRecentlyPlayed(options.limit);
    const tracks = recentlyPlayed.items || [];
    console.log(`      ✓ Fetched ${tracks.length} tracks`);
    console.log('');

    if (tracks.length === 0) {
      console.log(`${colors.yellow}No recent tracks found. Try playing some music on Spotify!${colors.reset}`);
      return;
    }

    // Step 2: Filter for new plays
    console.log(`${colors.cyan}[2/4] Filtering for 30+ second plays...${colors.reset}`);
    // For testing, we'll assume no previous state (log everything)
    const mockState = {
      lastProcessed: null
    };
    const filteredTracks = filterNewPlays(tracks, mockState);
    const sortedTracks = sortTracksByTimestamp(filteredTracks);
    console.log(`      ✓ Filtered to ${filteredTracks.length} new plays`);
    console.log('');

    // Analyze repeat behavior
    const repeatBehavior = analyzeRepeatBehavior(sortedTracks);

    // Step 3: Enrich with audio features
    console.log(`${colors.cyan}[3/4] Enriching with audio features...${colors.reset}`);
    const formattedTracks = [];

    for (const track of sortedTracks) {
      try {
        // Fetch audio features
        const audioFeatures = await getAudioFeatures(track.track.id);

        // Fetch artist details for genres
        const artistIds = track.track.artists.map(a => a.id);
        const artists = await getBatchArtistDetails(artistIds);
        const primaryArtist = artists[0];

        // Format track
        const formatted = formatTrackForLogging(
          track.track,
          track,
          audioFeatures,
          primaryArtist
        );

        formattedTracks.push(formatted);

        if (options.verbose) {
          console.log(`      ✓ ${track.track.name}`);
        }
      } catch (error) {
        console.warn(`      ⚠ Error fetching data for ${track.track.name}: ${error.message}`);

        // Create placeholder with available data
        const formatted = formatTrackForLogging(
          track.track,
          track,
          null,
          null,
          'ERROR',
          error.message
        );

        formattedTracks.push(formatted);
      }
    }
    console.log(`      ✓ Enriched ${formattedTracks.length} tracks`);
    console.log('');

    // Step 4: Display formatted data
    console.log(`${colors.cyan}[4/4] Displaying formatted data...${colors.reset}`);
    console.log('');

    formattedTracks.forEach((track, index) => {
      displayTrack(track, index);
    });

    // Display summary
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2) + 's';

    displaySummary({
      totalFetched: tracks.length,
      newPlays: filteredTracks.length,
      duplicates: tracks.length - filteredTracks.length,
      executionTime,
      repeatBehavior
    });

    // Show what would be written to sheets
    if (options.verbose && formattedTracks.length > 0) {
      console.log(`${colors.dim}Would write to Google Sheets:${colors.reset}`);
      const sampleRow = formatAsSheetRow(formattedTracks[0]);
      console.log(`${colors.dim}  ${JSON.stringify(sampleRow, null, 2)}${colors.reset}`);
      console.log('');
    }

    console.log(`${colors.green}✅ Test completed successfully!${colors.reset}`);
    console.log('');
    console.log(`${colors.dim}Next steps:${colors.reset}`);
    console.log(`  1. Run ${colors.bright}node scripts/init-sheets.js${colors.reset} to set up Google Sheets`);
    console.log(`  2. Run ${colors.bright}node scripts/run-local-logger.js${colors.reset} to actually log to sheets`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
    console.error('');

    if (error.message.includes('Missing Spotify credentials')) {
      console.error(`${colors.yellow}Make sure you have set up your .env file with:${colors.reset}`);
      console.error(`  - SPOTIFY_CLIENT_ID`);
      console.error(`  - SPOTIFY_CLIENT_SECRET`);
      console.error(`  - SPOTIFY_REFRESH_TOKEN`);
      console.error('');
      console.error(`Run ${colors.bright}node scripts/get-refresh-token.js${colors.reset} to obtain your refresh token.`);
    }

    process.exit(1);
  }
}

main();
