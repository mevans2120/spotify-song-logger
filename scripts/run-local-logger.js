import dotenv from 'dotenv';
import { getRecentlyPlayed, getAudioFeatures, getBatchArtistDetails } from '../lib/spotify-api.js';
import { filterNewPlays, sortTracksByTimestamp, getMostRecentTrack } from '../lib/play-filter.js';
import { formatTrackForLogging, formatAsSheetRow, createErrorPlaceholder } from '../lib/data-formatter.js';
import { appendRows, getAllRows, writeErrorPlaceholder } from '../lib/sheets-api.js';
import { loadState, saveState, updateLastProcessed, addToFailedQueue, updateStats, getStats } from '../lib/state-manager.js';
import { reconcileState, filterDuplicatesAgainstSheet } from '../lib/deduplication.js';

dotenv.config();

/**
 * End-to-End Local Logger Script
 *
 * Complete logging flow that:
 * 1. Loads state from local file
 * 2. Authenticates with Spotify
 * 3. Fetches recently played tracks
 * 4. Filters for 30+ second plays not in last processed state
 * 5. Enriches with audio features and metadata
 * 6. Formats for Google Sheets
 * 7. Checks for duplicates against sheet data
 * 8. Appends new rows to "Listening Log" sheet
 * 9. Updates state with last processed track
 * 10. Logs summary to console
 *
 * Usage:
 *   node scripts/run-local-logger.js
 *   node scripts/run-local-logger.js --dry-run
 *   node scripts/run-local-logger.js --verbose
 *   node scripts/run-local-logger.js --limit 50
 */

// ANSI color codes
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
  return {
    limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '20', 10),
    verbose: args.includes('--verbose') || args.includes('-v'),
    dryRun: args.includes('--dry-run')
  };
}

/**
 * Format duration in milliseconds to human-readable format
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Main execution function
 */
