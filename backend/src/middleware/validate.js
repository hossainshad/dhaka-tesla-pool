const { AppError } = require('../errors');

// Checks req.body against a Zod schema before the route runs.
// Invalid data never reaches our business logic.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details));
    }

    req.body = result.data; // cleaned data: trimmed, lowercased email, etc.
    next();
  };
}
// Turns an id from the URL (like /ride-requests/7) into a number.
// Anything that isn't a positive whole number can't exist, so we answer 404.
function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  }
  return id;
}

module.exports = { validateBody, parseId };
