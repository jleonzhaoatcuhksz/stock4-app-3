const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

const app = express();
app.use(cors());
app.use(express.static('public'));

// Top 20 NASDAQ stocks by market cap
const NASDAQ_STOCKS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL',
  'META', 'TSLA', 'AVGO', 'PEP', 'COST',
  'CSCO', 'ADBE', 'INTC', 'CMCSA', 'AMD',
  'TXN', 'QCOM', 'AMGN', 'HON', 'INTU'
];

// Scrape endpoint
app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    if (!NASDAQ_STOCKS.includes(symbol)) {
      return res.status(400).json({ error: 'Invalid NASDAQ symbol' });
    }

    // Use Python scraper to get news data
    const pythonPath = `"${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe"`;
    const pythonProcess = exec(`${pythonPath} scraper.py ${symbol}`, 
      { cwd: __dirname, timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Python error: ${stderr}`);
          return res.status(500).json({ error: 'Scraping failed', details: stderr });
        }
        
        try {
          const news = JSON.parse(stdout);
          if (Array.isArray(news) && news.length === 0) {
            return res.status(404).json({ error: 'No news found' });
          } else if (news.error) {
            return res.status(500).json({ error: news.error });
          }

          // Add sentiment analysis to each news item
          // Enhanced sentiment scoring with more keywords
          const customWords = {
            // Strong positive terms (score 3-5)
            'beating': 4, 'surge': 4, 'plunge': -4, 'rally': 3, 'boom': 4, 'soar': 4,
            'breakthrough': 4, 'skyrocket': 5, 'explode': 4, 'dominance': 3,
            'revolution': 4, 'game-changer': 4, 'unstoppable': 4, 'phenomenal': 4,
            
            // Moderate positive terms (score 2)
            'comeback': 2, 'growth': 2, 'profit': 2, 'gain': 2, 'rise': 2, 
            'record': 2, 'innovation': 2, 'leader': 2, 'momentum': 2, 'upside': 2,
            'potential': 2, 'opportunity': 2, 'advantage': 2, 'strengthen': 2,
            
            // Financial fundamentals (score 1-2)
            'dividend': 2, 'yield': 1, 'premium': 1, 'valuation': 1, 'earnings': 2,
            'revenue': 2, 'margin': 2, 'ROI': 2, 'P/E': 1, 'cashflow': 2,
            'balance sheet': 1, 'liquidity': 1, 'solvency': 1, 'efficiency': 1,
            
            // Strong negative terms (score -3 to -5)
            'crash': -4, 'collapse': -5, 'meltdown': -4, 'disaster': -4,
            'catastrophe': -5, 'doomed': -4, 'failure': -3, 'bankruptcy': -5,
            
            // Moderate negative terms (score -1 to -2)  
            'drop': -2, 'fall': -2, 'loss': -2, 'decline': -2, 'slump': -2,
            'dip': -1, 'volatile': -2, 'risk': -2, 'warning': -2, 'cut': -2,
            'reduce': -1, 'short': -3, 'overvalued': -2, 'weakness': -2,
            'threat': -2, 'concern': -1, 'challenge': -1, 'pressure': -1,
            
            // Market sentiment indicators
            'bullish': 3, 'bearish': -3, 'neutral': 0, 'buy': 4, 'sell': -4,
            'hold': 0, 'outperform': 3, 'underperform': -3, 'upgrade': 3,
            'downgrade': -3, 'recommend': 2, 'avoid': -3, 'overweight': 2,
            'underweight': -2, 'target': 1, 'accumulate': 2, 'reduce': -2,
            
            // Technical analysis terms
            'support': 1, 'resistance': -1, 'breakout': 2, 'breakdown': -2,
            'trend': 1, 'reversal': 0, 'consolidation': 0, 'oversold': 1,
            'overbought': -1, 'rally': 3, 'correction': -2, 'rebound': 2,
            
            // Corporate actions
            'split': 1, 'merger': 1, 'acquisition': 1, 'spin-off': 0,
            'bankruptcy': -5, 'delisting': -4, 'IPO': 1, 'SPAC': 0,
            
            // Analyst ratings
            'strong buy': 5, 'buy': 4, 'outperform': 3, 'hold': 0,
            'underperform': -3, 'sell': -4, 'strong sell': -5
          };
          
          const analyzedNews = news.map(item => {
            const sentimentResult = sentiment.analyze(item.title);
            
            // Apply custom scoring
            let customScore = 0;
            const customKeywords = [];
            for (const [word, score] of Object.entries(customWords)) {
              if (item.title.toLowerCase().includes(word)) {
                customScore += score;
                customKeywords.push(word);
              }
            }
            
            const finalScore = sentimentResult.score + customScore;
            const allKeywords = [
              ...new Set([
                ...sentimentResult.positive,
                ...sentimentResult.negative,
                ...customKeywords
              ])
            ].filter(k => k.length > 3); // Filter out short words
            
            console.log('Sentiment analysis for:', item.title);
            console.log('Base score:', sentimentResult.score);
            console.log('Custom score:', customScore);
            console.log('Final score:', finalScore);
            console.log('Keywords:', [...sentimentResult.positive, ...sentimentResult.negative, ...customKeywords]);
            
            return {
              ...item,
              sentiment: {
                score: finalScore,
                comparative: sentimentResult.comparative,
                positive: sentimentResult.positive,
                negative: sentimentResult.negative,
                keywords: [...new Set([...sentimentResult.positive, ...sentimentResult.negative, ...customKeywords])]
              }
            };
          });
          
          res.json({ symbol, news: analyzedNews });
        } catch (e) {
          console.error('Failed to parse scraped data:', e);
          res.status(500).json({ error: 'Failed to parse scraped data', details: e.message });
        }
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sentiment analysis endpoint
app.get('/api/sentiment/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    if (!NASDAQ_STOCKS.includes(symbol)) {
      return res.status(400).json({ error: 'Invalid NASDAQ symbol' });
    }

    // Get news data first
    const newsResponse = await axios.get(`http://localhost:${PORT}/api/news/${symbol}`);
    const newsData = newsResponse.data.news;

    // Calculate overall sentiment
    const totalScore = newsData.reduce((sum, item) => sum + item.sentiment.score, 0);
    const avgScore = totalScore / newsData.length;

    res.json({
      symbol,
      sentimentScore: avgScore,
      newsCount: newsData.length,
      breakdown: newsData.map(item => ({
        title: item.title,
        score: item.sentiment.score
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available stocks
app.get('/api/stocks', (req, res) => {
  res.json(NASDAQ_STOCKS);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get port from command line, environment variable, or default
const getPort = () => {
  if (process.argv[2]) return parseInt(process.argv[2]);
  if (process.env.PORT) return parseInt(process.env.PORT);
  return 3015; // New default port
};

const PORT = getPort();
const server = app.listen(PORT, () => {
  console.log(`
=== Server Started ===`);
  console.log(`Port: ${PORT}`);
  console.log(`Access: http://localhost:${PORT}`);
  console.log(`Registered routes:`);
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      console.log(`- ${middleware.route.stack[0].method.toUpperCase()} ${middleware.route.path}`);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Trying another port...`);
    const newPort = PORT + 1;
    server.listen(newPort);
  } else {
    console.error('Server error:', err);
  }
});

// Verify all routes
console.log('Registered routes:');
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    console.log(`${middleware.route.stack[0].method.toUpperCase()} ${middleware.route.path}`);
  }
});