

const { AppError } = require('../errors');
const { destinationsAreClose } = require('../domain/geo');
const { assertRideTransition } = require('../domain/lifecycle');
const { recordEvent } = require('./events');

async function lockRide(trx, rideId) {
  return trx('rides').where({ id: rideId }).forUpdate().first();
}



async function whyCannotJoin(trx, ride, request) {
  if (ride.status !== 'OPEN') {
    return 'This ride is no longer taking passengers';
  }
  if (ride.pickup_zone_id !== request.pickup_zone_id) {
    return 'This ride picks up in a different zone';
  }
  if (ride.seats_taken + request.seats > ride.capacity) {
    return 'Not enough free seats';
  }

  const newDropoff = await trx('zones').where({ id: request.dropoff_zone_id }).first();
  const existingDropoffs = await trx('ride_requests as rr')
    .join('zones as z', 'z.id', 'rr.dropoff_zone_id')
    .where({ 'rr.ride_id': ride.id, 'rr.status': 'MATCHED' })
    .select('z.x_km', 'z.y_km');

  if (!destinationsAreClose(newDropoff, existingDropoffs)) {
    return 'Destination is too far from the other passengers';
  }
  return null;
}

async function addToRide(trx, ride, request, actorId) {
  const reason = await whyCannotJoin(trx, ride, request);
  if (reason) {
    throw new AppError(409, 'CANNOT_JOIN_RIDE', reason);
  }

  const claimed = await trx('rides')
    .where({ id: ride.id, status: 'OPEN' })
    .andWhereRaw('seats_taken + ? <= capacity', [request.seats])
    .update({ seats_taken: trx.raw('seats_taken + ?', [request.seats]), updated_at: trx.fn.now() });
  if (claimed === 0) {
    throw new AppError(409, 'SEAT_TAKEN', 'The last seat was just taken');
  }

  const matched = await trx('ride_requests')
    .where({ id: request.id, status: 'REQUESTED' })
    .update({ status: 'MATCHED', ride_id: ride.id, updated_at: trx.fn.now() });
  if (matched === 0) {
    throw new AppError(409, 'REQUEST_NOT_WAITING', 'This request is no longer waiting for a ride');
  }

  await recordEvent(trx, {
    rideId: ride.id,
    rideRequestId: request.id,
    actorId,
    type: 'REQUEST_MATCHED',
    fromStatus: 'REQUESTED',
    toStatus: 'MATCHED',
  });
}


async function tryAutoJoin(trx, request) {
  const candidates = await trx('rides')
    .where({ status: 'OPEN', pickup_zone_id: request.pickup_zone_id })
    .andWhereRaw('seats_taken + ? <= capacity', [request.seats])
    .orderBy('created_at')
    .select('id');

  for (const { id } of candidates) {
    const ride = await lockRide(trx, id);
    try {
      await addToRide(trx, ride, request, null); 
      return true;
    } catch (err) {
      if (err instanceof AppError && ['CANNOT_JOIN_RIDE', 'SEAT_TAKEN'].includes(err.code)) {
        continue;
      }
      throw err;
    }
  }
  return false;
}

async function removeFromRide(trx, ride, request, actorId) {
  await trx('rides')
    .where({ id: ride.id })
    .update({ seats_taken: trx.raw('seats_taken - ?', [request.seats]), updated_at: trx.fn.now() });

  const { count } = await trx('ride_requests')
    .where({ ride_id: ride.id, status: 'MATCHED' })
    .whereNot({ id: request.id })
    .count('* as count')
    .first();

  if (Number(count) === 0) {
    assertRideTransition(ride.status, 'CANCELLED');
    await trx('rides').where({ id: ride.id }).update({ status: 'CANCELLED', updated_at: trx.fn.now() });
    await recordEvent(trx, {
      rideId: ride.id,
      actorId,
      type: 'RIDE_CANCELLED',
      fromStatus: ride.status,
      toStatus: 'CANCELLED',
    });
  }
}

module.exports = { lockRide, addToRide, tryAutoJoin, removeFromRide };
