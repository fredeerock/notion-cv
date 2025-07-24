#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

// Get token from environment variable or local.js
let NOTION_TOKEN;
try {
  // Try to load from local.js first
  if (fs.existsSync('./local.js')) {
    const localContent = fs.readFileSync('./local.js', 'utf8');
    const tokenMatch = localContent.match(/window\.NOTION_TOKEN\s*=\s*['"`]([^'"`]+)['"`]/);
    if (tokenMatch) {
      NOTION_TOKEN = tokenMatch[1];
    }
  }
  
  // Fall back to environment variable
  if (!NOTION_TOKEN) {
    NOTION_TOKEN = process.env.NOTION_TOKEN;
  }
} catch (error) {
  console.warn('Could not load token from local.js:', error.message);
  NOTION_TOKEN = process.env.NOTION_TOKEN;
}

const DATABASE_ID = '14fcf2908c698021aa5ee3656ab26d16';

if (!NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not found. Please set it in local.js or as an environment variable.');
  process.exit(1);
}

function extractText(property) {
  if (!property) return '';
  if (property.type === 'title' && property.title) {
    return property.title.map(text => text.plain_text).join('');
  }
  if (property.type === 'rich_text' && property.rich_text) {
    return property.rich_text.map(text => text.plain_text).join('');
  }
  return '';
}

function extractSelect(property) {
  if (!property || property.type !== 'select') return '';
  return property.select ? property.select.name : '';
}

function extractMultiSelect(property) {
  if (!property || property.type !== 'multi_select') return [];
  return property.multi_select ? property.multi_select.map(item => item.name) : [];
}

function extractDateYear(property) {
  if (!property) return null;
  if (property.type === 'date' && property.date) {
    // Use end date for year extraction if available, otherwise use start date
    const dateToUse = property.date.end || property.date.start;
    if (dateToUse) {
      // Parse the date string directly to avoid timezone issues
      // Notion dates are in YYYY-MM-DD format
      const yearMatch = dateToUse.match(/^(\d{4})-/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        return isNaN(year) ? null : year;
      }
      
      // Fallback to Date parsing if regex fails
      const year = new Date(dateToUse).getFullYear();
      return isNaN(year) ? null : year;
    }
  }
  return null;
}

function extractUrl(property) {
  if (!property || property.type !== 'url') return '';
  return property.url || '';
}

function extractNumber(property) {
  if (!property || property.type !== 'number') return null;
  return property.number;
}

function extractCheckbox(property) {
  if (!property || property.type !== 'checkbox') return false;
  return property.checkbox;
}

function extractPeople(property) {
  if (!property || property.type !== 'people') return [];
  return property.people ? property.people.map(person => person.name || person.id) : [];
}

function extractFiles(property) {
  if (!property || property.type !== 'files') return [];
  return property.files ? property.files.map(file => file.name || file.file?.url || file.external?.url).filter(Boolean) : [];
}

function extractEmail(property) {
  if (!property || property.type !== 'email') return '';
  return property.email || '';
}

function extractPhoneNumber(property) {
  if (!property || property.type !== 'phone_number') return '';
  return property.phone_number || '';
}

function extractFormula(property) {
  if (!property || property.type !== 'formula') return null;
  const result = property.formula;
  if (!result) return null;
  
  // Extract value based on formula result type
  if (result.type === 'string') return result.string;
  if (result.type === 'number') return result.number;
  if (result.type === 'boolean') return result.boolean;
  if (result.type === 'date' && result.date) return result.date.start;
  return null;
}

function extractRollup(property) {
  if (!property || property.type !== 'rollup') return null;
  const result = property.rollup;
  if (!result) return null;
  
  // Extract value based on rollup result type
  if (result.type === 'number') return result.number;
  if (result.type === 'array') return result.array?.map(item => extractPropertyValue(item)) || [];
  return null;
}

function extractCreatedTime(property) {
  if (!property || property.type !== 'created_time') return null;
  return property.created_time;
}

function extractLastEditedTime(property) {
  if (!property || property.type !== 'last_edited_time') return null;
  return property.last_edited_time;
}

function extractCreatedBy(property) {
  if (!property || property.type !== 'created_by') return '';
  return property.created_by?.name || property.created_by?.id || '';
}

function extractLastEditedBy(property) {
  if (!property || property.type !== 'last_edited_by') return '';
  return property.last_edited_by?.name || property.last_edited_by?.id || '';
}

function extractPropertyValue(property) {
  if (!property || !property.type) return null;
  
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return extractText(property);
    case 'select':
      return extractSelect(property);
    case 'multi_select':
      return extractMultiSelect(property);
    case 'date':
      return extractDateYear(property);
    case 'url':
      return extractUrl(property);
    case 'number':
      return extractNumber(property);
    case 'checkbox':
      return extractCheckbox(property);
    case 'people':
      return extractPeople(property);
    case 'files':
      return extractFiles(property);
    case 'email':
      return extractEmail(property);
    case 'phone_number':
      return extractPhoneNumber(property);
    case 'formula':
      return extractFormula(property);
    case 'rollup':
      return extractRollup(property);
    case 'created_time':
      return extractCreatedTime(property);
    case 'last_edited_time':
      return extractLastEditedTime(property);
    case 'created_by':
      return extractCreatedBy(property);
    case 'last_edited_by':
      return extractLastEditedBy(property);
    default:
      console.warn(`   Unknown property type: ${property.type}`);
      return null;
  }
}

function extractIcon(item) {
  if (!item.icon) return '';
  if (item.icon.type === 'emoji') {
    return item.icon.emoji;
  }
  return '';
}

async function checkContent(pageId) {
  try {
    const options = {
      hostname: 'api.notion.com',
      path: `/v1/blocks/${pageId}/children`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    };
    
    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const content = JSON.parse(body);
            resolve(content);
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
    
    if (!response.results || response.results.length === 0) {
      return { hasContent: false, content: '' };
    }
    
    // Extract text content from blocks
    const contentText = response.results.map(block => {
      if (block.type === 'paragraph' && block.paragraph?.rich_text?.length > 0) {
        return block.paragraph.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'heading_1' && block.heading_1?.rich_text?.length > 0) {
        return '# ' + block.heading_1.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'heading_2' && block.heading_2?.rich_text?.length > 0) {
        return '## ' + block.heading_2.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'heading_3' && block.heading_3?.rich_text?.length > 0) {
        return '### ' + block.heading_3.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text?.length > 0) {
        return '• ' + block.bulleted_list_item.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text?.length > 0) {
        return '1. ' + block.numbered_list_item.rich_text.map(text => text.plain_text).join('');
      }
      if (block.type === 'image') {
        // Handle different image sources
        let imageUrl = '';
        let caption = '';
        
        if (block.image.type === 'file' && block.image.file?.url) {
          imageUrl = block.image.file.url;
        } else if (block.image.type === 'external' && block.image.external?.url) {
          imageUrl = block.image.external.url;
        }
        
        if (block.image.caption && block.image.caption.length > 0) {
          caption = block.image.caption.map(text => text.plain_text).join('');
        }
        
        if (imageUrl) {
          return `[IMAGE:${imageUrl}${caption ? ':' + caption : ''}]`;
        }
      }
      if (block.type === 'video') {
        // Handle video blocks similarly
        let videoUrl = '';
        let caption = '';
        
        if (block.video.type === 'file' && block.video.file?.url) {
          videoUrl = block.video.file.url;
        } else if (block.video.type === 'external' && block.video.external?.url) {
          videoUrl = block.video.external.url;
        }
        
        if (block.video.caption && block.video.caption.length > 0) {
          caption = block.video.caption.map(text => text.plain_text).join('');
        }
        
        if (videoUrl) {
          return `[VIDEO:${videoUrl}${caption ? ':' + caption : ''}]`;
        }
      }
      if (block.type === 'table') {
        // Tables need special handling - we'll fetch their children rows
        return `[TABLE:${block.id}]`;
      }
      return '';
    }).filter(text => text.trim().length > 0);
    
    // Process table markers and fetch table data, download images
    const processedContent = [];
    for (const item of contentText) {
      if (item.startsWith('[TABLE:') && item.endsWith(']')) {
        const tableId = item.substring(7, item.length - 1);
        const tableData = await fetchTableData(tableId);
        if (tableData) {
          processedContent.push(`[TABLE_DATA:${tableData}]`);
        }
      } else if (item.startsWith('[IMAGE:')) {
        // Process image downloads - handle URLs with multiple colons
        const imageMatch = item.match(/^\[IMAGE:(.+)\]$/);
        if (imageMatch) {
          const content = imageMatch[1];
          
          // Try to split by the last colon to separate URL from caption
          let originalUrl, caption = '';
          
          const lastColonIndex = content.lastIndexOf(':');
          if (lastColonIndex > 6 && !content.substring(lastColonIndex + 1).includes('/')) {
            // If there's a colon after position 6 (to account for "https:") 
            // and what follows doesn't contain slashes (likely not part of the URL)
            // then treat it as a caption
            originalUrl = content.substring(0, lastColonIndex);
            caption = content.substring(lastColonIndex + 1);
          } else {
            // Otherwise, treat the whole thing as the URL
            originalUrl = content;
          }
          
          try {
            const localPath = await downloadImage(originalUrl);
            processedContent.push(`[IMAGE:${localPath}${caption ? ':' + caption : ''}]`);
          } catch (error) {
            console.warn(`   Failed to download image, using original URL: ${error.message}`);
            processedContent.push(item); // Keep original if download fails
          }
        } else {
          processedContent.push(item);
        }
      } else {
        processedContent.push(item);
      }
    }
    
    const hasContent = processedContent.length > 0;
    const contentString = processedContent.join('\n\n');
    
    return { hasContent, content: contentString };
  } catch (e) {
    return { hasContent: false, content: '' };
  }
}

async function downloadImage(imageUrl) {
  try {
    // Extract the stable part of the URL (before query parameters) for hashing
    const url = new URL(imageUrl);
    const stableUrl = url.origin + url.pathname;
    const hash = crypto.createHash('md5').update(stableUrl).digest('hex');
    
    // Try to determine file extension from URL
    let extension = '.png'; // default
    const match = url.pathname.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    if (match) {
      extension = '.' + match[1].toLowerCase();
    }
    
    const filename = `${hash}${extension}`;
    const localPath = path.join('./images', filename);
    
    // Check if file already exists
    if (fs.existsSync(localPath)) {
      console.log(`   Image already exists: ${filename}`);
      return `./images/${filename}`;
    }
    
    console.log(`   Downloading image: ${filename}`);
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      
      https.get(imageUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(`./images/${filename}`);
        });
        
        file.on('error', (err) => {
          fs.unlink(localPath, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.warn(`   Failed to download image: ${error.message}`);
    return imageUrl; // Fallback to original URL
  }
}

async function fetchTableData(tableId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.notion.com',
      path: `/v1/blocks/${tableId}/children`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const content = JSON.parse(body);
          
          if (!content.results || content.results.length === 0) {
            resolve('');
            return;
          }
          
          // Extract table rows
          const rows = content.results
            .filter(block => block.type === 'table_row')
            .map(block => {
              if (block.table_row && block.table_row.cells) {
                return block.table_row.cells.map(cell => {
                  return cell.map(text => text.plain_text).join('');
                });
              }
              return [];
            });
          
          if (rows.length === 0) {
            resolve('');
            return;
          }
          
          // Format as table data
          const tableData = {
            rows: rows
          };
          
          resolve(JSON.stringify(tableData));
        } catch (e) {
          resolve('');
        }
      });
    });
    
    req.on('error', () => resolve(''));
    req.end();
  });
}

async function fetchNotionData() {
  console.log('🔄 Fetching data from Notion...');
  
  let allResults = [];
  let hasMore = true;
  let nextCursor = undefined;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    console.log(`   Fetching page ${pageCount}...`);
    
    const postData = JSON.stringify({
      sorts: [
        {
          property: 'Category',
          direction: 'ascending'
        },
        {
          property: 'Date',
          direction: 'descending'
        }
      ],
      ...(nextCursor && { start_cursor: nextCursor })
    });

    const pageData = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.notion.com',
        path: `/v1/databases/${DATABASE_ID}/query`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data.message || body}`));
              return;
            }
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    allResults = allResults.concat(pageData.results || []);
    hasMore = pageData.has_more;
    nextCursor = pageData.next_cursor;
    
    console.log(`   Got ${pageData.results?.length || 0} items from page ${pageCount}`);
  }

  console.log(`📄 Total pages fetched: ${pageCount}`);
  console.log(`📊 Total items retrieved: ${allResults.length}`);
  
  return { results: allResults };
}

