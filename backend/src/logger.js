const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

// Production: JSON logs (easy for tools to search). Development: pretty, readable logs.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isProduction ? undefined : { target: 'pino-pretty' },
});

module.exports = logger;