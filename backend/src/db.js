const knex = require('knex');
const knexConfig = require('../knexfile');

// One shared connection pool for the whole app.
const db = knex(knexConfig);

module.exports = db;