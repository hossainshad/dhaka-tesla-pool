const express = require('express');
const db = require('../db');

const router = express.Router();

// Lets Docker and hosting platforms check that the API is alive and can reach the database.
router.get('/', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch (err) {
    req.log.error({ err }, 'Health check failed: database unreachable');
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

module.exports = router;