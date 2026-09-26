const db = require('../src/db');
const logger = require('../src/logger');

async function setupDatabase() {
  const [, migrations] = await db.migrate.latest();
  logger.info(`Migrations applied: ${migrations.length}`);

  const { count } = await db('users').count('* as count').first();
  if (Number(count) === 0) {
    await db.seed.run();
    logger.info('Empty database: seeded demo data');
  } else {
    logger.info('Database already has data: seed skipped');
  }
}

setupDatabase()
  .then(() => db.destroy())
  .catch(async (err) => {
    logger.error({ err }, 'Database setup failed');
    await db.destroy();
    process.exit(1);
  });