async function main() {
  const options = parseArgs();
  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  console.log('');
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}  Spotify Song Logger - End-to-End Execution${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log('');

  if (options.dryRun) {
    console.log(`${colors.yellow}⚠️  DRY RUN MODE - No changes will be written to Google Sheets${colors.reset}`);
    console.log('');
  }

  try {
    // Step 1: Load state
    console.log(`${colors.cyan}[1/10] Loading state...${colors.reset}`);
    let state = await loadState();
    const stats = await getStats();
    console.log(`      ✓ State loaded (${state.failedQueue.length} items in failed queue)`);
    if (stats.lastRun) {
      console.log(`      ✓ Last run: ${new Date(stats.lastRun).toLocaleString()}`);
      console.log(`      ✓ Total successes: ${stats.successCount}, failures: ${stats.failureCount}`);
    }
    console.log('');

    // Step 2: Fetch recently played tracks
    console.log(`${colors.cyan}[2/10] Fetching recently played tracks from Spotify...${colors.reset}`);
    const recentlyPlayed = await getRecentlyPlayed(options.limit);
    const tracks = recentlyPlayed.items || [];
    console.log(`      ✓ Fetched ${tracks.length} tracks`);
    console.log('');

    if (tracks.length === 0) {
      console.log(`${colors.yellow}No recent tracks found. Try playing some music on Spotify!${colors.reset}`);
      console.log('');
      return;
    }

    // Step 3: Filter for new plays
    console.log(`${colors.cyan}[3/10] Filtering for 30+ second plays...${colors.reset}`);
    const filteredTracks = filterNewPlays(tracks, state);
    const sortedTracks = sortTracksByTimestamp(filteredTracks);
    console.log(`      ✓ Filtered to ${filteredTracks.length} new plays`);
    console.log('');

    if (filteredTracks.length === 0) {
      console.log(`${colors.green}✅ No new plays to log. Everything is up to date!${colors.reset}`);
      console.log('');
      return;
    }

    // Step 4: Load sheet data for deduplication
    console.log(`${colors.cyan}[4/10] Loading existing sheet data for deduplication...${colors.reset}`);
    const sheetRows = await getAllRows('Listening Log');
    console.log(`      ✓ Loaded ${sheetRows.length} rows from sheet`);

    // Reconcile state with sheet data
    state = reconcileState(sheetRows, state);
    console.log(`      ✓ State reconciled`);
    console.log('');

    // Step 5: Filter duplicates against sheet
    console.log(`${colors.cyan}[5/10] Checking for duplicates in sheet...${colors.reset}`);
    const uniqueTracks = filterDuplicatesAgainstSheet(sortedTracks, sheetRows);
    console.log(`      ✓ ${uniqueTracks.length} unique tracks to log (${sortedTracks.length - uniqueTracks.length} duplicates filtered)`);
    console.log('');

    if (uniqueTracks.length === 0) {
      console.log(`${colors.green}✅ All tracks already logged. Nothing new to add!${colors.reset}`);
      console.log('');
      return;
    }

    // Step 6: Enrich with audio features
    console.log(`${colors.cyan}[6/10] Enriching tracks with audio features and metadata...${colors.reset}`);
    const formattedTracks = [];
    const failedTracks = [];

    for (const track of uniqueTracks) {
      try {
        if (options.verbose) {
          console.log(`      Processing: ${track.track.name} - ${track.track.artists[0].name}`);
        }

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
        successCount++;

        if (options.verbose) {
          console.log(`      ${colors.green}✓${colors.reset} Enriched successfully`);
        }
      } catch (error) {
        console.warn(`      ${colors.yellow}⚠${colors.reset} Error fetching data for ${track.track.name}: ${error.message}`);

        // Create error placeholder
        const errorPlaceholder = createErrorPlaceholder(track, error.message);
        formattedTracks.push(errorPlaceholder);

        // Add to failed queue
        failedTracks.push({ track, error: error.message });
        failureCount++;
      }
    }
    console.log(`      ✓ Enriched ${formattedTracks.length} tracks (${successCount} success, ${failureCount} failures)`);
    console.log('');

    // Step 7: Format for sheets
    console.log(`${colors.cyan}[7/10] Formatting data for Google Sheets...${colors.reset}`);
    const rowsToAppend = formattedTracks.map(track => formatAsSheetRow(track));
    console.log(`      ✓ Formatted ${rowsToAppend.length} rows`);
    console.log('');

    // Step 8: Write to sheets (unless dry run)
    if (options.dryRun) {
      console.log(`${colors.cyan}[8/10] ${colors.yellow}[DRY RUN]${colors.cyan} Would append to Google Sheets...${colors.reset}`);
      console.log(`      ${colors.dim}Would write ${rowsToAppend.length} row(s) to "Listening Log"${colors.reset}`);
      console.log('');

      // Show sample of what would be written
      if (rowsToAppend.length > 0 && options.verbose) {
        console.log(`      ${colors.dim}Sample row:${colors.reset}`);
        console.log(`      ${colors.dim}  Track: ${formattedTracks[0].trackName}${colors.reset}`);
        console.log(`      ${colors.dim}  Artist: ${formattedTracks[0].artists}${colors.reset}`);
        console.log(`      ${colors.dim}  Timestamp: ${formattedTracks[0].timestamp}${colors.reset}`);
        console.log('');
      }
    } else {
      console.log(`${colors.cyan}[8/10] Appending to Google Sheets "Listening Log"...${colors.reset}`);
      const appendResult = await appendRows('Listening Log', rowsToAppend);
      console.log(`      ✓ Successfully wrote ${appendResult.updates.updatedRows} row(s)`);
      console.log('');
    }

    // Step 9: Update state
    console.log(`${colors.cyan}[9/10] Updating state...${colors.reset}`);

    if (!options.dryRun) {
      // Update last processed track
      const mostRecent = getMostRecentTrack(uniqueTracks);
      if (mostRecent) {
        await updateLastProcessed(mostRecent);
        console.log(`      ✓ Updated last processed: ${mostRecent.track.name}`);
      }

      // Add failed tracks to queue
      for (const failed of failedTracks) {
        await addToFailedQueue(failed.track, failed.error);
      }
      if (failedTracks.length > 0) {
        console.log(`      ✓ Added ${failedTracks.length} track(s) to failed queue`);
      }

      // Update stats
      await updateStats(successCount, failureCount);
      console.log(`      ✓ Updated stats`);
    } else {
      console.log(`      ${colors.dim}[DRY RUN] State not updated${colors.reset}`);
    }
    console.log('');

    // Step 10: Summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`${colors.cyan}[10/10] Execution complete${colors.reset}`);
    console.log('');

    console.log(`${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}${colors.bright}  ✅ Logging Complete${colors.reset}`);
    console.log(`${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log('');
    console.log(`  ${colors.cyan}Summary:${colors.reset}`);
    console.log(`    Total tracks fetched:    ${colors.bright}${tracks.length}${colors.reset}`);
    console.log(`    After filtering:         ${colors.bright}${filteredTracks.length}${colors.reset}`);
    console.log(`    After deduplication:     ${colors.bright}${uniqueTracks.length}${colors.reset}`);
    console.log(`    Successfully logged:     ${colors.bright}${colors.green}${successCount}${colors.reset}`);
    console.log(`    Failed (retry queue):    ${colors.bright}${colors.yellow}${failureCount}${colors.reset}`);
    console.log(`    Execution time:          ${colors.bright}${colors.cyan}${duration}s${colors.reset}`);
    console.log('');

    if (!options.dryRun && formattedTracks.length > 0) {
      console.log(`  ${colors.cyan}Recent tracks logged:${colors.reset}`);
      formattedTracks.slice(0, 3).forEach((track, i) => {
        console.log(`    ${i + 1}. ${colors.green}${track.trackName}${colors.reset} - ${track.artists}`);
      });
      if (formattedTracks.length > 3) {
        console.log(`    ... and ${formattedTracks.length - 3} more`);
      }
      console.log('');
    }

    if (failedTracks.length > 0) {
      console.log(`  ${colors.yellow}⚠️  ${failedTracks.length} track(s) added to retry queue${colors.reset}`);
      console.log(`  ${colors.dim}These will be retried on the next run${colors.reset}`);
      console.log('');
    }

    if (!options.dryRun) {
      console.log(`  ${colors.cyan}View your data:${colors.reset}`);
      console.log(`    https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_ID}`);
      console.log('');
    }

  } catch (error) {
    console.error('');
    console.error(`${colors.red}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.error(`${colors.red}${colors.bright}  ❌ Error${colors.reset}`);
    console.error(`${colors.red}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.error('');
    console.error(`  ${error.message}`);
    console.error('');

    if (error.message.includes('Missing Spotify credentials')) {
      console.error(`${colors.yellow}  Check your .env file has:${colors.reset}`);
      console.error(`    - SPOTIFY_CLIENT_ID`);
      console.error(`    - SPOTIFY_CLIENT_SECRET`);
      console.error(`    - SPOTIFY_REFRESH_TOKEN`);
      console.error('');
    } else if (error.message.includes('Missing Google Sheets credentials')) {
      console.error(`${colors.yellow}  Check your .env file has:${colors.reset}`);
      console.error(`    - GOOGLE_SHEETS_ID`);
      console.error(`    - GOOGLE_SERVICE_ACCOUNT_EMAIL`);
      console.error(`    - GOOGLE_PRIVATE_KEY`);
      console.error('');
      console.error(`  See ${colors.bright}docs/GOOGLE_SETUP.md${colors.reset} for setup instructions.`);
      console.error('');
    } else if (error.message.includes('Permission denied')) {
      console.error(`${colors.yellow}  Make sure your service account has Editor access:${colors.reset}`);
      console.error(`    Service account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
      console.error('');
    }

    process.exit(1);
  }
}

main();
