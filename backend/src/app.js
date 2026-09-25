const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./logger');
const healthRoutes = require('./routes/health');
const { notFound, errorHandler } = require('./errors');

const app = express();

// Log every request. Only method, URL and status: headers contain login tokens and must not be logged.
app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);
app.use(helmet()); // add safe HTTP security headers
app.use(cors({ origin: config.corsOrigin })); // only our frontend may call the API from a browser
app.use(express.json({ limit: '10kb' })); // read JSON bodies, reject huge ones

app.use('/api/health', healthRoutes);

app.use(notFound); // no route matched
app.use(errorHandler); // must be the last middleware

module.exports = app;