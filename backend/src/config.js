const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const isTest = process.env.NODE_ENV === 'test';

const config = {
  isTest,
  port: Number(process.env.PORT) || 4000,
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',  
  trustProxy: process.env.TRUST_PROXY === 'true',
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
