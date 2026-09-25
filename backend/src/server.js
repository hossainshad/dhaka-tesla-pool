const config = require('./config');
const app = require('./app');
const db = require('./db');
const logger = require('./logger');

const server = app.listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}`);
});

// Docker sends SIGTERM when stopping a container, Ctrl+C sends SIGINT.
// Finish open requests, close the database pool, then exit.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));