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

module.exports = { validateBody };