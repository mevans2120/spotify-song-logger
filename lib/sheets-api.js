import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets API Wrapper Module
 *
 * Provides high-level functions for interacting with Google Sheets API:
 * - Append rows to sheets
 * - Batch append operations
 * - Retrieve recent rows
 * - Update specific rows
 * - Create sheets with headers
 *
 * Includes:
 * - Automatic authentication via service account
 * - Rate limit handling with exponential backoff
 * - Error handling and retry logic
 * - Batch operations for performance
 */

const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Sheets API client (initialized once)
let sheetsClient = null;

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize and return authenticated Google Sheets API client
 * @returns {Promise<object>} Authenticated sheets client
 * @throws {Error} If credentials are missing or invalid
 */
export async function initSheetsClient() {
  if (sheetsClient) {
    return sheetsClient;
  }

  if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error('Missing Google Sheets credentials in environment variables');
  }

  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[Sheets API] Client initialized successfully');

    return sheetsClient;
  } catch (error) {
    console.error('[Sheets API] Failed to initialize client:', error.message);
    throw new Error(`Failed to initialize Google Sheets client: ${error.message}`);
  }
}

/**
 * Make request to Sheets API with retry logic
 * @param {Function} requestFn - Function that makes the API request
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<any>} API response
 * @throws {Error} If request fails after all retries
 */
async function makeSheetsRequest(requestFn, retryCount = 0) {
  try {
    return await requestFn();
  } catch (error) {
    const status = error.code;

    // Handle rate limiting (429)
    if (status === 429) {
      const waitTime = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`[Sheets API] Rate limited. Waiting ${waitTime}ms before retry...`);

      if (retryCount < MAX_RETRIES) {
        await sleep(waitTime);
        return makeSheetsRequest(requestFn, retryCount + 1);
      }
    }

    // Handle server errors (5xx) with exponential backoff
    if (status >= 500 && status < 600 && retryCount < MAX_RETRIES) {
      const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`[Sheets API] Server error (${status}). Retrying in ${backoffDelay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

      await sleep(backoffDelay);
      return makeSheetsRequest(requestFn, retryCount + 1);
    }

    // Handle permission errors
    if (status === 403) {
      console.error('[Sheets API] Permission denied. Check service account has Editor access to the sheet.');
      throw new Error('Permission denied: Service account needs Editor access to the Google Sheet');
    }

    // Handle not found errors
    if (status === 404) {
      console.error('[Sheets API] Sheet not found. Check GOOGLE_SHEETS_ID is correct.');
      throw new Error('Sheet not found: Verify GOOGLE_SHEETS_ID in environment variables');
    }

    // Log and throw other errors
    console.error(`[Sheets API] Request failed:`, error.message);
    throw error;
  }
}

/**
 * Append rows to a specific sheet
 * @param {string} sheetName - Name of the sheet tab
 * @param {array} values - Array of row arrays to append
 * @returns {Promise<object>} Append response with update info
 */
export async function appendRows(sheetName, values) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Appending ${values.length} row(s) to "${sheetName}"`);

  return await makeSheetsRequest(async () => {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:ZZ`,
      valueInputOption: 'USER_ENTERED', // Allows Google Sheets to interpret values (dates, numbers, etc.)
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: values
      }
    });

    console.log(`[Sheets API] Successfully appended ${response.data.updates.updatedRows} row(s)`);
    return response.data;
  });
}

/**
 * Batch append multiple rows to a sheet (more efficient for large operations)
 * @param {string} sheetName - Name of the sheet tab
 * @param {array} values - Array of row arrays to append (max 1000 rows recommended)
 * @returns {Promise<object>} Batch update response
 */
export async function batchAppendRows(sheetName, values) {
  if (values.length > 1000) {
    console.warn(`[Sheets API] Attempting to batch append ${values.length} rows. Consider splitting into smaller batches.`);
  }

  return await appendRows(sheetName, values);
}

/**
 * Get the last N rows from a sheet
 * @param {string} sheetName - Name of the sheet tab
 * @param {number} n - Number of rows to retrieve
 * @returns {Promise<array>} Array of rows
 */
export async function getLastNRows(sheetName, n = 10) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Retrieving last ${n} row(s) from "${sheetName}"`);

  return await makeSheetsRequest(async () => {
    // First, get all data to determine the range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:ZZ`
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log(`[Sheets API] Sheet "${sheetName}" is empty`);
      return [];
    }

    // Return last N rows (excluding header row)
    const startIndex = Math.max(1, rows.length - n);
    const lastRows = rows.slice(startIndex);

    console.log(`[Sheets API] Retrieved ${lastRows.length} row(s)`);
    return lastRows;
  });
}

