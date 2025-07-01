// Notion CV - Always uses local JSON data for fast loading
const DATABASE_ID = '14fcf2908c698021aa5ee3656ab26d16';

class NotionCV {
    constructor() {
        this.cvData = [];
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.renderCV();
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
        
        if (item.description) {
            html += `<p>${item.description}</p>`;
        }
        
        let meta = [];
        if (item.institution) meta.push(item.institution);
        if (item.location) meta.push(item.location);
        
        if (meta.length > 0) {
            html += `<p class="meta">${meta.join(', ')}</p>`;
        }
        
        html += `</div>`;
        
        return html;
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
}

// Initialize the CV when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NotionCV();
});
