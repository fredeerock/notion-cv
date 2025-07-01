#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

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

function extractDateYear(property) {
  if (!property) return null;
  if (property.type === 'date' && property.date) {
    const dateToUse = property.date.end || property.date.start;
    if (dateToUse) {
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

function extractIcon(item) {
  if (!item.icon) return '';
  if (item.icon.type === 'emoji') {
    return item.icon.emoji;
  }
  return '';
}

async function checkContent(pageId) {
  return new Promise((resolve) => {
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
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const content = JSON.parse(body);
          const hasContent = content.results && content.results.length > 0 && 
            content.results.some(block => {
              const types = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item'];
              return types.some(type => {
                const blockData = block[type];
                return blockData && blockData.rich_text && blockData.rich_text.length > 0 &&
                  blockData.rich_text.some(text => text.plain_text.trim().length > 0);
              });
            });
          resolve(hasContent);
        } catch (e) {
          resolve(false);
        }
      });
    });
    
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function fetchNotionData() {
  console.log('🔄 Fetching data from Notion...');
  
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
    ]
  });

  return new Promise((resolve, reject) => {
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
}

async function processData() {
  try {
    const data = await fetchNotionData();
    console.log(`📝 Processing ${data.results?.length || 0} items...`);
    
    const results = data.results || [];
    const processedItems = [];
    
    for (const item of results) {
      const properties = item.properties;
      
      console.log(`   Checking content for: ${extractText(properties.Name)}`);
      const hasContent = await checkContent(item.id);
      
      const processedItem = {
        id: item.id,
        title: extractText(properties.Name),
        category: extractSelect(properties.Category),
        year: extractDateYear(properties.Date),
        description: extractText(properties.Description),
        institution: extractText(properties.Institution),
        location: extractText(properties.Location),
        url: extractUrl(properties.URL),
        icon: extractIcon(item),
        hasContent: hasContent
      };
      
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
