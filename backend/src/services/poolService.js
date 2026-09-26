// Pooling rules: who can join a ride, claiming seats, and freeing them again.
// See docs/design.md sections 2, 7 and 8.
//
// LOCKING RULE: always lock the ride row BEFORE touching its requests.
// If every piece of code locks in the same order, two transactions can never
// end up waiting for each other forever (a "deadlock").

const { AppError } = require('../errors');
const { destinationsAreClose } = require('../domain/geo');
const { assertRideTransition } = require('../domain/lifecycle');
const { recordEvent } = require('./events');

// Locks one ride until the transaction ends. Anyone else who wants to change this ride
// (join it, cancel from it, start it) has to wait in line. That's what stops Nusrat and
// Shirin from both taking the last seat: the second one waits, then sees the ride is full.
async function lockRide(trx, rideId) {
  return trx('rides').where({ id: rideId }).forUpdate().first();
}

// Returns why `request` can't join `ride`, or null if it can (the matching rule).
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

// Puts a waiting request into a ride and takes its seats.
// The ride MUST already be locked with lockRide().
async function addToRide(trx, ride, request, actorId) {
  const reason = await whyCannotJoin(trx, ride, request);
  if (reason) {
    throw new AppError(409, 'CANNOT_JOIN_RIDE', reason);
  }

  // Claim the seats. The WHERE is a second guard, the database CHECK constraint a third.
  const claimed = await trx('rides')
    .where({ id: ride.id, status: 'OPEN' })
    .andWhereRaw('seats_taken + ? <= capacity', [request.seats])
    .update({ seats_taken: trx.raw('seats_taken + ?', [request.seats]), updated_at: trx.fn.now() });
  if (claimed === 0) {
    throw new AppError(409, 'SEAT_TAKEN', 'The last seat was just taken');
  }

  // Only a request that is still waiting can be matched. It may have been cancelled a moment ago.
  // If so, throwing here rolls back the seat claim above too.
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

// When a passenger asks for a ride: try to join an open, compatible ride straight away.
// Returns true if matched. If nothing fits, the request simply keeps waiting.
async function tryAutoJoin(trx, request) {
  const candidates = await trx('rides')
    .where({ status: 'OPEN', pickup_zone_id: request.pickup_zone_id })
    .andWhereRaw('seats_taken + ? <= capacity', [request.seats])
    .orderBy('created_at')
    .select('id');

  for (const { id } of candidates) {
    const ride = await lockRide(trx, id); // fresh data, now that we hold the lock
    try {
      await addToRide(trx, ride, request, null); // null actor = done by the system
      return true;
    } catch (err) {
      // This ride filled up or stopped fitting while we waited for the lock: try the next one.
      if (err instanceof AppError && ['CANNOT_JOIN_RIDE', 'SEAT_TAKEN'].includes(err.code)) {
        continue;
      }
      throw err;
    }
  }
  return false;
}

// Takes a matched request out of its ride and frees its seats.
// The ride MUST already be locked. If nobody is left, the ride is cancelled.
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
