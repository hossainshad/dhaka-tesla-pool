const express = require('express');
const db = require('../db');

const router = express.Router();

// Public list of Dhaka zones, for the pickup and destination dropdowns.
router.get('/', async (req, res) => {
  const zones = await db('zones').orderBy('name');
  res.json({
    zones: zones.map((z) => ({ id: z.id, name: z.name, xKm: z.x_km, yKm: z.y_km })),
  });
});

module.exports = router;