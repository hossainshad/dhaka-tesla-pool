const jwt = require('jsonwebtoken');

const config = require('../config');
const { AppError } = require('../errors');

// Checks the "Authorization: Bearer <token>" header.
// If the token is valid, puts the logged-in user on req.user for the route to use.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in first'));
  }

  try {
    // Only accept tokens signed the way we sign them (HS256 with our secret).
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'UNAUTHENTICATED', 'Your session is invalid or expired, please log in again'));
  }
}

// Only lets users with one of the given roles through. Always use it after requireAuth.
// Example: requireRole('DRIVER')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not allowed to do this'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };