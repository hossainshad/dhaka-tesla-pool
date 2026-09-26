const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../db');
const config = require('../config');
const { AppError } = require('../errors');

const PASSWORD_HASH_ROUNDS = 10;

// PostgreSQL's error code for "unique constraint violated".
const UNIQUE_VIOLATION = '23505';

// Only these fields ever leave the API. password_hash never does.
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isOnline: user.is_online,
    walletBalancePaisa: user.wallet_balance_paisa,
  };
}

function createToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Sign-up is for passengers only. Drivers need a vehicle, so they are added by the seed (like Jashim).
async function registerPassenger({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

  try {
    const [user] = await db('users')
      .insert({ name, email, password_hash: passwordHash, role: 'PASSENGER' })
      .returning('*');
    return { token: createToken(user), user: toPublicUser(user) };
  } catch (err) {
    // We let the database's UNIQUE constraint catch duplicate emails.
    // Checking first and then inserting could still fail if two sign-ups arrive at the same moment.
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const user = await db('users').where({ email }).first();
  const passwordMatches = user && (await bcrypt.compare(password, user.password_hash));

  // Same message for "no such email" and "wrong password",
  // so nobody can use the login form to find out who has an account.
  if (!passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return { token: createToken(user), user: toPublicUser(user) };
}

// The logged-in user's own profile. Drivers also get their vehicle, so Jashim sees Bullet.
async function getProfile(userId) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'This account no longer exists');
  }

  const profile = toPublicUser(user);

  if (user.role === 'DRIVER') {
    const vehicle = await db('vehicles').where({ driver_id: user.id }).first();
    profile.vehicle = vehicle
      ? {
          id: vehicle.id,
          name: vehicle.name,
          plateNumber: vehicle.plate_number,
          capacity: vehicle.capacity,
        }
      : null;
  }

  return profile;
}
module.exports = { registerPassenger, login, getProfile, toPublicUser };
