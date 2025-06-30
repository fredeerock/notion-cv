# Academic CV from Notion

A simple web application that displays academic CV items from a Notion database, organized by category and year.

## Local Development

1. Your token is already set up in `local.js` (git-ignored)
2. Open `index.html` in your browser
3. Make sure you have a CORS browser extension enabled

**Note**: `local.js` contains your secret token and is ignored by git

## GitHub Pages Deployment

1. Push this repository to GitHub
2. Go to your repository settings
3. Navigate to **Secrets and variables** → **Actions**
4. Add a new repository secret:
   - Name: `NOTION_TOKEN`
   - Value: Your Notion integration token
5. Go to **Settings** → **Pages**
6. Set source to "GitHub Actions"
7. The site will automatically deploy when you push to the main branch

## Notion Database Setup

Your Notion database should have these properties:
- `Name` (title field)
- `Category` (select field)
- `Date` (date field)
- `URL` (URL field - optional)

## Features

- Automatically fetches data from Notion API
- Organizes items by category and year
- Clean, minimal academic CV styling
- Clickable items that link to Notion pages
- Responsive design for mobile devices
