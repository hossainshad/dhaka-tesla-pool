const express = require('express');
const { z } = require('zod');

const driverService = require('../services/driverService');
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

module.exports = router;
