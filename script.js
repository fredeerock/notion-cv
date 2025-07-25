// Notion CV - Always uses local JSON data for fast loading
const DATABASE_ID = '14fcf2908c698021aa5ee3656ab26d16';

// Date processing functions for client-side processing
function extractDateYear(dateProperty) {
    if (!dateProperty) return null;
    
    // Handle different date property formats
    let endDate = null;
    let startDate = null;
    
    if (dateProperty.date) {
        endDate = dateProperty.date.end;
        startDate = dateProperty.date.start;
    }
    
    if (endDate) {
        // Use end date for organization if it exists
        const endYear = endDate.split('-')[0];
        return parseInt(endYear);
    } else if (startDate) {
        // Use start date if no end date
        const startYear = startDate.split('-')[0];
        return parseInt(startYear);
    }
    
    return null;
}

function extractDateRange(dateProperty, statusProperty) {
    if (!dateProperty) return null;
    
    let startDate = null;
    let endDate = null;
    
    if (dateProperty.date) {
        startDate = dateProperty.date.start;
        endDate = dateProperty.date.end;
    }
    
    if (!startDate) return null;
    
    const startYear = parseInt(startDate.split('-')[0]);
    
    if (endDate) {
        const endYear = parseInt(endDate.split('-')[0]);
        // Don't show range if same year
        if (startYear === endYear) return null;
        return `${startYear} - ${endYear}`;
    } else {
        // Check if this is an ongoing item based on status
        let isOngoing = false;
        if (statusProperty && statusProperty.select && statusProperty.select.name) {
            const status = statusProperty.select.name.toLowerCase();
            isOngoing = status.includes('current') || status.includes('in-progress') || status.includes('ongoing');
        }
        
        if (isOngoing) {
            return `${startYear} - Present`;
        }
        
        // For non-ongoing items with no end date, don't show date range
        return null;
    }
}

