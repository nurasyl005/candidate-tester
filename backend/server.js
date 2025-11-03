// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const app = express();

// Parse JSON bodies for API
app.use(express.json());

// Mount API router (Express)
const router = require('./router');
app.use(router);

// Serve static frontend
const staticDir = path.join(__dirname, '../frontend');
app.use(express.static(staticDir));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 3000);
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});