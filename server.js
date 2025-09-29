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
    db.run(`CREATE TABLE IF NOT EXISTS sentiment_scores (
      symbol TEXT,
      date TEXT,
      score REAL,
      article_count INTEGER,
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

// Get available stocks
app.get('/api/stocks', (req, res) => {
  res.json(NASDAQ_STOCKS);
});

// Daily sentiment endpoint
app.get('/api/daily-sentiment/:symbol', (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days) || 7;

    if (!NASDAQ_STOCKS.includes(symbol)) {
      return res.status(400).json({ error: 'Invalid NASDAQ symbol' });
    }

    // Mock data - replace with actual implementation
    const mockData = Array.from({length: days}, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      score: parseFloat((Math.random() * 2 - 1).toFixed(2)),
      article_count: Math.floor(Math.random() * 5) + 1
    }));

    res.json(mockData);
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