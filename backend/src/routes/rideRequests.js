const express = require('express');
const { z } = require('zod');

const rideRequestService = require('../services/rideRequestService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, parseId } = require('../middleware/validate');

const router = express.Router();

// Every route in this file is for logged-in passengers only.
router.use(requireAuth, requireRole('PASSENGER'));

const createSchema = z
  .object({
    pickupZoneId: z.number().int().positive(),
    dropoffZoneId: z.number().int().positive(),
    seats: z.number().int().min(1).max(3).default(1),
    paymentMethod: z.enum(['CASH', 'WALLET']),
  })
  .refine((data) => data.pickupZoneId !== data.dropoffZoneId, {
    message: 'Pickup and destination must be different',
    path: ['dropoffZoneId'],
  });

router.post('/', validateBody(createSchema), async (req, res) => {
  const request = await rideRequestService.createRequest(req.user.id, req.body);
  res.status(201).json({ request });
});

router.get('/', async (req, res) => {
  const requests = await rideRequestService.listOwnRequests(req.user.id);
  res.json({ requests });
});

router.get('/:id', async (req, res) => {
  const request = await rideRequestService.getOwnRequest(req.user.id, parseId(req.params.id));
  res.json({ request });
});

router.post('/:id/cancel', async (req, res) => {
  const request = await rideRequestService.cancelRequest(req.user.id, parseId(req.params.id));
  res.json({ request });
});

module.exports = router;
