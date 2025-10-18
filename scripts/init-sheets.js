import dotenv from 'dotenv';
import { google } from 'googleapis';
import { createSheetIfNotExists, initSheetsClient, appendRows } from '../lib/sheets-api.js';
import { getSheetHeaders } from '../lib/data-formatter.js';

dotenv.config();

/**
 * Google Sheets Initialization Script
 *
 * Initializes the Google Sheet with proper structure for all three sheets:
 * 1. Listening Log - Main log with 28 columns
 * 2. Historical Data - One-time import data (same structure + import timestamp)
 * 3. System Logs - Operational logs with 7 columns
 *
 * Also applies formatting:
 * - Bold headers
 * - Frozen header row
 * - Column widths
 * - Number formatting
 *
 * Usage:
 *   node scripts/init-sheets.js
 *   node scripts/init-sheets.js --dry-run
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run')
  };
}

/**
 * Get headers for Historical Data sheet (same as Listening Log + import timestamp)
 */
function getHistoricalDataHeaders() {
  const baseHeaders = getSheetHeaders();
  return [...baseHeaders, 'Import Timestamp'];
}

/**
 * Get headers for System Logs sheet
 */
function getSystemLogsHeaders() {
  return [
    'Timestamp',
    'Log Level',
    'Event Type',
    'Details',
    'Retry Count',
    'Resolution Time',
    'Affected Tracks'
  ];
}

/**
 * Apply formatting to a sheet
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {number} sheetId - Sheet ID to format
 * @param {number} headerCount - Number of header columns
 */
