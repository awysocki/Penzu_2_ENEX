const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

// Configuration
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

async function exportPenzuEntries() {
  try {
    console.log('Connecting to Chrome debugger...');
    
    // Connect to the Chrome instance you started with debugging enabled
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${CONFIG.chromeDebugPort}`
    });

    const pages = await browser.pages();
    
    // Find the Penzu page (not DevTools)
    let page = null;
    for (const p of pages) {
      const url = await p.url();
      if (url.includes('penzu.com')) {
        page = p;
        break;
      }
    }
    
    if (!page) {
      console.error('No Penzu page found! Make sure you have a Penzu page open in the debugging Chrome window.');
      await browser.disconnect();
      return;
    }

    console.log('Extracting journal and entry IDs from page...');
    
    // Automatically extract journal ID and entry ID from the current page
    const { journalId, entryId } = await page.evaluate(() => {
      const pathParts = window.location.pathname.split('/');
      // URL format: https://penzu.com/p/JOURNAL_ID or https://penzu.com/p/JOURNAL_ID/ENTRY_ID
      const jId = pathParts[2] || null;
      const eId = pathParts[3] || null;
      return { journalId: jId, entryId: eId };
    });

    if (!journalId) {
      console.error('Could not extract journal ID! Make sure you are on a Penzu journal page (e.g., https://penzu.com/p/YOUR_JOURNAL_ID)');
      await browser.disconnect();
      return;
    }

    console.log(`Found Journal ID: ${journalId}`);
    
    // If no entry ID in URL or it's "new", we need to get the latest entry ID from the API
    let latestEntryId = entryId;
    
    if (!latestEntryId || latestEntryId === 'new') {
      if (latestEntryId === 'new') {
        console.log('Detected "new entry" page. Will fetch the latest entry ID from the journal...');
      } else {
        console.log('No entry open in browser. Will fetch the latest entry ID from the journal...');
      }
      latestEntryId = null; // Clear it so we fetch from API
    } else {
      console.log(`Found Entry ID: ${latestEntryId}`);
    }

    console.log('Getting authentication from browser...');
    
    // Get cookies from the logged-in session
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Get authentication token from localStorage (Penzu uses localStorage, not cookies!)
    const authData = await page.evaluate(() => {
      const pzSession = window.localStorage.getItem('pz-session');
      if (pzSession) {
        try {
          const session = JSON.parse(pzSession);
          return {
            consumerKey: session.access_token?.client_application?.key || null,
            consumerSecret: session.access_token?.client_application?.secret || null,
            token: session.access_token?.token || null,
            tokenSecret: session.access_token?.secret || null,
            userAgent: navigator.userAgent
          };
        } catch (e) {
          return { consumerKey: null, consumerSecret: null, token: null, tokenSecret: null, userAgent: navigator.userAgent };
        }
      }
      return { consumerKey: null, consumerSecret: null, token: null, tokenSecret: null, userAgent: navigator.userAgent };
    });

    if (!authData.token || !authData.consumerKey) {
      console.error('No OAuth credentials found! Make sure you are logged in to Penzu in the debugging Chrome window.');
      await browser.disconnect();
      return;
    }

    console.log('Found OAuth credentials!');
    
    // Set up OAuth 1.0a
    const oauth = OAuth({
      consumer: {
        key: authData.consumerKey,
        secret: authData.consumerSecret
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string, key) {
        return crypto
          .createHmac('sha256', key)
          .update(base_string)
          .digest('base64');
      }
    });

    const oauthToken = {
      key: authData.token,
      secret: authData.tokenSecret
    };

    // If we don't have an entry ID yet, fetch the journal to get the latest entry
    if (!latestEntryId) {
      console.log('Fetching journal info to get latest entry...');
      
      const journalRequestData = {
        url: `https://penzu.com/api/journals/${journalId}`,
        method: 'GET'
      };
      
      const journalAuthHeader = oauth.toHeader(oauth.authorize(journalRequestData, oauthToken));
      
      const journalHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': journalAuthHeader.Authorization,
        'Cookie': cookieString,
        'User-Agent': authData.userAgent
      };
      
      const journalResponse = await axios.get(journalRequestData.url, { headers: journalHeaders });
      
      // The journal response should contain info about the latest entry
      if (journalResponse.data && journalResponse.data.journal && journalResponse.data.journal.last_entry_id) {
        latestEntryId = journalResponse.data.journal.last_entry_id;
        console.log(`Found latest entry ID: ${latestEntryId}`);
      } else {
        console.error('Could not find latest entry ID! Please open a journal entry in your browser.');
        await browser.disconnect();
        return;
      }
    }
    
    console.log('Fetching journal entries...');
    
    // Ensure export directories exist
    const exportDir = './exported-entries';
    const imagesDir = './exported-entries/images';
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir);
    }
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir);
    }
    
    // Fetch entries using Penzu API
    const entries = [];
    let currentEntryId = latestEntryId;
    
    // Helper function to get random delay with jitter
    function getRandomDelay() {
      return Math.floor(Math.random() * (CONFIG.maxDelayMs - CONFIG.minDelayMs + 1)) + CONFIG.minDelayMs;
    }
    
    while (currentEntryId) {
      const entryNum = entries.length + 1;
      console.log(`[${entryNum}] Fetching entry: ${currentEntryId}`);
      
      const requestData = {
        url: `https://penzu.com/api/journals/${journalId}/entries/${currentEntryId}?next=10&previous=10`,
        method: 'GET'
      };
      
      const authHeader = oauth.toHeader(oauth.authorize(requestData, oauthToken));
      
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Authorization': authHeader.Authorization,
        'Cookie': cookieString,
        'Referer': `https://penzu.com/journals/${journalId}`,
        'User-Agent': authData.userAgent,
        'X-Xsrf-Protection': '0'
      };
      
      // Retry logic for rate limiting
      let response;
      let retryCount = 0;
      
      while (retryCount <= CONFIG.maxRetries) {
        try {
          response = await axios.get(requestData.url, { headers });
          break; // Success, exit retry loop
        } catch (error) {
          if (error.response && error.response.status === 429 && retryCount < CONFIG.maxRetries) {
            retryCount++;
            const backoffDelay = CONFIG.retryBackoffMs * retryCount;
            console.log(`    ⚠ Rate limited (429). Waiting ${backoffDelay/1000}s before retry ${retryCount}/${CONFIG.maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            throw error; // Re-throw if not 429 or max retries reached
          }
        }
      }

      const data = response.data;
      const entry = data.entry; // The actual entry is nested inside "entry" property
      
      const entryData = {
        id: entry.id,
        title: entry.title || 'Untitled',
        content: entry.content || entry.plaintext_body || entry.richtext_body || '',
        plaintext: entry.plaintext_body || '',
        richtext_body: entry.richtext_body || '',
        created_at: entry.created_at,
        updated_at: entry.modified_at || entry.updated_at,
        images: []
      };
      
      // Download images from richtext_body if present
      if (entry.richtext_body) {
        const imageUrls = extractImageUrls(entry.richtext_body);
        for (const imageUrl of imageUrls) {
          try {
            // Remove query string from URL before extracting filename
            const urlWithoutQuery = imageUrl.split('?')[0];
            const imageFilename = `${String(entryNum).padStart(4, '0')}_${entry.id}_${path.basename(urlWithoutQuery)}`;
            const imagePath = path.join(imagesDir, imageFilename);
            
            // Download image with same headers as API requests
            const imageResponse = await axios.get(imageUrl, {
              responseType: 'arraybuffer',
              headers: {
                'Cookie': cookieString,
                'User-Agent': authData.userAgent,
                'Referer': `https://penzu.com/journals/${journalId}`
              }
            });
            
            fs.writeFileSync(imagePath, imageResponse.data);
            entryData.images.push({
              url: imageUrl,
              filename: imageFilename,
              path: `images/${imageFilename}`
            });
            console.log(`    Downloaded image: ${imageFilename}`);
            
            // Small delay between image downloads
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (imgError) {
            const errorMsg = imgError.response 
              ? `${imgError.response.status} ${imgError.response.statusText}` 
              : imgError.message;
            console.log(`    ⚠ Failed to download image (${errorMsg}): ${imageUrl}`);
          }
        }
      }
      
      entries.push(entryData);
      
      // Save individual file immediately
      const createdDate = entryData.created_at || 'unknown';
      const dateStr = createdDate !== 'unknown' ? createdDate.substring(0, 10) : 'unknown';
      const filename = `${String(entryNum).padStart(4, '0')}_${dateStr}_${sanitizeFilename(entryData.title)}.txt`;
      
      // Include image references in text file
      let content = `Title: ${entryData.title}\nDate: ${createdDate}\n`;
      if (entryData.images.length > 0) {
        content += `\nImages:\n${entryData.images.map(img => `  - ${img.path}`).join('\n')}\n`;
      }
      content += `\n${entryData.content}`;
      
      fs.writeFileSync(`${exportDir}/${filename}`, content, 'utf-8');
      console.log(`    Saved: ${filename}`);
      
      // Save JSON backup every 10 entries
      if (entryNum % 10 === 0) {
        fs.writeFileSync('penzu-entries.json', JSON.stringify(entries, null, 2), 'utf-8');
        console.log(`    ✓ Backup saved (${entryNum} entries)`);
      }

      // Get the previous entry ID (going backwards through entries)
      // The API returns 'previous' as an array of entry objects
      if (data.previous && Array.isArray(data.previous) && data.previous.length > 0) {
        currentEntryId = data.previous[0].entry.id;
      } else {
        currentEntryId = null;
      }
      
      // Add a random delay to avoid rate limiting and appear more human-like
      const delay = getRandomDelay();
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.log(`\n✓ Exported ${entries.length} entries`);

    // Save final JSON file
    fs.writeFileSync(
      'penzu-entries.json',
      JSON.stringify(entries, null, 2),
      'utf-8'
    );
    console.log('✓ Final save to penzu-entries.json');
    console.log(`✓ All entries saved to ${exportDir}/`);

    await browser.disconnect();
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

function sanitizeFilename(str) {
  return str
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

function extractImageUrls(html) {
  const imageUrls = [];
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    imageUrls.push(match[1]);
  }
  return imageUrls;
}

// Run the export
exportPenzuEntries();
