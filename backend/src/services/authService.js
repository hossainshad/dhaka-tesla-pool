const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../db');
const config = require('../config');
const { AppError } = require('../errors');

const PASSWORD_HASH_ROUNDS = 10;

const UNIQUE_VIOLATION = '23505';

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

async function registerPassenger({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

  try {
    const [user] = await db('users')
      .insert({ name, email, password_hash: passwordHash, role: 'PASSENGER' })
      .returning('*');
    return { token: createToken(user), user: toPublicUser(user) };
  } catch (err) {

    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const user = await db('users').where({ email }).first();
  const passwordMatches = user && (await bcrypt.compare(password, user.password_hash));

  if (!passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return { token: createToken(user), user: toPublicUser(user) };
}

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