async function applySheetFormatting(sheets, spreadsheetId, sheetId, headerCount) {
  const requests = [
    // Freeze header row
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    },
    // Bold header row
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9
            }
          }
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)'
      }
    }
  ];

  // Set column widths based on content type
  const columnWidths = {
    timestamp: 180,
    trackName: 250,
    artist: 200,
    album: 200,
    duration: 100,
    id: 180,
    genre: 150,
    audioFeature: 100,
    device: 150,
    context: 150,
    status: 100,
    error: 300,
    default: 120
  };

  // Apply column widths
  for (let i = 0; i < headerCount; i++) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: i,
          endIndex: i + 1
        },
        properties: {
          pixelSize: i === 0 ? columnWidths.timestamp :
                     i === 1 ? columnWidths.trackName :
                     i === 2 || i === 3 ? columnWidths.artist :
                     columnWidths.default
        },
        fields: 'pixelSize'
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId,
    resource: { requests }
  });

  console.log(`${colors.green}  ✓${colors.reset} Applied formatting to sheet`);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  console.log('');
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}  Google Sheets Initialization${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log('');

  if (options.dryRun) {
    console.log(`${colors.yellow}Running in DRY RUN mode - no changes will be made${colors.reset}`);
    console.log('');
  }

  try {
    // Initialize Sheets client
    console.log(`${colors.cyan}[1/4] Initializing Google Sheets client...${colors.reset}`);
    const sheets = await initSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    console.log(`${colors.green}  ✓${colors.reset} Client initialized`);
    console.log('');

    if (options.dryRun) {
      console.log(`${colors.cyan}[2/4] Would create/verify sheets:${colors.reset}`);
      console.log(`  - Listening Log (28 columns)`);
      console.log(`  - Historical Data (29 columns)`);
      console.log(`  - System Logs (7 columns)`);
      console.log('');
      console.log(`${colors.cyan}[3/4] Would apply formatting:${colors.reset}`);
      console.log(`  - Bold headers`);
      console.log(`  - Frozen header row`);
      console.log(`  - Column widths`);
      console.log('');
      console.log(`${colors.cyan}[4/4] DRY RUN complete${colors.reset}`);
      console.log('');
      console.log(`${colors.yellow}Run without --dry-run to actually initialize sheets${colors.reset}`);
      console.log('');
      return;
    }

    // Create/verify Listening Log sheet
    console.log(`${colors.cyan}[2/4] Setting up "Listening Log" sheet...${colors.reset}`);
    const listeningHeaders = getSheetHeaders();
    const listeningLog = await createSheetIfNotExists('Listening Log', listeningHeaders);

    if (!listeningLog.created && !listeningLog.exists) {
      // Sheet was just created with headers, apply formatting
      await applySheetFormatting(sheets, spreadsheetId, listeningLog.sheetId, listeningHeaders.length);
    } else if (listeningLog.exists) {
      console.log(`${colors.green}  ✓${colors.reset} Sheet already exists with data`);
    }
    console.log('');

    // Create/verify Historical Data sheet
    console.log(`${colors.cyan}[3/4] Setting up "Historical Data" sheet...${colors.reset}`);
    const historicalHeaders = getHistoricalDataHeaders();
    const historicalData = await createSheetIfNotExists('Historical Data', historicalHeaders);

    if (!historicalData.created && !historicalData.exists) {
      await applySheetFormatting(sheets, spreadsheetId, historicalData.sheetId, historicalHeaders.length);
    } else if (historicalData.exists) {
      console.log(`${colors.green}  ✓${colors.reset} Sheet already exists with data`);
    }
    console.log('');

    // Create/verify System Logs sheet
    console.log(`${colors.cyan}[4/4] Setting up "System Logs" sheet...${colors.reset}`);
    const systemLogsHeaders = getSystemLogsHeaders();
    const systemLogs = await createSheetIfNotExists('System Logs', systemLogsHeaders);

    if (!systemLogs.created && !systemLogs.exists) {
      await applySheetFormatting(sheets, spreadsheetId, systemLogs.sheetId, systemLogsHeaders.length);
    } else if (systemLogs.exists) {
      console.log(`${colors.green}  ✓${colors.reset} Sheet already exists with data`);
    }
    console.log('');

    // Success summary
    console.log(`${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}${colors.bright}  ✅ Google Sheets initialized successfully!${colors.reset}`);
    console.log(`${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log('');
    console.log(`${colors.cyan}Sheets created:${colors.reset}`);
    console.log(`  1. Listening Log (${listeningHeaders.length} columns)`);
    console.log(`  2. Historical Data (${historicalHeaders.length} columns)`);
    console.log(`  3. System Logs (${systemLogsHeaders.length} columns)`);
    console.log('');
    console.log(`${colors.cyan}Formatting applied:${colors.reset}`);
    console.log(`  ✓ Bold headers`);
    console.log(`  ✓ Frozen header row`);
    console.log(`  ✓ Column widths optimized`);
    console.log('');
    console.log(`${colors.cyan}Next steps:${colors.reset}`);
    console.log(`  1. View your sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    console.log(`  2. Run local logger: ${colors.bright}node scripts/run-local-logger.js${colors.reset}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error(`${colors.bright}❌ Error:${colors.reset}`, error.message);
    console.error('');

    if (error.message.includes('Missing Google Sheets credentials')) {
      console.error(`${colors.yellow}Make sure you have set up your .env file with:${colors.reset}`);
      console.error(`  - GOOGLE_SHEETS_ID`);
      console.error(`  - GOOGLE_SERVICE_ACCOUNT_EMAIL`);
      console.error(`  - GOOGLE_PRIVATE_KEY`);
      console.error('');
      console.error(`See ${colors.bright}docs/GOOGLE_SETUP.md${colors.reset} for setup instructions.`);
    } else if (error.message.includes('Permission denied')) {
      console.error(`${colors.yellow}Make sure your service account has Editor access to the sheet:${colors.reset}`);
      console.error(`  1. Open your Google Sheet`);
      console.error(`  2. Click "Share"`);
      console.error(`  3. Add your service account email with Editor permission`);
      console.error(`  4. Service account email: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    }

    console.error('');
    process.exit(1);
  }
}

main();
