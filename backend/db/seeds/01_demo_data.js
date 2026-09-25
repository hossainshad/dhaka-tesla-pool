// Demo data: Dhaka zones and the story cast (Jashim + Bullet, Nusrat, Rafiq, Shirin).
// WARNING: this wipes all tables first. Only for local development and demos.

const bcrypt = require('bcryptjs');

// Demo login password for every account. It's listed in the README, so it's not a secret.
const DEMO_PASSWORD = 'oitesla123';

// Zone grid positions from docs/design.md (x = east, y = north, in km).
const ZONES = [
  { name: 'Dhanmondi', x_km: 0, y_km: 0 },
  { name: 'Farmgate', x_km: 2, y_km: 1 },
  { name: 'Mohakhali', x_km: 4, y_km: 4 },
  { name: 'Gulshan 1', x_km: 5, y_km: 4 },
  { name: 'Gulshan 2', x_km: 5, y_km: 6 },
  { name: 'Banani', x_km: 4, y_km: 7 },
  { name: 'Mirpur', x_km: 0, y_km: 9 },
  { name: 'Bashundhara', x_km: 8, y_km: 9 },
  { name: 'Uttara', x_km: 3, y_km: 18 },
];

// Wallet balances are in paisa (৳1 = 100 paisa).
const PASSENGERS = [
  { name: 'Nusrat', email: 'nusrat@teslapool.test', wallet_balance_paisa: 50000 }, // ৳500
  { name: 'Rafiq', email: 'rafiq@teslapool.test', wallet_balance_paisa: 30000 }, // ৳300
  // Shirin's TeslaPay balance is too low for any ride, so she has to pay cash (a demo edge case).
  { name: 'Shirin', email: 'shirin@teslapool.test', wallet_balance_paisa: 5000 }, // ৳50
];

exports.seed = async function (knex) {
  // Start from a clean database. RESTART IDENTITY resets ids back to 1.
  await knex.raw(`
    TRUNCATE payments, ride_events, ride_requests, rides, vehicles, users, zones
    RESTART IDENTITY CASCADE
  `);

  await knex('zones').insert(ZONES);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [jashim] = await knex('users')
    .insert({
      name: 'Jashim',
      email: 'jashim@teslapool.test',
      password_hash: passwordHash,
      role: 'DRIVER',
      is_online: false,
    })
    .returning(['id']);

  await knex('users').insert(
    PASSENGERS.map((p) => ({ ...p, password_hash: passwordHash, role: 'PASSENGER' }))
  );

  await knex('vehicles').insert({
    driver_id: jashim.id,
    name: 'Bullet',
    plate_number: 'DHAKA-TESLA-11',
    capacity: 3,
  });
};