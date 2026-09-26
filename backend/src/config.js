const path = require('path');

// Load settings from the .env file in the project root (the same file Docker Compose uses).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const isTest = process.env.NODE_ENV === 'test';

const config = {
  isTest,
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Tests use their own database, so running them never wipes your development data.
  databaseUrl: isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
};

for (const [key, envName] of [
  ['databaseUrl', isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'],
  ['jwtSecret', 'JWT_SECRET'],
]) {
  if (!config[key]) {
    throw new Error(`${envName} is missing. Copy .env.example to .env and fill it in.`);
  }
}

module.exports = config;