# Academic CV from Notion

A simple web application that displays academic CV items from a Notion database, organized by category and year. Uses pre-fetched JSON data for fast loading.

## Local Development

1. Set up your Notion token in `local.js`:
   ```javascript
   window.NOTION_TOKEN = 'your_notion_token_here';
   ```

2. Fetch your CV data:
   ```bash
   node fetch-notion-data.js
   ```

3. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```

4. Open http://localhost:8000

## GitHub Pages Deployment

1. Push this repository to GitHub
2. Go to your repository settings
3. Navigate to **Secrets and variables** → **Actions**
4. Add a new repository secret:
   - Name: `NOTION_TOKEN`
   - Value: Your Notion integration token
5. Go to **Settings** → **Pages**
6. Set source to "GitHub Actions"
7. The site will automatically deploy and update every 6 hours

## Updating CV Data

**Local Development:**
```bash
node fetch-notion-data.js
```

**Production:**
- Automatically updates every 6 hours
- Manual trigger: Go to GitHub Actions → "Run workflow"
- Push any changes to trigger an update

## Notion Database Setup

Your Notion database should have these properties:
- `Name` (title field)
- `Category` (select field)  
- `Date` (date field)
- `Description` (rich text field - optional)
- `Institution` (rich text field - optional)
- `Location` (rich text field - optional)
- `URL` (URL field - optional)

## Features

- ⚡ Fast loading with pre-fetched JSON data
- 📱 Responsive design for all devices  
- 🎨 Clean academic CV styling
- 🔗 Smart linking (only links to pages with content)
- 📅 Automatic date-based organization
- 🔄 Scheduled updates every 6 hours
- 🖨️ Print-friendly CSS for PDF generation
- 🖼️ **Image support**: Downloads and serves images locally
- 📊 **Table support**: Renders Notion tables with professional styling
- 📄 **Rich content**: Supports headings, lists, images, videos, and tables
- 🎯 **QR code**: Automatically generated for easy sharing
