// Initial database schema for Dhaka Tesla Pool.
// Written in plain SQL so every constraint is easy to see. Explained in docs/database.md.

exports.up = async function (knex) {
  await knex.raw(`
    -- Everyone who logs in: passengers (Nusrat, Rafiq, Shirin) and drivers (Jashim).
    CREATE TABLE users (
      id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name                  TEXT NOT NULL,
      email                 TEXT NOT NULL UNIQUE,
      password_hash         TEXT NOT NULL,
      role                  TEXT NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER')),
      is_online             BOOLEAN NOT NULL DEFAULT false,
      wallet_balance_paisa  INTEGER NOT NULL DEFAULT 0 CHECK (wallet_balance_paisa >= 0),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Fixed list of Dhaka areas on a simple km grid (see docs/design.md).
    CREATE TABLE zones (
      id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      x_km  INTEGER NOT NULL,
      y_km  INTEGER NOT NULL
    );

    -- Teslas like Bullet. One vehicle per driver.
    CREATE TABLE vehicles (
      id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      driver_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
      name          TEXT NOT NULL,
      plate_number  TEXT NOT NULL UNIQUE,
      capacity      INTEGER NOT NULL CHECK (capacity > 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One trip of a vehicle. This is the pool.
    CREATE TABLE rides (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      driver_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
      pickup_zone_id  INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
      status          TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED')),
      capacity        INTEGER NOT NULL CHECK (capacity > 0), -- copied from the vehicle
      seats_taken     INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- The key rule: Bullet can never be overbooked.
      CONSTRAINT rides_seats_within_capacity CHECK (seats_taken >= 0 AND seats_taken <= capacity)
    );

    -- A driver can have only one active ride at a time.
    CREATE UNIQUE INDEX rides_one_active_per_driver ON rides (driver_id)
      WHERE status IN ('OPEN', 'DRIVER_ARRIVED', 'STARTED');

    CREATE INDEX rides_status_pickup_idx ON rides (status, pickup_zone_id);
    CREATE INDEX rides_driver_history_idx ON rides (driver_id, created_at);

    -- One passenger's booking. ride_id is the pool membership.
    CREATE TABLE ride_requests (
      id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      passenger_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      ride_id               INTEGER REFERENCES rides(id) ON DELETE RESTRICT, -- NULL while waiting
      pickup_zone_id        INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
      dropoff_zone_id       INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
      seats                 INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 3),
      distance_km           INTEGER NOT NULL CHECK (distance_km > 0),
      estimated_fare_paisa  INTEGER NOT NULL CHECK (estimated_fare_paisa >= 0),
      final_fare_paisa      INTEGER CHECK (final_fare_paisa >= 0), -- set when the ride starts
      payment_method        TEXT NOT NULL CHECK (payment_method IN ('CASH', 'WALLET')),
      status                TEXT NOT NULL DEFAULT 'REQUESTED'
                            CHECK (status IN ('REQUESTED', 'MATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT ride_requests_different_zones CHECK (pickup_zone_id <> dropoff_zone_id),

      -- A waiting request has no ride; a matched, in-progress or completed one always has one.
      CONSTRAINT ride_requests_ride_matches_status CHECK (
        (status = 'REQUESTED' AND ride_id IS NULL)
        OR (status IN ('MATCHED', 'IN_PROGRESS', 'COMPLETED') AND ride_id IS NOT NULL)
        OR status = 'CANCELLED'
      )
    );

    -- A passenger can have only one active request at a time (stops double-taps).
    CREATE UNIQUE INDEX ride_requests_one_active_per_passenger ON ride_requests (passenger_id)
      WHERE status IN ('REQUESTED', 'MATCHED', 'IN_PROGRESS');

    CREATE INDEX ride_requests_status_pickup_idx ON ride_requests (status, pickup_zone_id);
    CREATE INDEX ride_requests_passenger_history_idx ON ride_requests (passenger_id, created_at);
    CREATE INDEX ride_requests_ride_idx ON ride_requests (ride_id);

    -- Append-only history of every status change.
    CREATE TABLE ride_events (
      id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ride_id          INTEGER REFERENCES rides(id) ON DELETE RESTRICT,
      ride_request_id  INTEGER REFERENCES ride_requests(id) ON DELETE RESTRICT,
      actor_id         INTEGER REFERENCES users(id) ON DELETE RESTRICT, -- NULL for system events
      type             TEXT NOT NULL,
      from_status      TEXT,
      to_status        TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT ride_events_has_subject CHECK (ride_id IS NOT NULL OR ride_request_id IS NOT NULL)
    );

    CREATE INDEX ride_events_ride_idx ON ride_events (ride_id);
    CREATE INDEX ride_events_request_idx ON ride_events (ride_request_id);

    -- One payment per completed booking. UNIQUE stops double charging.
    CREATE TABLE payments (
      id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ride_request_id  INTEGER NOT NULL UNIQUE REFERENCES ride_requests(id) ON DELETE RESTRICT,
      method           TEXT NOT NULL CHECK (method IN ('CASH', 'WALLET')),
      amount_paisa     INTEGER NOT NULL CHECK (amount_paisa >= 0),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS payments, ride_events, ride_requests, rides, vehicles, zones, users;
  `);
};