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
    
    // Process table markers and fetch table data
    const processedContent = [];
    for (const item of contentText) {
      if (item.startsWith('[TABLE:') && item.endsWith(']')) {
        const tableId = item.substring(7, item.length - 1);
        const tableData = await fetchTableData(tableId);
        if (tableData) {
          processedContent.push(`[TABLE_DATA:${tableData}]`);
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
      const contentResult = await checkContent(item.id);
      
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
        hasContent: contentResult.hasContent,
        pageContent: contentResult.content
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
