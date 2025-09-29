const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const Sentiment = require('sentiment');
const sqlite3 = require('sqlite3').verbose();
const sentiment = new Sentiment();

// Initialize SQLite database
const db = new sqlite3.Database('./sentiment.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to sentiment database');
    db.run(`CREATE TABLE IF NOT EXISTS stock_metrics (
      symbol TEXT,
      date TEXT,
      sentiment_score REAL,
      article_count INTEGER,
      rsi_score REAL,
      PRIMARY KEY (symbol, date)
    )`);
  }
});

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

const ALPHA_VANTAGE_API_KEY = 'LCH793C5NT8GWIB0';
const cachedStockData = {};

async function getStockData(symbol, days) {
  try {
    // Check cache first
    if (cachedStockData[symbol]) {
      return cachedStockData[symbol].slice(0, days);
    }

    // Fetch RSI data from Alpha Vantage
    const rsiResponse = await axios.get(
      `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`
    );

    if (!rsiResponse.data || !rsiResponse.data['Technical Analysis: RSI']) {
      throw new Error('Invalid RSI API response');
    }

    // Process RSI data
    const rsiData = rsiResponse.data['Technical Analysis: RSI'];
    const dates = Object.keys(rsiData).sort().reverse(); // Newest first
    
    // Store in cache
    cachedStockData[symbol] = dates.map(date => ({
      date,
      rsi_score: parseFloat(rsiData[date].RSI),
      sentiment_score: 0, // Will be updated with sentiment analysis
      article_count: 0   // Will be updated with sentiment analysis
    }));

    return cachedStockData[symbol].slice(0, days);

  } catch (error) {
    console.error(`Error fetching stock data for ${symbol}:`, error.message);
    // Fallback to reasonable defaults if API fails
    return Array.from({length: days}, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', {timeZone: 'America/New_York'}),
      rsi_score: 50,
      sentiment_score: 0,
      article_count: 0
    }));
  }
}

// Get available stocks
app.get('/api/stocks', (req, res) => {
  res.json(NASDAQ_STOCKS);
});

// Daily sentiment endpoint
app.get('/api/daily-sentiment/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days) || 7;

    if (!NASDAQ_STOCKS.includes(symbol)) {
      return res.status(400).json({ error: 'Invalid NASDAQ symbol' });
    }

    // Get real stock data
    const stockData = await getStockData(symbol, days);
    
    const NEWS_API_KEY = '49712014e76842608bb2acb8ea056277';
    const cachedSentiment = {};

    // Get news articles and analyze sentiment
    async function analyzeNewsSentiment(symbol, date) {
      const cacheKey = `${symbol}-${date}`;
      if (cachedSentiment[cacheKey]) {
        return cachedSentiment[cacheKey];
      }

      try {
        console.log(`Fetching news for ${symbol} on ${date}`);
        // Fetch news articles
        const newsResponse = await axios.get(
          `https://newsapi.org/v2/everything?q=${symbol}&from=${date}&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
        );
        console.log(`News API response for ${symbol}:`, newsResponse.data);

        if (!newsResponse.data.articles || newsResponse.data.articles.length === 0) {
          return { sentiment_score: 0, article_count: 0 };
        }

        // Analyze sentiment for each article
        const articles = newsResponse.data.articles;
        const sentimentResults = articles.map(article => {
          const result = sentiment.analyze(article.title + ' ' + (article.description || ''));
          return result.score;
        });

        const avgSentiment = sentimentResults.reduce((a, b) => a + b, 0) / sentimentResults.length;
        
        // Store in cache and return
        cachedSentiment[cacheKey] = {
          sentiment_score: parseFloat(avgSentiment.toFixed(2)),
          article_count: articles.length
        };

        return cachedSentiment[cacheKey];

      } catch (error) {
        console.error('Error analyzing news sentiment:', error.message);
        return { sentiment_score: 0, article_count: 0 };
      }
    }

    // Optimized sentiment data fetching with parallel requests and caching
    const sentimentData = [];
    const BATCH_SIZE = 5; // Process 5 days at a time
    
    for (let i = 0; i < stockData.length; i += BATCH_SIZE) {
      const batch = stockData.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          // Check database cache first
          const cached = await new Promise((resolve) => {
            db.get(
              `SELECT sentiment_score, article_count FROM stock_metrics 
               WHERE symbol = ? AND date = ?`,
              [symbol, item.date],
              (err, row) => resolve(row)
            );
          });

          if (cached) {
            return { ...item, ...cached };
          }

          // Fetch fresh data if not cached
          const sentiment = await analyzeNewsSentiment(symbol, item.date);
          return {
            ...item,
            sentiment_score: sentiment.sentiment_score,
            article_count: sentiment.article_count
          };
        })
      );

      sentimentData.push(...batchResults);
      
      // Provide progress feedback
      console.log(`Processed ${Math.min(i + BATCH_SIZE, stockData.length)}/${stockData.length} days`);
    }

    // Store in database (only new/changed data)
    const dbUpdates = sentimentData.map(day => 
      new Promise((resolve) => {
        db.run(
          `INSERT OR REPLACE INTO stock_metrics 
           VALUES (?, ?, ?, ?, ?)`,
          [symbol, day.date, day.sentiment_score, day.article_count, day.rsi_score],
          () => resolve()
        );
      })
    );
    await Promise.all(dbUpdates);

    res.json(sentimentData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle invalid routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Get port from command line, environment variable, or default
const getPort = () => {
  if (process.argv[2]) return parseInt(process.argv[2]);
  if (process.env.PORT) return parseInt(process.env.PORT);
  return 3016; // New default port
};

const PORT = getPort();
let server;

function startServer(port, maxAttempts = 5, attempt = 1) {
  return new Promise((resolve, reject) => {
    server = app.listen(port, '0.0.0.0', () => {
      console.log('\n=== Server Started ===');
      console.log(`Port: ${port}`);
      console.log(`Access: http://localhost:${port}`);
      console.log(`Network: http://${getLocalIP()}:${port}`);
      console.log('Registered routes:');
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          console.log(`- ${middleware.route.stack[0].method.toUpperCase()} ${middleware.route.path}`);
        }
      });
      resolve(port);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (attempt >= maxAttempts) {
          console.error(`Failed to start server after ${maxAttempts} attempts`);
          reject(new Error('Could not find available port'));
          return;
        }
        const nextPort = port + 1;
        console.log(`Port ${port} in use, trying ${nextPort}`);
        startServer(nextPort, maxAttempts, attempt + 1)
          .then(resolve)
          .catch(reject);
      } else {
        console.error('Server error:', err);
        reject(err);
      }
    });
  });
}

// Helper to get local IP address
function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Wrap server startup in async function
async function startApplication() {
  try {
    const actualPort = await startServer(PORT);
    console.log(`Server successfully started on port ${actualPort}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startApplication();