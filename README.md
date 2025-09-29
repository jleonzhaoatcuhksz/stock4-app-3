# Stock4 App 2.0

A NASDAQ Stock News Viewer application that fetches real-time financial news using Alpha Vantage API.

## Features
- View recent news for top NASDAQ stocks
- Clean, responsive interface
- Real-time data from Alpha Vantage
- Scrolling news panel
- Source attribution for all articles

## Installation
1. Clone this repository
2. Install dependencies: `npm install`
3. Set up your Alpha Vantage API key in `.env`:
   ```
   ALPHAVANTAGE_API_KEY=your_api_key_here
   ```
4. Start the server: `node server.js`

## Usage
1. Access the application at `http://localhost:3015`
2. Select a stock from the dropdown
3. Click "Get Recent News" to view articles

## API Endpoints
- `GET /api/stocks` - List of supported stocks
- `GET /api/news/:symbol` - News for specific stock

## Requirements
- Node.js 16+
- Python 3.8+ (for the scraper fallback)
- Alpha Vantage API key

## Screenshot
![Application Screenshot](./public/screenshot.png)

## License
MIT