// Currency formatting function
function formatCurrency(value) {
    // Convert to number if it's a string
    const num = typeof value === 'string' ? parseFloat(value.replace(/[,$]/g, '')) : value;
    
    // Check if it's a valid number
    if (isNaN(num)) return value;
    
    // Format as currency with commas and dollar sign
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// Format comma-separated values with proper spacing
function formatCommaSeparated(value) {
    // Handle arrays by joining them with proper comma spacing
    if (Array.isArray(value)) {
        return value.join(', ');
    }
    
    // Handle strings by splitting, trimming, and rejoining
    if (typeof value !== 'string') return value;
    
    // Split by comma, trim whitespace, and rejoin with proper spacing
    return value.split(',').map(item => item.trim()).join(', ');
}

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

// Function to sort semesters chronologically
function sortSemesters(a, b) {
    // Parse semester strings like "2022 Spring", "2025 Summer", etc.
    const parseSemester = (semesterStr) => {
        if (!semesterStr) return { year: 0, season: 0 };
        
        const parts = semesterStr.split(' ');
        const year = parseInt(parts[0]) || 0;
        const season = parts[1] || '';
        
        // Define season order: Spring, Summer, Fall
        const seasonOrder = { 'Spring': 1, 'Summer': 2, 'Fall': 3 };
        
        return {
            year: year,
            season: seasonOrder[season] || 0
        };
    };
    
    const semA = parseSemester(a);
    const semB = parseSemester(b);
    
    // Sort by year first (descending), then by season (descending within year)
    if (semA.year !== semB.year) {
        return semB.year - semA.year;
    }
    return semB.season - semA.season;
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
            this.setupFilterButton();
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
            const categories = item.category ? item.category.split(',').map(cat => cat.trim()) : ['Other'];
            
            // Process date year on client-side from raw date property
            let year = null;
            if (item.dateProperty) {
                year = extractDateYear(item.dateProperty);
            }
            
            // Generate date range for display if we have raw properties
            if (item.dateProperty && !item.dateRange) {
                const dateRange = extractDateRange(item.dateProperty, item.statusProperty);
                if (dateRange) {
                    item.dateRange = dateRange;
                }
            }
            
            // Add item to each category it belongs to
            categories.forEach(category => {
                if (!organized[category]) {
                    organized[category] = {};
                }
                
                // Special handling for teaching history - organize by semester instead of year
                if (category === "2.01 Teaching History & Student Evaluations" && item.semester) {
                    const semesterKey = item.semester;
                    
                    if (!organized[category][semesterKey]) {
                        organized[category][semesterKey] = [];
                    }
                    
                    organized[category][semesterKey].push(item);
                } else {
                    // Default behavior - organize by year
                    const yearKey = year || 'no-date';
                    
                    if (!organized[category][yearKey]) {
                        organized[category][yearKey] = [];
                    }
                    
                    organized[category][yearKey].push(item);
                }
            });
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
            
            // Sort years/semesters within each category
            let sortedKeys;
            if (category === "2.01 Teaching History & Student Evaluations") {
                // Sort semesters chronologically for teaching history
                sortedKeys = Object.keys(organizedData[category]).sort(sortSemesters);
            } else {
                // Default sorting by year (descending, with no-date items first)
                sortedKeys = Object.keys(organizedData[category]).sort((a, b) => {
                    if (a === 'no-date') return -1; // Put no-date items at the top
                    if (b === 'no-date') return 1;
                    return parseInt(b) - parseInt(a);
                });
            }
            
            sortedKeys.forEach(key => {
                if (organizedData[category][key].length > 0) {
                    html += `<div class="year-group">`;
                    
                    // Only show year/semester title if there's an actual key (not 'no-date')
                    if (key !== 'no-date') {
                        html += `<h3 class="year-title">${key}</h3>`;
                    }
                    
                    organizedData[category][key].forEach(item => {
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
        // Determine if item has page content
        const hasPageContent = item.pageContent && item.pageContent.trim().length > 0;
        
        let html = `<div class="cv-item" data-has-content="${hasPageContent}">`;
        
        // Combine icon and title
        const displayTitle = item.icon ? `${item.icon} ${item.title}` : item.title;
        
        // Only make it a link if the page has content
        if (item.hasContent) {
            const notionPageUrl = this.generateNotionPageUrl(item.id);
            html += `<h3><a href="${notionPageUrl}" target="_blank">${displayTitle}</a></h3>`;
        } else {
            html += `<h3>${displayTitle}</h3>`;
        }
        
        // Show all non-empty properties dynamically
        let properties = [];
        let description = '';
        
        // Define properties to skip (internal/display properties or already shown)
        const skipProperties = ['id', 'title', 'icon', 'hasContent', 'pageContent', 'category', 'showLocation?', 'show Location?', 'showPageContents', 'relatedItem', 'dateProperty', 'statusProperty', 'files&Media', 'files & media'];
        
        // Check all properties in the item and add non-empty ones
        Object.keys(item).forEach(key => {
            if (!skipProperties.includes(key)) {
                const value = item[key];
                // Check if value exists and is not empty (handles strings, numbers, booleans)
                if (value !== null && value !== undefined && value !== '' && 
                    !(Array.isArray(value) && value.length === 0)) {
                    
                    // Handle description specially - no label
                    if (key === 'description') {
                        description = value;
                    } else if (key === 'dateRange') {
                        // Show date range without label, like description
                        if (!description) {
                            description = value;
                        } else {
                            description = `${value}. ${description}`;
                        }
                    } else if (key === 'location') {
                        // Only show location if showLocation? checkbox is true
                        if (item['showLocation?'] === true) {
                            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1)
                                .replace(/([A-Z])/g, ' $1').trim();
                            const formattedValue = formatCommaSeparated(value);
                            properties.push(`<strong>${formattedKey}:</strong> ${formattedValue}`);
                        }
                    } else {
                        // Format the property name (capitalize first letter, handle camelCase)
                        const formattedKey = key.charAt(0).toUpperCase() + key.slice(1)
                            .replace(/([A-Z])/g, ' $1').trim();
                        
                        // Handle URLs specially
                        if (key.toLowerCase().includes('url') && typeof value === 'string' && value.trim()) {
                            const formattedValue = formatCommaSeparated(value);
                            properties.push(`<strong>${formattedKey}:</strong> <a href="${value}" target="_blank">${formattedValue}</a>`);
                        } else if (key.toLowerCase().includes('grant amount') || key === 'grantAmount') {
                            // Format currency for Grant Amount
                            const formattedValue = formatCurrency(value);
                            properties.push(`<strong>${formattedKey}:</strong> ${formattedValue}`);
                        } else {
                            // Format comma-separated values and regular properties
                            const formattedValue = formatCommaSeparated(value);
                            properties.push(`<strong>${formattedKey}:</strong> ${formattedValue}`);
                        }
                    }
                }
            }
        });
        
        // Display description first (without label)
        if (description) {
            html += `<p class="description">${description}</p>`;
        }
        
        // Display other properties
        if (properties.length > 0) {
            html += `<div class="properties">`;
            html += `<p class="property-line">${properties.join(' • ')}</p>`;
            html += `</div>`;
        }
        
        // Add page content if available
        if (item.pageContent && item.pageContent.trim().length > 0) {
            const processedContent = this.processPageContent(item.pageContent);
            // Check if this item should always show content (showPageContents checkbox)
            const alwaysShow = item.showPageContents === true;
            const showContentClass = alwaysShow ? 'page-content always-show' : 'page-content';
            html += `<div class="${showContentClass}" data-item-id="${item.id}" data-always-show="${alwaysShow}">${processedContent}</div>`;
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
                // Check if this content should always be shown
                const alwaysShow = content.getAttribute('data-always-show') === 'true';
                
                if (alwaysShow) {
                    // Always keep expanded if marked to always show
                    content.classList.add('expanded');
                } else {
                    // Normal toggle behavior for other items
                    if (isExpanded) {
                        content.classList.add('expanded');
                    } else {
                        content.classList.remove('expanded');
                    }
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
        
        // Initialize: Show content for items marked as always-show
        this.initializeAlwaysShowContent();
    }

    setupFilterButton() {
        const filterBtn = document.getElementById('filter-with-content');
        if (!filterBtn) return;

        let isFiltered = false;

        filterBtn.addEventListener('click', () => {
            isFiltered = !isFiltered;
            const allItems = document.querySelectorAll('.cv-item');
            const allYearGroups = document.querySelectorAll('.year-group');
            const allCategorySections = document.querySelectorAll('.category-section');
            const filterText = filterBtn.querySelector('.toggle-text');
            
            if (isFiltered) {
                // Show only items with content
                allItems.forEach(item => {
                    const hasContent = item.getAttribute('data-has-content') === 'true';
                    item.style.display = hasContent ? 'block' : 'none';
                });
                
                // Hide empty year groups
                allYearGroups.forEach(yearGroup => {
                    const visibleItems = yearGroup.querySelectorAll('.cv-item[style*="block"], .cv-item:not([style*="none"])');
                    yearGroup.style.display = visibleItems.length > 0 ? 'block' : 'none';
                });
                
                // Hide empty category sections
                allCategorySections.forEach(categorySection => {
                    const visibleYearGroups = categorySection.querySelectorAll('.year-group[style*="block"], .year-group:not([style*="none"])');
                    categorySection.style.display = visibleYearGroups.length > 0 ? 'block' : 'none';
                });
                
                filterText.textContent = 'Show All Items';
                filterBtn.classList.add('filtered');
            } else {
                // Show all items, year groups, and category sections
                allItems.forEach(item => {
                    item.style.display = 'block';
                });
                allYearGroups.forEach(yearGroup => {
                    yearGroup.style.display = 'block';
                });
                allCategorySections.forEach(categorySection => {
                    categorySection.style.display = 'block';
                });
                filterText.textContent = 'Show Only Items With Content';
                filterBtn.classList.remove('filtered');
            }
        });
    }
    
    initializeAlwaysShowContent() {
        const alwaysShowContents = document.querySelectorAll('.page-content[data-always-show="true"]');
        alwaysShowContents.forEach(content => {
            content.classList.add('expanded');
        });
    }
}

// Initialize the CV when the page loads
document.addEventListener('DOMContentLoaded', () => {
    generateQRCode();
    new NotionCV();
});