async function processData() {
  try {
    // Ensure images directory exists
    const imagesDir = './images';
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
      console.log('📁 Created images directory');
    }
    
    const data = await fetchNotionData();
    console.log(`📝 Processing ${data.results?.length || 0} items...`);
    
    const results = data.results || [];
    const processedItems = [];
    
    for (const item of results) {
      const properties = item.properties;
      
      console.log(`   Checking content for: ${extractText(properties.Name)}`);
      const contentResult = await checkContent(item.id);
      
      // Start with base properties
      const processedItem = {
        id: item.id,
        title: extractText(properties.Name),
        icon: extractIcon(item),
        hasContent: contentResult.hasContent,
        pageContent: contentResult.content
      };
      
      // Dynamically extract all other properties
      Object.keys(properties).forEach(propertyName => {
        // Skip Name property (already handled as title)
        if (propertyName === 'Name') return;
        
        const property = properties[propertyName];
        const value = extractPropertyValue(property);
        
        // Only add properties with non-empty values
        if (value !== null && value !== undefined && value !== '' && 
            !(Array.isArray(value) && value.length === 0)) {
          
          // Convert property name to camelCase for consistency
          const camelCaseName = propertyName.charAt(0).toLowerCase() + 
            propertyName.slice(1).replace(/\s+(.)/g, (match, char) => char.toUpperCase());
          
          // Handle special cases for better naming
          if (propertyName === 'Category') {
            // For multi-select Category, join with commas or use first value
            processedItem.category = Array.isArray(value) ? value.join(', ') : value;
          } else if (propertyName === 'Date') {
            // For Date properties, extract year
            processedItem.year = value;
          } else {
            // Use camelCase name for all other properties
            processedItem[camelCaseName] = value;
          }
        }
      });
      
      // Ensure we have a category fallback
      if (!processedItem.category) {
        processedItem.category = 'Other';
      }
      
      if (processedItem.title) {
        processedItems.push(processedItem);
      }
    }
    
    fs.writeFileSync('notion-data.json', JSON.stringify(processedItems, null, 2));
    console.log(`✅ Successfully processed ${processedItems.length} items and saved to notion-data.json`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

processData();
