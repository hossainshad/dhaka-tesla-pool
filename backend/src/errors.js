// An error we expect and can explain to the user, e.g. "that seat was just taken".
// `details` is optional extra info, like which form fields are invalid.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Runs when no route matched the request.
function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// Express knows this is the error handler because it takes 4 arguments.
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Errors from express.json(), like broken JSON or a body that's too big.
  if (err.type && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }

  // Anything else is a bug: log the details for us, show a safe message to the user.
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

module.exports = { AppError, notFound, errorHandler };