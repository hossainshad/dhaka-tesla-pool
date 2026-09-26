// This line must run before the app loads its config: it switches everything to the test database.
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

const DEMO_PASSWORD = 'oitesla123';

// Build the test database's tables (if needed) and refill it with the story cast.
// Every test file starts from the same known state.
async function resetDatabase() {
  await db.migrate.latest();
  await db.seed.run();
}

// Log in as a seeded user ('nusrat', 'rafiq', 'shirin' or 'jashim') and return their token.
async function loginAs(name) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: `${name}@teslapool.test`, password: DEMO_PASSWORD });
  return res.body.token;
}

module.exports = { request, app, db, resetDatabase, loginAs, DEMO_PASSWORD };
