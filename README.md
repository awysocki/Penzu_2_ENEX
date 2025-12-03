# Penzu Journal Export Tool

This tool exports your Penzu journal entries using Node.js, Puppeteer, and Axios. It connects to a Chrome debugging session to leverage your authenticated Penzu session, then uses OAuth 1.0a to make authorized API calls to retrieve all your journal entries, including images.

## How It Works

The export process consists of two main components:

**1. Export from Penzu (`penzu-export.js`)**
- Connects to a Chrome browser instance with debugging enabled
- Extracts OAuth credentials from your active Penzu session (stored in localStorage)
- Automatically detects your journal ID and latest entry ID from the current page
- Makes authenticated API calls to retrieve each entry, working backwards chronologically
- Downloads and saves all embedded images
- Creates both JSON and individual text files for each entry
- Implements rate limiting (2-second delay between requests) to be respectful to Penzu's servers

**2. Convert to ENEX (`convert-to-enex.js`)**
- Reads the exported JSON file from step 1
- Converts entries into ENEX (Evernote Export) format
- Embeds images as base64-encoded resources within the ENEX file
- Creates a single `.enex` file ready for import into journaling apps

### Why Two Separate Scripts?

The export and conversion processes are intentionally separated for several practical reasons:

- **Resilience**: The Penzu export can take considerable time (especially with many entries). If something goes wrong during ENEX conversion, you don't need to re-export everything from Penzu.
- **Flexibility**: You can export once and convert multiple times with different settings or formats in the future.
- **Debugging**: Easier to troubleshoot issues when each step has a single responsibility.
- **Data Preservation**: The JSON export preserves all data in a structured format, while ENEX is specifically for importing into other apps.

## Inspiration & Credits

