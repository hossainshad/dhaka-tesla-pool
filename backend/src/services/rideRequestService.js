const db = require('../db');
const { AppError } = require('../errors');
const { distanceKm } = require('../domain/geo');
const { estimateFarePaisa } = require('../domain/fare');
const { assertRequestTransition } = require('../domain/lifecycle');
const { recordEvent } = require('./events');
const { lockRide, tryAutoJoin, removeFromRide } = require('./poolService');

const UNIQUE_VIOLATION = '23505';

// Ride requests joined with their zone names (so the API can say "Banani" instead of "6"),
// plus a short summary of the ride they are in: status, driver, Tesla and how many passengers share it.
function requestsWithZones(query = db) {
  return query('ride_requests as rr')
    .join('zones as pz', 'pz.id', 'rr.pickup_zone_id')
    .join('zones as dz', 'dz.id', 'rr.dropoff_zone_id')
    .leftJoin('rides as r', 'r.id', 'rr.ride_id')
    .leftJoin('users as d', 'd.id', 'r.driver_id')
    .leftJoin('vehicles as v', 'v.id', 'r.vehicle_id')
    .select(
      'rr.*',
      'pz.name as pickup_zone_name',
      'dz.name as dropoff_zone_name',
      'r.status as ride_status',
      'd.name as driver_name',
      'v.name as vehicle_name',
      'v.plate_number as vehicle_plate',
      query.raw(
        `(SELECT COUNT(*) FROM ride_requests o
          WHERE o.ride_id = rr.ride_id AND o.status IN ('MATCHED', 'IN_PROGRESS', 'COMPLETED')
         ) AS ride_passenger_count`
      )
    );
}

// A passenger sees their OWN fare and status, plus that they share the ride with others.
// Never the other passengers' names or fares.
function toPublicRequest(row) {
  return {
    id: row.id,
    status: row.status,
    rideId: row.ride_id,
    ride: row.ride_id
      ? {
          id: row.ride_id,
          status: row.ride_status,
          driverName: row.driver_name,
          vehicle: { name: row.vehicle_name, plateNumber: row.vehicle_plate },
          passengerCount: Number(row.ride_passenger_count),
        }
      : null,
    pickupZone: { id: row.pickup_zone_id, name: row.pickup_zone_name },
    dropoffZone: { id: row.dropoff_zone_id, name: row.dropoff_zone_name },
    seats: row.seats,
    distanceKm: row.distance_km,
    estimatedFarePaisa: row.estimated_fare_paisa,
    finalFarePaisa: row.final_fare_paisa,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Passengers only ever see their own requests. Someone else's request looks exactly like
// one that doesn't exist (404), so ids can't be used to snoop on other people's rides.
async function getOwnRequest(passengerId, requestId, query = db) {
  const row = await requestsWithZones(query)
    .where({ 'rr.id': requestId, 'rr.passenger_id': passengerId })
    .first();
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Ride request not found');
  }
  return toPublicRequest(row);
}

async function createRequest(passengerId, { pickupZoneId, dropoffZoneId, seats, paymentMethod }) {
  const [pickup, dropoff] = await Promise.all([
    db('zones').where({ id: pickupZoneId }).first(),
    db('zones').where({ id: dropoffZoneId }).first(),
  ]);
  if (!pickup || !dropoff) {
    throw new AppError(400, 'INVALID_ZONE', 'Pickup or destination zone does not exist');
  }

  const distance = distanceKm(pickup, dropoff);
  const estimate = estimateFarePaisa(distance, seats);

  // TeslaPay must cover the estimate up front. The final fare is never higher (docs/design.md).
  if (paymentMethod === 'WALLET') {
    const passenger = await db('users').where({ id: passengerId }).first();
    if (passenger.wallet_balance_paisa < estimate) {
      throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Your TeslaPay balance is too low, pay by cash instead');
    }
  }

  try {
    return await db.transaction(async (trx) => {
      const [request] = await trx('ride_requests')
        .insert({
          passenger_id: passengerId,
          pickup_zone_id: pickupZoneId,
          dropoff_zone_id: dropoffZoneId,
          seats,
          distance_km: distance,
          estimated_fare_paisa: estimate,
          payment_method: paymentMethod,
          status: 'REQUESTED',
        })
        .returning('*');

      await recordEvent(trx, {
        rideRequestId: request.id,
        actorId: passengerId,
        type: 'REQUEST_CREATED',
        toStatus: 'REQUESTED',
      });

      // If a compatible Tesla is already on its way (like Jashim's Bullet), hop in.
      // Otherwise the request stays REQUESTED until a driver accepts it.
      await tryAutoJoin(trx, request);

      return getOwnRequest(passengerId, request.id, trx);
    });
  } catch (err) {
    // The database allows only one active request per passenger (partial unique index).
    // This also stops a double-tap on "Request ride" from creating two requests.
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'ACTIVE_REQUEST_EXISTS', 'You already have an active ride request');
    }
    throw err;
  }
}

async function listOwnRequests(passengerId) {
  const rows = await requestsWithZones()
    .where('rr.passenger_id', passengerId)
    .orderBy('rr.created_at', 'desc')
    .orderBy('rr.id', 'desc')
    .limit(50);
  return rows.map(toPublicRequest);
}

async function cancelRequest(passengerId, requestId) {
  return db.transaction(async (trx) => {
    // Read first (no lock) just to learn which ride the request belongs to.
    const found = await trx('ride_requests')
      .where({ id: requestId, passenger_id: passengerId })
      .first();
    if (!found) {
      throw new AppError(404, 'NOT_FOUND', 'Ride request not found');
    }

    // Locking rule: the ride first, then the request (see poolService.js).
    const ride = found.ride_id ? await lockRide(trx, found.ride_id) : null;
    const request = await trx('ride_requests').where({ id: requestId }).forUpdate().first();

    // A driver may have matched it into a ride between our first read and the lock.
    if (request.ride_id !== found.ride_id) {
      throw new AppError(409, 'REQUEST_CHANGED', 'This request just changed, please try again');
    }

    assertRequestTransition(request.status, 'CANCELLED');

    if (ride) {
      await removeFromRide(trx, ride, request, passengerId);
    }

    await trx('ride_requests')
      .where({ id: requestId })
      .update({ status: 'CANCELLED', updated_at: trx.fn.now() });

    await recordEvent(trx, {
      rideId: request.ride_id,
      rideRequestId: requestId,
      actorId: passengerId,
      type: 'REQUEST_CANCELLED',
      fromStatus: request.status,
      toStatus: 'CANCELLED',
    });

    return getOwnRequest(passengerId, requestId, trx);
  });
}

module.exports = { createRequest, listOwnRequests, getOwnRequest, cancelRequest };
