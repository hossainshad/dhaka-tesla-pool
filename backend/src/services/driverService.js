const db = require('../db');
const { AppError } = require('../errors');
const { destinationsAreClose } = require('../domain/geo');
const { ACTIVE_RIDE_STATUSES } = require('../domain/lifecycle');
const { recordEvent } = require('./events');
const { lockRide, addToRide } = require('./poolService');
const { getProfile } = require('./authService');

const UNIQUE_VIOLATION = '23505';

async function findActiveRide(driverId, query = db) {
  return query('rides').where({ driver_id: driverId }).whereIn('status', ACTIVE_RIDE_STATUSES).first();
}

async function assertOnline(driverId, query = db) {
  const driver = await query('users').where({ id: driverId }).first();
  if (!driver.is_online) {
    throw new AppError(409, 'DRIVER_OFFLINE', 'Go online first');
  }
}

async function setOnline(driverId, isOnline) {
  if (!isOnline && (await findActiveRide(driverId))) {
    throw new AppError(409, 'ACTIVE_RIDE', "You can't go offline during an active ride");
  }
  await db('users').where({ id: driverId }).update({ is_online: isOnline });
  return getProfile(driverId);
}

// Turns a ride row into what the driver's screen shows: vehicle, seats and passengers.
// Passengers are shown by first name and destination only (no emails, no other private data).
// Current rides hide passengers who cancelled; history shows everyone who was ever in the ride.
async function describeRide(ride, query = db, { includeCancelled = false } = {}) {
  const passengerQuery = query('ride_requests as rr')
    .join('users as u', 'u.id', 'rr.passenger_id')
    .join('zones as dz', 'dz.id', 'rr.dropoff_zone_id')
    .where('rr.ride_id', ride.id)
    .orderBy('rr.id')
    .select('rr.*', 'u.name as passenger_name', 'dz.name as dropoff_zone_name');
  if (!includeCancelled) {
    passengerQuery.whereNot('rr.status', 'CANCELLED');
  }

  const [pickupZone, vehicle, passengers] = await Promise.all([
    query('zones').where({ id: ride.pickup_zone_id }).first(),
    query('vehicles').where({ id: ride.vehicle_id }).first(),
    passengerQuery,
  ]);

  return {
    id: ride.id,
    status: ride.status,
    vehicle: { name: vehicle.name, plateNumber: vehicle.plate_number },
    pickupZone: { id: pickupZone.id, name: pickupZone.name },
    capacity: ride.capacity,
    seatsTaken: ride.seats_taken,
    seatsFree: ride.capacity - ride.seats_taken,
    createdAt: ride.created_at,
    updatedAt: ride.updated_at,
    passengers: passengers.map((p) => ({
      requestId: p.id,
      name: p.passenger_name,
      seats: p.seats,
      dropoffZone: { id: p.dropoff_zone_id, name: p.dropoff_zone_name },
      status: p.status,
      paymentMethod: p.payment_method,
      estimatedFarePaisa: p.estimated_fare_paisa,
      finalFarePaisa: p.final_fare_paisa,
    })),
  };
}

// What Jashim sees on his screen right now: his active ride, or null.
async function getCurrentRide(driverId, query = db) {
  const ride = await findActiveRide(driverId, query);
  return ride ? describeRide(ride, query) : null;
}

// Jashim's finished rides (completed or cancelled), newest first, with what each passenger paid.
async function getRideHistory(driverId) {
  const rides = await db('rides')
    .where({ driver_id: driverId })
    .whereIn('status', ['COMPLETED', 'CANCELLED'])
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(20);

  return Promise.all(
    rides.map(async (ride) => {
      const details = await describeRide(ride, db, { includeCancelled: true });
      const totalFarePaisa = details.passengers
        .filter((p) => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + p.finalFarePaisa, 0);
      return { ...details, totalFarePaisa };
    })
  );
}

