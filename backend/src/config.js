const path = require('path');

// Load settings from the .env file in the project root (the same file Docker Compose uses).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
};

// Fail fast with a clear message instead of a confusing error later.
for (const [key, envName] of [
  ['databaseUrl', 'DATABASE_URL'],
  ['jwtSecret', 'JWT_SECRET'],
]) {
  if (!config[key]) {
    throw new Error(`${envName} is missing. Copy .env.example to .env and fill it in.`);
  }
}

module.exports = config;