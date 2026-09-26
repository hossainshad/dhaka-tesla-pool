const { AppError } = require('../errors');

function checkSchema(schema, data) {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }

  return result.data;
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = checkSchema(schema, req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  }
  return id;
}

module.exports = { checkSchema, validateBody, parseId };