/**
 * Get all rows from a sheet
 * @param {string} sheetName - Name of the sheet tab
 * @returns {Promise<array>} Array of all rows
 */
export async function getAllRows(sheetName) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Retrieving all rows from "${sheetName}"`);

  return await makeSheetsRequest(async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:ZZ`
    });

    const rows = response.data.values || [];
    console.log(`[Sheets API] Retrieved ${rows.length} row(s)`);
    return rows;
  });
}

/**
 * Update a specific row in a sheet
 * @param {string} sheetName - Name of the sheet tab
 * @param {number} rowIndex - Row number to update (1-indexed, row 1 is the header)
 * @param {array} values - Array of values for the row
 * @returns {Promise<object>} Update response
 */
export async function updateRow(sheetName, rowIndex, values) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Updating row ${rowIndex} in "${sheetName}"`);

  return await makeSheetsRequest(async () => {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A${rowIndex}:ZZ${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [values]
      }
    });

    console.log(`[Sheets API] Successfully updated row ${rowIndex}`);
    return response.data;
  });
}

/**
 * Create a new sheet tab if it doesn't exist, with headers
 * @param {string} sheetName - Name of the sheet tab to create
 * @param {array} headers - Array of header column names
 * @returns {Promise<object>} Create response or existing sheet info
 */
export async function createSheetIfNotExists(sheetName, headers) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Checking if sheet "${sheetName}" exists`);

  return await makeSheetsRequest(async () => {
    // Get spreadsheet metadata to check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEETS_ID
    });

    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === sheetName
    );

    if (existingSheet) {
      console.log(`[Sheets API] Sheet "${sheetName}" already exists`);
      return { exists: true, sheetId: existingSheet.properties.sheetId };
    }

    // Create new sheet
    console.log(`[Sheets API] Creating new sheet "${sheetName}"`);
    const createResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_ID,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }]
      }
    });

    const newSheetId = createResponse.data.replies[0].addSheet.properties.sheetId;

    // Add headers to the new sheet
    if (headers && headers.length > 0) {
      await appendRows(sheetName, [headers]);
      console.log(`[Sheets API] Added headers to "${sheetName}"`);
    }

    console.log(`[Sheets API] Successfully created sheet "${sheetName}"`);
    return { exists: false, sheetId: newSheetId, created: true };
  });
}

/**
 * Write error placeholder row for failed track processing
 * @param {string} sheetName - Name of the sheet tab
 * @param {object} partialTrack - Partial track data available
 * @param {string} error - Error message
 * @returns {Promise<object>} Append response
 */
export async function writeErrorPlaceholder(sheetName, partialTrack, error) {
  const timestamp = new Date().toISOString();

  const errorRow = [
    timestamp,
    partialTrack.track?.name || 'ERROR: Unable to fetch',
    partialTrack.track?.artists?.[0]?.name || 'Unknown',
    partialTrack.track?.album?.name || 'Unknown',
    partialTrack.track?.duration_ms || 0,
    0, // Play Duration
    0, // Completion %
    partialTrack.track?.id || '',
    partialTrack.track?.album?.id || '',
    partialTrack.track?.artists?.[0]?.id || '',
    '', // Genres
    null, // Tempo
    null, // Energy
    null, // Danceability
    null, // Valence
    null, // Acousticness
    null, // Instrumentalness
    null, // Speechiness
    null, // Loudness
    null, // Popularity
    'Unknown', // Device
    'Unknown', // Device Type
    'None', // Context
    '', // Context URI
    false, // Explicit
    '', // Release Date
    'ERROR', // Status
    error // Error Details
  ];

  console.log(`[Sheets API] Writing error placeholder for track: ${partialTrack.track?.name || 'Unknown'}`);
  return await appendRows(sheetName, [errorRow]);
}

/**
 * Clear all data from a sheet (keeps headers)
 * @param {string} sheetName - Name of the sheet tab
 * @returns {Promise<object>} Clear response
 */
export async function clearSheetData(sheetName) {
  const sheets = await initSheetsClient();

  console.log(`[Sheets API] Clearing data from "${sheetName}" (keeping headers)`);

  return await makeSheetsRequest(async () => {
    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: `${sheetName}!A2:ZZ`
    });

    console.log(`[Sheets API] Successfully cleared data from "${sheetName}"`);
    return response.data;
  });
}

/**
 * Get sheet metadata (properties, formatting, etc.)
 * @returns {Promise<object>} Spreadsheet metadata
 */
export async function getSpreadsheetMetadata() {
  const sheets = await initSheetsClient();

  return await makeSheetsRequest(async () => {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEETS_ID
    });

    return response.data;
  });
}
