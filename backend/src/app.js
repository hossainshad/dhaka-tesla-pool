const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const authRoutes = require('./routes/auth');
const config = require('./config');
const logger = require('./logger');
const healthRoutes = require('./routes/health');
const { notFound, errorHandler } = require('./errors');
const zoneRoutes = require('./routes/zones');
const rideRequestRoutes = require('./routes/rideRequests');
const driverRoutes = require('./routes/driver');

const app = express();



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
app.use(helmet()); 
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '10kb' })); 

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/ride-requests', rideRequestRoutes);
app.use('/api/driver', driverRoutes);



app.use(notFound); 
app.use(errorHandler);
module.exports = app;