const fs = require('fs');
const path = require('path');

// Read the exported entries
const entries = JSON.parse(fs.readFileSync('penzu-entries.json', 'utf-8'));

// ENEX header
let enex = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">
<en-export export-date="${new Date().toISOString()}" application="Penzu Export" version="1.0">
`;

// Convert each entry to a note
for (const entry of entries) {
  const createdDate = new Date(entry.created_at);
  const updatedDate = new Date(entry.updated_at);
  
  // Convert HTML content and embed images
  let content = entry.richtext_body || escapeHtml(entry.plaintext || entry.content);
  
  // Collect resources for this note
  const resources = [];
  
  // Embed images as base64 data URLs if they exist
  if (entry.images && entry.images.length > 0) {
    for (const image of entry.images) {
      const imagePath = path.join('exported-entries', image.path);
      if (fs.existsSync(imagePath)) {
        try {
          const imageData = fs.readFileSync(imagePath);
          const base64 = imageData.toString('base64');
          const ext = path.extname(image.filename).substring(1).toLowerCase();
          const mimeType = getMimeType(ext);
          
          // Create hash for Evernote resource
          const hash = require('crypto').createHash('md5').update(imageData).digest('hex');
          
          // Replace image URL with en-media tag
          const originalUrl = image.url;
          content = content.replace(
            new RegExp(`<img[^>]*src="${escapeRegex(originalUrl)}"[^>]*>`, 'gi'),
            `<en-media type="${mimeType}" hash="${hash}"/>`
          );
          
          // Add to resources array
          resources.push({
            data: base64,
            mime: mimeType,
            filename: image.filename,
            hash: hash
          });
        } catch (err) {
          console.log(`Warning: Could not embed image ${image.filename}: ${err.message}`);
        }
      }
    }
  }
  
  // Wrap content in CDATA
  const noteContent = `<![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${content}</en-note>]]>`;
  
  // Build the note
  enex += `
  <note>
    <title>${escapeXml(entry.title)}</title>
    <content>${noteContent}</content>
    <created>${formatEnexDate(createdDate)}</created>
    <updated>${formatEnexDate(updatedDate)}</updated>
    <note-attributes>
      <author>Penzu Export</author>
    </note-attributes>`;
  
  // Add resources if any
  for (const resource of resources) {
    enex += `
    <resource>
      <data encoding="base64">${resource.data}</data>
      <mime>${resource.mime}</mime>
      <resource-attributes>
        <file-name>${escapeXml(resource.filename)}</file-name>
      </resource-attributes>
    </resource>`;
  }
  
  enex += `
  </note>
`;
}

// ENEX footer
enex += `</en-export>
`;

// Write the ENEX file
fs.writeFileSync('penzu-entries.enex', enex, 'utf-8');
console.log(`\n✓ Created penzu-entries.enex with ${entries.length} entries`);
console.log('You can now import this file into Journey or Diarium!');

// Helper functions
function formatEnexDate(date) {
  // Evernote format: YYYYMMDDTHHmmssZ
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMimeType(ext) {
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
  };
  return mimeTypes[ext] || 'image/jpeg';
}