This project was inspired by [Penzu Export by chuvash.eu](https://chuvash.eu/2024/penzu-export/).

**Key modifications:**
- Uses OAuth 1.0a authentication through a debug browser session with Puppeteer
- Leverages Chrome's remote debugging protocol for seamless authentication without hardcoded credentials
- Automatically extracts journal and entry IDs from the browser, eliminating manual configuration
- Maintains session cookies through the debug browser connection
- Downloads and embeds images in both text files and ENEX format

**Development:**
- Original concept and authentication approach by chuvash.eu
- OAuth implementation, automation enhancements, and ENEX conversion developed with assistance from GitHub Copilot (Claude Sonnet 4.5)

## Prerequisites

You need to install Node.js first:
- Download from: https://nodejs.org/
- Choose the LTS (Long Term Support) version
- Install with default settings

## Setup Instructions

### 1. Install Dependencies

Open a terminal in this directory and run:
```bash
npm install
```

This creates a `node_modules` folder with all required packages. You can delete this folder anytime and recreate it by running `npm install` again.

### 2. Start Chrome with Debugging Enabled

You need to start Chrome with remote debugging enabled. Close all Chrome windows first, then:

**Windows:**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"
```

Or if Chrome is in Program Files (x86):
```powershell
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
```

Or if using Chromium:
```bash
chromium --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug"
```

### 3. Log in to Penzu

1. In the Chrome window that opened, go to https://penzu.com and log in
2. Navigate to your journal and **open an existing entry** (not a new entry)
   - The script will automatically extract your journal ID from the URL
   - If you're viewing an existing entry, it will use that as the starting point
   - If you're on the journal home page, it will fetch your most recent entry from the API
   - **Important**: Do not be on the "new entry" page when running the script

### 4. Run the Export Script

```bash
npm start
```

Or directly:
```bash
node penzu-export.js
```

## Output

The export script will create:
- `penzu-entries.json` - All entries in JSON format with metadata (title, content, dates, image references)
- `exported-entries/` - Directory containing:
  - Individual `.txt` files for each entry (numbered sequentially)
  - `images/` subdirectory with all downloaded images

Each text file is named with the format: `####_YYYY-MM-DD_Title.txt` for easy sorting and browsing.

### What Gets Exported?

For each journal entry:
- Title
- Full content (both plaintext and rich HTML versions)
- Created and modified timestamps
- All embedded images (downloaded and saved locally)
- Previous/next entry relationships for maintaining chronological order

### Optional: Convert to ENEX Format

If you want to import your entries into Journey, Diarium, Evernote, or other apps that support Evernote format:
```bash
node convert-to-enex.js
```

This reads `penzu-entries.json` and creates `penzu-entries.enex` with:
- All entries formatted as Evernote notes
- Images embedded as base64-encoded resources
- Proper XML structure compliant with ENEX DTD
- Preserved timestamps and metadata

You can then import the `.enex` file into your journaling app!

## Troubleshooting

**Error: "Cannot connect to browser"**
- Make sure Chrome is running with `--remote-debugging-port=9222`
- Check that no firewall is blocking port 9222

**Error: "401 Unauthorized" or "403 Forbidden"**
- Make sure you're logged in to Penzu in the Chrome debugging session
- Try refreshing your Penzu page and running the script again

**Error: "npm not found"**
- Node.js is not installed. Download from https://nodejs.org/

**Error: "Could not extract journal ID"**
- Make sure you're on a Penzu journal page (URL should be like `https://penzu.com/p/JOURNAL_ID`)
- Refresh the page and try again

**Error: "No OAuth credentials found"**
- Ensure you're logged in to Penzu in the debugging Chrome window
- Try logging out and logging back in
- Check that you're using the debugging Chrome instance (not a regular one)

## Technical Details

### Authentication Flow
1. Script connects to Chrome debugging session via Puppeteer
2. Extracts OAuth 1.0a credentials from `pz-session` localStorage
3. Uses consumer key/secret and access token/secret for API authentication
4. Generates proper OAuth signatures for each API request using HMAC-SHA256

### API Endpoints Used
- `GET /api/journals/{journalId}` - Fetch journal metadata and latest entry ID
- `GET /api/journals/{journalId}/entries/{entryId}?next=10&previous=10` - Fetch individual entries

### Rate Limiting
The script implements a 2-second delay between API requests to avoid overwhelming Penzu's servers and prevent potential rate limiting or IP blocking.

**Smart delay strategy:**
- Uses random jitter (2-3 seconds) between requests to appear more human-like
- Automatically retries on rate limit errors (HTTP 429)
- Implements exponential backoff: 5s, 10s, 15s on successive retries
- Maximum of 3 retry attempts before failing

You can adjust the delay settings in the CONFIG section of `penzu-export.js` if needed.

## Configuration

You can customize the script's behavior by editing the `CONFIG` object at the top of `penzu-export.js`:

```javascript
const CONFIG = {
  // Chrome debugging port (default is 9222)
  chromeDebugPort: 9222,
  
  // Delay between API requests in milliseconds
  // Uses random jitter to appear more human-like
  minDelayMs: 2000,  // Minimum delay (2 seconds)
  maxDelayMs: 3000,  // Maximum delay (3 seconds)
  
  // Retry configuration for rate limiting
  maxRetries: 3,           // Maximum number of retries for 429 errors
  retryBackoffMs: 5000     // Additional delay after 429 error (5 seconds)
};
```

**Configuration Parameters:**

- **`chromeDebugPort`** (default: `9222`)
  - The port number used for Chrome's remote debugging protocol
  - Only change this if port 9222 is already in use on your system
  - Must match the port in your Chrome launch command

- **`minDelayMs`** (default: `2000`)
  - Minimum delay in milliseconds between API requests
  - Lower values = faster export but higher risk of rate limiting
  - Recommended minimum: 1000ms (1 second)

- **`maxDelayMs`** (default: `3000`)
  - Maximum delay in milliseconds between API requests
  - The actual delay is randomly chosen between min and max
  - Creates human-like variability in request timing

- **`maxRetries`** (default: `3`)
  - Number of times to retry a request if rate limited (HTTP 429)
  - Set to 0 to disable automatic retries
  - Each retry adds progressively longer delays

- **`retryBackoffMs`** (default: `5000`)
  - Base delay in milliseconds to wait after a rate limit error
  - First retry waits this amount, second waits 2x, third waits 3x
  - Example: 5000ms = 5s, 10s, 15s for successive retries

## Notes

- The script automatically extracts your journal ID and latest entry ID from the browser
- The script navigates backwards through your entries using the `previous_entry_id` field
- A 2-second delay is added between requests to avoid rate limiting
- Keep the Chrome debugging session open while the script runs
- **Testing**: This tool has been tested on Windows 11. It should work on macOS and Linux, but has not been verified on those platforms.
