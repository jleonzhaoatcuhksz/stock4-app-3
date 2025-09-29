#!/usr/bin/env python3
import sys
import json
import re
import urllib.request
import urllib.parse
from datetime import datetime
from bs4 import BeautifulSoup

def scrape_stock_news(symbol):
    """
    Fetch real financial news for a given stock symbol using Alpha Vantage API
    Returns a list of news items with title, source, url, and date
    """
    # Validate input
    if not symbol or not re.match(r'^[A-Z]{1,5}$', symbol):
        return json.dumps({"error": "Invalid stock symbol"})
    
    try:
        # Alpha Vantage API endpoint
        api_key = "LCH793C5NT8GWIB0"  # User-provided API key
        url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={symbol}&apikey={api_key}"
        
        # Set headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Create request with headers
        req = urllib.request.Request(url, headers=headers)
        
        # Fetch the data
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        # Check for API errors
        if "Error Message" in data:
            return json.dumps({"error": data["Error Message"]})
        if "Note" in data:  # Rate limit message
            return json.dumps({"error": data["Note"]})
        if "feed" not in data:
            return json.dumps({"error": "No news found in API response"})
        
        # Process the news feed
        news = []
        for item in data["feed"][:10]:  # Limit to 10 news items
            try:
                # Extract relevant information
                title = item.get("title", "")
                source = item.get("source", "Unknown Source")
                url = item.get("url", "")
                
                # Format date (convert from ISO format if available)
                date = item.get("time_published", "")
                if date:
                    try:
                        # Convert from YYYYMMDDTHHMMSS to ISO format
                        dt = datetime.strptime(date, "%Y%m%dT%H%M%S")
                        date = dt.isoformat()
                    except:
                        date = datetime.now().isoformat()
                else:
                    date = datetime.now().isoformat()
                
                # Only add if we have at least a title and URL
                if title and url:
                    news.append({
                        "title": title,
                        "source": source,
                        "url": url,
                        "date": date
                    })
            except Exception as e:
                print(f"Error processing news item: {e}", file=sys.stderr)
                continue
        
        if not news:
            return json.dumps({"error": "No valid news items found"})
        
        return json.dumps(news)
    
    except urllib.error.HTTPError as e:
        return json.dumps({"error": f"HTTP Error {e.code}: {e.reason}"})
    except urllib.error.URLError as e:
        return json.dumps({"error": f"URL Error: {e.reason}"})
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    # Check if a symbol was provided
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No stock symbol provided"}))
        sys.exit(1)
    
    # Get the symbol from command line arguments
    symbol = sys.argv[1].upper()
    
    # Scrape and print results
    print(scrape_stock_news(symbol))