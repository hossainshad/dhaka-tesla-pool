const knex = require('knex');
const knexConfig = require('../knexfile');
const config = require('./config');


const db = knex({ ...knexConfig, connection: config.databaseUrl });

module.exports = db;