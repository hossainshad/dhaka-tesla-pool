const path = require('path');

// Load settings from the .env file in the project root.
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: path.join(__dirname, 'db/migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'db/seeds'),
  },
};