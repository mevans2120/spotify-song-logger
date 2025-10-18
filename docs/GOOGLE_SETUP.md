# Google Service Account Setup Guide

This guide walks you through setting up a Google Service Account for the Spotify Song Logger to access Google Sheets.

## Prerequisites

- Google Account
- Target Google Sheet already created

## Step-by-Step Instructions

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click on the project dropdown (top left, next to "Google Cloud")
3. Click "NEW PROJECT"
4. Enter project details:
   - **Project name**: `spotify-song-logger` (or your preferred name)
   - **Organization**: Leave as default (No organization)
5. Click "CREATE"
6. Wait for the project to be created (notification will appear)
7. Select your new project from the project dropdown

### 2. Enable Required APIs

1. In the search bar at the top, type "Google Sheets API"
2. Click on "Google Sheets API" from the results
3. Click "ENABLE"
4. Wait for the API to be enabled
5. Repeat the process for "Google Drive API":
   - Search for "Google Drive API"
   - Click on it
   - Click "ENABLE"

### 3. Create a Service Account

1. In the left sidebar, click "IAM & Admin" → "Service Accounts"
   - Or search for "Service Accounts" in the top search bar
2. Click "CREATE SERVICE ACCOUNT" (top of page)
3. Fill in service account details:
   - **Service account name**: `spotify-logger-bot`
   - **Service account ID**: Will auto-fill (e.g., `spotify-logger-bot@project-id.iam.gserviceaccount.com`)
   - **Description**: "Service account for Spotify Song Logger to write to Google Sheets"
4. Click "CREATE AND CONTINUE"
5. Grant service account access (optional, can skip):
   - Skip this step by clicking "CONTINUE"
6. Grant users access to this service account (optional, can skip):
   - Skip this step by clicking "DONE"

### 4. Create and Download Service Account Key

1. On the Service Accounts page, find your newly created service account
2. Click on the service account email to open its details
3. Go to the "KEYS" tab
4. Click "ADD KEY" → "Create new key"
5. Select key type: **JSON**
6. Click "CREATE"
7. The JSON key file will automatically download to your computer
8. **IMPORTANT**: Store this file securely and never commit it to version control

The JSON file will look like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "spotify-logger-bot@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

### 5. Grant Service Account Access to Your Google Sheet

1. Open your Google Sheet in a web browser
2. Click the "Share" button (top right)
3. In the "Add people and groups" field, paste your service account email:
   - Example: `spotify-logger-bot@your-project.iam.gserviceaccount.com`
   - You can find this email in the downloaded JSON file (`client_email` field)
4. Set permission level to **Editor**
5. **IMPORTANT**: Uncheck "Notify people" (the service account is not a real email)
6. Click "Share" or "Done"

### 6. Get Your Google Sheet ID

Your Google Sheet ID is in the URL when viewing the sheet:

```
https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
```

For example:
- URL: `https://docs.google.com/spreadsheets/d/1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ/edit`
- Sheet ID: `1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ`

### 7. Add Credentials to .env File

Open your `.env` file and add the following from your downloaded JSON key:

```bash
# Google Sheets Configuration
GOOGLE_SHEETS_ID=1KEGe1wGwukAsHhnrdQF0bpbECDOKPjqG2E9bpjSEkdQ  # Your sheet ID from step 6
GOOGLE_SERVICE_ACCOUNT_EMAIL=spotify-logger-bot@your-project.iam.gserviceaccount.com  # From client_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"  # From private_key
```

**IMPORTANT NOTES about GOOGLE_PRIVATE_KEY:**
- Copy the entire `private_key` value from the JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Keep the `\n` characters in the key (they represent line breaks)
- Wrap the entire key in double quotes
- The key should look like one long string with `\n` characters

### 8. Test the Connection

Run the test script to verify your setup:

```bash
node scripts/test-sheets-connection.js
```

If successful, you should see:
```
✅ Successfully connected to Google Sheets!
✅ Sheet name: Your Sheet Name
✅ Service account has write access
```

## Troubleshooting

### Error: "The caller does not have permission"

**Solution**: Make sure you shared the sheet with your service account email and gave it Editor permissions.

### Error: "Invalid private key"

**Solutions**:
- Ensure the private key includes the `\n` line break characters
- Make sure the key is wrapped in double quotes in the `.env` file
- Verify you copied the entire key including the BEGIN and END markers
- Try escaping the newlines: replace `\n` with `\\n`

### Error: "Requested entity was not found"

**Solution**: Double-check your `GOOGLE_SHEETS_ID` - it should be the long string from the sheet URL.

### Error: "Unable to parse JSON"

**Solution**: The JSON key file may be corrupted. Download a new key from the Google Cloud Console:
1. Go to your service account
2. Go to "KEYS" tab
3. Delete the old key
4. Create a new JSON key

## Security Best Practices

1. **Never commit the JSON key file** - It's in `.gitignore`, but be extra careful
2. **Never commit the `.env` file** - Also in `.gitignore`
3. **Rotate keys every 90 days** - Google recommends regular key rotation
4. **Use separate service accounts** for different environments (dev, staging, production)
5. **Limit service account permissions** - Only grant Editor access to the specific sheet needed
6. **Monitor service account usage** - Check Google Cloud Console logs periodically

## Key Rotation (Every 90 Days)

1. Create a new key for your service account (following step 4 above)
2. Update your `.env` file with the new credentials
3. Test the connection
4. Delete the old key from Google Cloud Console once confirmed working

## Additional Resources

- [Google Service Account Documentation](https://cloud.google.com/iam/docs/service-accounts)
- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
