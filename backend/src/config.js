const path = require('path');

// Load settings from the .env file in the project root (the same file Docker Compose uses).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
};

// Fail fast with a clear message instead of a confusing error later.
if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env and fill it in.');
}

module.exports = config;