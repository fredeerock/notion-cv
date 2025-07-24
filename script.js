// Notion CV - Always uses local JSON data for fast loading
const DATABASE_ID = '14fcf2908c698021aa5ee3656ab26d16';

// Generate QR code for custom URL
function generateQRCode() {
    const customUrl = 'https://tiny.cc/derick';
    const qrImage = document.getElementById('qr-image');
    
    if (qrImage) {
        // Using QR Server API (free, reliable service)
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(customUrl)}`;
        qrImage.src = qrUrl;
        qrImage.onerror = function() {
            // Fallback: hide QR code if service is unavailable
            const qrContainer = document.querySelector('.qr-code');
            if (qrContainer) {
                qrContainer.style.display = 'none';
                // Adjust header layout
                const headerContent = document.querySelector('.header-content');
                if (headerContent) {
                    headerContent.style.justifyContent = 'center';
                }
            }
        };
    }
}

class NotionCV {
    constructor() {
        this.cvData = [];
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.renderCV();
            this.setupToggleButton();
        } catch (error) {
            this.showError(error.message);
        }
    }

    async loadData() {
        console.log('📄 Loading CV data from notion-data.json...');
        
        const response = await fetch('./notion-data.json');
        
        if (!response.ok) {
            throw new Error(`Failed to load CV data: ${response.status} ${response.statusText}. Run 'node fetch-notion-data.js' to generate the data file.`);
        }

        this.cvData = await response.json();
        console.log(`✅ Loaded ${this.cvData.length} CV items`);
    }

    getCategoryClass(category) {
        // Detect category hierarchy based on numbering pattern
        const numberPattern = /^(\d+\.)+/;
        const match = category.match(numberPattern);
        
        if (!match) return ''; // No numbering, treat as main category
        
        const numbering = match[0];
        const dots = (numbering.match(/\./g) || []).length;
        
        if (dots === 1) {
            // 1.2, 1.3 - Main categories
            return '';
        } else if (dots === 2) {
            // 1.2.1, 1.3.1 - Subcategories
            return 'subcategory';
        } else if (dots >= 3) {
            // 1.3.1.1 and deeper - Sub-subcategories
            return 'sub-subcategory';
        }
        
        return '';
    }

    organizeData() {
        const organized = {};
        
        this.cvData.forEach(item => {
            const category = item.category || 'Other';
            const year = item.year; // Don't default to 'Unknown'
            
            if (!organized[category]) {
                organized[category] = {};
            }
            
            // Use 'no-date' as internal key for items without dates
            const yearKey = year || 'no-date';
            
            if (!organized[category][yearKey]) {
                organized[category][yearKey] = [];
            }
            
            organized[category][yearKey].push(item);
        });

        return organized;
    }

    renderCV() {
        const container = document.getElementById('cv-content');
        const organizedData = this.organizeData();
        
        // Hide loading message
        const loading = document.querySelector('.loading');
        if (loading) loading.style.display = 'none';
        
        let html = '';
        
        // Sort categories
        const sortedCategories = Object.keys(organizedData).sort();
        
        sortedCategories.forEach(category => {
            html += `<div class="category-section">`;
            
            // Determine category level based on numbering pattern
            const categoryClass = this.getCategoryClass(category);
            html += `<h2 class="category-title ${categoryClass}">${category}</h2>`;
            
            // Sort years within each category (descending, with no-date items first)
            const sortedYears = Object.keys(organizedData[category]).sort((a, b) => {
                if (a === 'no-date') return -1; // Put no-date items at the top
                if (b === 'no-date') return 1;
                return parseInt(b) - parseInt(a);
            });
            
            sortedYears.forEach(year => {
                if (organizedData[category][year].length > 0) {
                    html += `<div class="year-group">`;
                    
                    // Only show year title if there's an actual year
                    if (year !== 'no-date') {
                        html += `<h3 class="year-title">${year}</h3>`;
                    }
                    
                    organizedData[category][year].forEach(item => {
                        html += this.renderItem(item);
                    });
                    
                    html += `</div>`;
                }
            });
            
            html += `</div>`;
        });
        
        container.innerHTML = html || '<div class="error">No CV items found.</div>';
    }

    renderItem(item) {
        let html = `<div class="cv-item">`;
        
        // Combine icon and title
        const displayTitle = item.icon ? `${item.icon} ${item.title}` : item.title;
        
        // Only make it a link if the page has content
        if (item.hasContent) {
            const notionPageUrl = this.generateNotionPageUrl(item.id);
            html += `<h3><a href="${notionPageUrl}" target="_blank">${displayTitle}</a></h3>`;
        } else {
            html += `<h3>${displayTitle}</h3>`;
        }
        
        // Special handling for education items - show location instead of description
        if (item.category === '1.01 Education') {
            // For education items, don't show description, we'll show location in meta instead
        } else {
            // For all other items, show description as normal
            if (item.description) {
                html += `<p class="description">${item.description}</p>`;
            }
        }
        
        let meta = [];
        if (item.institution) meta.push(item.institution);
        
        // For education items, extract location from description and show it in meta
        if (item.category === '1.01 Education' && item.description) {
            // Extract location from description (assuming it's at the beginning before any period or comma)
            const locationMatch = item.description.match(/^([^.]+)/);
            if (locationMatch) {
                const location = locationMatch[1].trim();
                if (location) meta.push(location);
            }
        } else if (item.location) {
            meta.push(item.location);
        }
        
        if (meta.length > 0) {
            html += `<p class="meta">${meta.join(', ')}</p>`;
        }
        
        // Add page content if available
        if (item.pageContent && item.pageContent.trim().length > 0) {
            const processedContent = this.processPageContent(item.pageContent);
            html += `<div class="page-content" data-item-id="${item.id}">${processedContent}</div>`;
        }
        
        html += `</div>`;
        
        return html;
    }

    processPageContent(content) {
        // Convert plain text to HTML with proper line breaks
        let processedContent = content
            .split('\n\n')
            .map(paragraph => {
                // Handle headings
                if (paragraph.startsWith('### ')) {
                    return `<h6>${paragraph.substring(4)}</h6>`;
                } else if (paragraph.startsWith('## ')) {
                    return `<h5>${paragraph.substring(3)}</h5>`;
                } else if (paragraph.startsWith('# ')) {
                    return `<h4>${paragraph.substring(2)}</h4>`;
                }
                // Handle bullet points
                else if (paragraph.startsWith('• ')) {
                    return `<ul><li>${paragraph.substring(2)}</li></ul>`;
                }
                // Handle numbered lists
                else if (paragraph.match(/^\d+\. /)) {
                    return `<ol><li>${paragraph.replace(/^\d+\. /, '')}</li></ol>`;
                }
                // Handle image markers
                else if (paragraph.match(/^\[IMAGE:.*\]$/)) {
                    return this.renderImage(paragraph);
                }
                // Handle video markers
                else if (paragraph.match(/^\[VIDEO:.*\]$/)) {
                    return this.renderVideo(paragraph);
                }
                // Handle table data markers
                else if (paragraph.match(/^\[TABLE_DATA:.*\]$/)) {
                    return this.renderTable(paragraph);
                }
                // Regular paragraphs
                else if (paragraph.trim()) {
                    return `<p>${paragraph}</p>`;
                }
                
                return '';
            })
            .filter(p => p.length > 0)
            .join('');

        // Combine consecutive list items
        processedContent = processedContent
            .replace(/<\/ul>\s*<ul>/g, '')
            .replace(/<\/ol>\s*<ol>/g, '');

        return processedContent;
    }

    renderImage(imageMarker) {
        // Parse [IMAGE:url] or [IMAGE:url:caption] format
        // Handle URLs with multiple colons (like AWS S3 URLs)
        const match = imageMarker.match(/^\[IMAGE:(.+)\]$/);
        if (!match) return '';
        
        const content = match[1];
        
        // Try to split by the last colon to separate URL from caption
        // This handles cases where the URL itself contains colons
        let url, caption = '';
        
        const lastColonIndex = content.lastIndexOf(':');
        if (lastColonIndex > 6 && !content.substring(lastColonIndex + 1).includes('/')) {
            // If there's a colon after position 6 (to account for "https:") 
            // and what follows doesn't contain slashes (likely not part of the URL)
            // then treat it as a caption
            url = content.substring(0, lastColonIndex);
            caption = content.substring(lastColonIndex + 1);
        } else {
            // Otherwise, treat the whole thing as the URL
            url = content;
        }
        
        let html = `<div class="image-container">`;
        html += `<img src="${url}" alt="${caption}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 4px;">`;
        if (caption && caption.trim()) {
            html += `<div class="image-caption">${caption}</div>`;
        }
        html += `</div>`;
        
        return html;
    }

    renderVideo(videoMarker) {
        // Parse [VIDEO:url] or [VIDEO:url:caption] format
        // Handle URLs with multiple colons (like AWS S3 URLs)
        const match = videoMarker.match(/^\[VIDEO:(.+)\]$/);
        if (!match) return '';
        
        const content = match[1];
        
        // Try to split by the last colon to separate URL from caption
        let url, caption = '';
        
        const lastColonIndex = content.lastIndexOf(':');
        if (lastColonIndex > 6 && !content.substring(lastColonIndex + 1).includes('/')) {
            url = content.substring(0, lastColonIndex);
            caption = content.substring(lastColonIndex + 1);
        } else {
            url = content;
        }
        
        let html = `<div class="video-container">`;
        
        // Check if it's a YouTube or Vimeo URL and embed accordingly
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) {
                html += `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="width: 100%; height: 315px; border-radius: 4px;"></iframe>`;
            }
        } else if (url.includes('vimeo.com')) {
            const videoId = this.extractVimeoId(url);
            if (videoId) {
                html += `<iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen style="width: 100%; height: 315px; border-radius: 4px;"></iframe>`;
            }
        } else {
            // For direct video files
            html += `<video controls style="max-width: 100%; height: auto; border-radius: 4px;">`;
            html += `<source src="${url}" type="video/mp4">`;
            html += `Your browser does not support the video tag.`;
            html += `</video>`;
        }
        
        if (caption && caption.trim()) {
            html += `<div class="video-caption">${caption}</div>`;
        }
        html += `</div>`;
        
        return html;
    }

    renderTable(tableMarker) {
        // Parse [TABLE_DATA:json] format
        const match = tableMarker.match(/^\[TABLE_DATA:(.+)\]$/);
        if (!match) return '';
        
        try {
            const tableData = JSON.parse(match[1]);
            if (!tableData.rows || tableData.rows.length === 0) return '';
            
            let html = `<div class="table-container">`;
            html += `<table class="notion-table">`;
            
            // Render table rows
            tableData.rows.forEach((row, rowIndex) => {
                if (rowIndex === 0) {
                    // First row as header
                    html += `<thead><tr>`;
                    row.forEach(cell => {
                        html += `<th>${cell || ''}</th>`;
                    });
                    html += `</tr></thead><tbody>`;
                } else {
                    // Regular data rows
                    html += `<tr>`;
                    row.forEach(cell => {
                        html += `<td>${cell || ''}</td>`;
                    });
                    html += `</tr>`;
                }
            });
            
            html += `</tbody></table>`;
            html += `</div>`;
            
            return html;
        } catch (e) {
            console.error('Error parsing table data:', e);
            return '<div class="table-error">Error displaying table</div>';
        }
    }

    extractYouTubeId(url) {
        // Handle various YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    extractVimeoId(url) {
        // Handle various Vimeo URL formats
        const patterns = [
            /vimeo\.com\/(?:.*\/)?(\d+)/i
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    generateNotionPageUrl(itemId) {
        // Remove dashes from the item ID to match Notion's URL format
        const cleanItemId = itemId.replace(/-/g, '');
        // Base URL pattern from your example
        return `https://dostrenko.notion.site/${DATABASE_ID}?v=6a88992631f7451c8211b63c66f65357&p=${cleanItemId}&pm=c`;
    }

    showError(message) {
        const container = document.getElementById('cv-content');
        const loading = document.querySelector('.loading');
        if (loading) loading.style.display = 'none';
        
        container.innerHTML = `<div class="error">Error loading CV data: ${message}</div>`;
    }

    setupToggleButton() {
        const toggleBtn = document.getElementById('toggle-content');
        if (!toggleBtn) return;

        let isExpanded = false;

        toggleBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            const pageContents = document.querySelectorAll('.page-content');
            const toggleText = toggleBtn.querySelector('.toggle-text');
            
            pageContents.forEach(content => {
                if (isExpanded) {
                    content.classList.add('expanded');
                } else {
                    content.classList.remove('expanded');
                }
            });

            if (isExpanded) {
                toggleText.textContent = 'Hide All Page Contents';
                toggleBtn.classList.add('expanded');
            } else {
                toggleText.textContent = 'Show All Page Contents';
                toggleBtn.classList.remove('expanded');
            }
        });
    }
}

// Initialize the CV when the page loads
document.addEventListener('DOMContentLoaded', () => {
    generateQRCode();
    new NotionCV();
});
