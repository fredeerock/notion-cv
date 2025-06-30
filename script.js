// Notion API configuration
// For local development: token will be injected by build process
// For GitHub Pages: token will be injected by GitHub Actions
const NOTION_TOKEN = window.NOTION_TOKEN || 'TOKEN_WILL_BE_INJECTED';
const DATABASE_ID = '14fcf2908c698021aa5ee3656ab26d16';

class NotionCV {
    constructor() {
        this.cvData = [];
        this.init();
    }

    async init() {
        try {
            await this.fetchData();
            this.renderCV();
        } catch (error) {
            this.showError(error.message);
        }
    }

    async fetchData() {
        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
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
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.results) {
            throw new Error('No results found in Notion response');
        }
        
        this.cvData = this.processData(data.results);
    }

    processData(results) {
        if (!Array.isArray(results)) {
            console.error('Results is not an array:', results);
            return [];
        }
        
        return results.map(item => {
            const properties = item.properties;
            
            return {
                id: item.id,
                title: this.extractText(properties.Name),
                category: this.extractSelect(properties.Category),
                year: this.extractDateYear(properties.Date),
                description: this.extractText(properties.Description),
                institution: this.extractText(properties.Institution),
                location: this.extractText(properties.Location),
                url: this.extractUrl(properties.URL),
                icon: this.extractIcon(item)
            };
        }).filter(item => item.title); // Filter out items without titles
    }

    extractText(property) {
        if (!property) return '';
        
        if (property.type === 'title' && property.title) {
            return property.title.map(text => text.plain_text).join('');
        }
        if (property.type === 'rich_text' && property.rich_text) {
            return property.rich_text.map(text => text.plain_text).join('');
        }
        return '';
    }

    extractSelect(property) {
        if (!property || property.type !== 'select') return '';
        return property.select ? property.select.name : '';
    }

    extractNumber(property) {
        if (!property || property.type !== 'number') return null;
        return property.number;
    }

    extractDateYear(property) {
        if (!property) return null;
        
        if (property.type === 'date' && property.date) {
            // If there's an end date, use that; otherwise use start date
            const dateToUse = property.date.end || property.date.start;
            
            if (dateToUse) {
                const year = new Date(dateToUse).getFullYear();
                return isNaN(year) ? null : year;
            }
        }
        
        return null;
    }

    extractUrl(property) {
        if (!property || property.type !== 'url') return '';
        return property.url || '';
    }

    extractIcon(item) {
        if (!item.icon) return '';
        
        if (item.icon.type === 'emoji') {
            return item.icon.emoji;
        }
        
        // Could also handle file icons if needed
        // if (item.icon.type === 'file') {
        //     return item.icon.file.url;
        // }
        
        return '';
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
        
        // Generate Notion public page URL
        const notionPageUrl = this.generateNotionPageUrl(item.id);
        
        // Combine icon and title
        const displayTitle = item.icon ? `${item.icon} ${item.title}` : item.title;
        html += `<h3><a href="${notionPageUrl}" target="_blank">${displayTitle}</a></h3>`;
        
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
