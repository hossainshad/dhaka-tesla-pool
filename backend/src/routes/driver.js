const express = require('express');
const { z } = require('zod');

const driverService = require('../services/driverService');
const tripService = require('../services/tripService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, parseId } = require('../middleware/validate');

const router = express.Router();

// Every route in this file is for logged-in drivers only.
router.use(requireAuth, requireRole('DRIVER'));

const statusSchema = z.object({ isOnline: z.boolean() });

router.patch('/status', validateBody(statusSchema), async (req, res) => {
  const user = await driverService.setOnline(req.user.id, req.body.isOnline);
  res.json({ user });
});

router.get('/requests', async (req, res) => {
  const requests = await driverService.listRelevantRequests(req.user.id);
  res.json({ requests });
});

router.post('/requests/:id/accept', async (req, res) => {
  const ride = await driverService.acceptRequest(req.user.id, parseId(req.params.id));
  res.json({ ride });
});

router.get('/ride', async (req, res) => {
  const ride = await driverService.getCurrentRide(req.user.id);
  res.json({ ride });
});

// The trip, step by step. Each one only works from the right status (see lifecycle.js).
router.post('/ride/arrive', async (req, res) => {
  res.json({ ride: await tripService.arrive(req.user.id) });
});

router.post('/ride/start', async (req, res) => {
  res.json({ ride: await tripService.start(req.user.id) });
});

router.post('/ride/complete', async (req, res) => {
  res.json({ ride: await tripService.complete(req.user.id) });
});

router.post('/ride/cancel', async (req, res) => {
  res.json({ ride: await tripService.cancelRide(req.user.id) });
});

router.get('/rides', async (req, res) => {
  const rides = await driverService.getRideHistory(req.user.id);
  res.json({ rides });
});

module.exports = router;