// "Relevant requests": everything waiting if Jashim has no ride yet,
// or only the ones that fit his open ride (same pickup, close destination, enough seats).
async function listRelevantRequests(driverId) {
  await assertOnline(driverId);
  const ride = await findActiveRide(driverId);

  if (ride && ride.status !== 'OPEN') {
    return []; // he has arrived or started: the group is closed
  }

  const query = db('ride_requests as rr')
    .join('users as u', 'u.id', 'rr.passenger_id')
    .join('zones as pz', 'pz.id', 'rr.pickup_zone_id')
    .join('zones as dz', 'dz.id', 'rr.dropoff_zone_id')
    .where('rr.status', 'REQUESTED')
    .orderBy('rr.created_at')
    .select(
      'rr.*',
      'u.name as passenger_name',
      'pz.name as pickup_zone_name',
      'dz.name as dropoff_zone_name',
      'dz.x_km as dropoff_x_km',
      'dz.y_km as dropoff_y_km'
    );

  if (ride) {
    query.where('rr.pickup_zone_id', ride.pickup_zone_id).where('rr.seats', '<=', ride.capacity - ride.seats_taken);
  }

  let rows = await query;

  if (ride) {
    const existingDropoffs = await db('ride_requests as rr')
      .join('zones as z', 'z.id', 'rr.dropoff_zone_id')
      .where({ 'rr.ride_id': ride.id, 'rr.status': 'MATCHED' })
      .select('z.x_km', 'z.y_km');
    rows = rows.filter((r) =>
      destinationsAreClose({ x_km: r.dropoff_x_km, y_km: r.dropoff_y_km }, existingDropoffs)
    );
  }

  return rows.map((r) => ({
    id: r.id,
    passengerName: r.passenger_name,
    pickupZone: { id: r.pickup_zone_id, name: r.pickup_zone_name },
    dropoffZone: { id: r.dropoff_zone_id, name: r.dropoff_zone_name },
    seats: r.seats,
    distanceKm: r.distance_km,
    estimatedFarePaisa: r.estimated_fare_paisa,
    createdAt: r.created_at,
  }));
}

// Jashim accepts a waiting request: it starts a new ride, or joins his current open ride.
async function acceptRequest(driverId, requestId) {
  try {
    return await db.transaction(async (trx) => {
      await assertOnline(driverId, trx);

      const request = await trx('ride_requests').where({ id: requestId }).first();
      if (!request) {
        throw new AppError(404, 'NOT_FOUND', 'Ride request not found');
      }
      if (request.status !== 'REQUESTED') {
        throw new AppError(409, 'REQUEST_NOT_WAITING', 'This request is no longer waiting for a ride');
      }

      let ride = await findActiveRide(driverId, trx);

      if (ride) {
        ride = await lockRide(trx, ride.id); // fresh data, now that we hold the lock
      } else {
        const vehicle = await trx('vehicles').where({ driver_id: driverId }).first();
        [ride] = await trx('rides')
          .insert({
            driver_id: driverId,
            vehicle_id: vehicle.id,
            pickup_zone_id: request.pickup_zone_id,
            capacity: vehicle.capacity, // copied, so the CHECK constraint can use it
            status: 'OPEN',
          })
          .returning('*');

        await recordEvent(trx, { rideId: ride.id, actorId: driverId, type: 'RIDE_OPENED', toStatus: 'OPEN' });
      }

      await addToRide(trx, ride, request, driverId);
      return getCurrentRide(driverId, trx);
    });
  } catch (err) {
    // Two "accept" clicks at the same moment could both try to open a ride.
    // The database allows one active ride per driver, so the second one lands here.
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'ACTIVE_RIDE_EXISTS', 'You already have an active ride, refresh and try again');
    }
    throw err;
  }
}

module.exports = {
  setOnline,
  getCurrentRide,
  getRideHistory,
  describeRide,
  listRelevantRequests,
  acceptRequest,
  findActiveRide,
};
