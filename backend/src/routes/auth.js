const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');

const authService = require('../services/authService');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Slow down password guessing: max 10 failed attempts per 15 minutes from one IP address.
// Successful logins don't count, so normal use never gets blocked.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' } },
});

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name is too long'),
  email,
  // bcrypt only uses the first 72 bytes of a password, so we cap it there.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long'),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const result = await authService.registerPassenger(req.body);
  res.status(201).json(result);
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.json({ user });
});

module.exports = router;