// The trip itself: Jashim arrives, starts, completes (or cancels) his ride.
// Every action locks the ride first, checks the move is allowed (lifecycle.js),
// then updates the ride AND all its passengers' requests in one transaction.

const db = require('../db');
const { AppError } = require('../errors');
const { assertRideTransition } = require('../domain/lifecycle');
const { finalFarePaisa } = require('../domain/fare');
const { recordEvent } = require('./events');
const { lockRide } = require('./poolService');
const { findActiveRide, describeRide } = require('./driverService');

// Finds the driver's active ride and locks it. Everything below runs while holding this lock.
async function lockActiveRide(trx, driverId) {
  const active = await findActiveRide(driverId, trx);
  if (!active) {
    throw new AppError(404, 'NO_ACTIVE_RIDE', 'You have no active ride');
  }
  return lockRide(trx, active.id);
}

async function setRideStatus(trx, ride, to, actorId, extra = {}) {
  assertRideTransition(ride.status, to);
  const [updated] = await trx('rides')
    .where({ id: ride.id })
    .update({ status: to, updated_at: trx.fn.now(), ...extra })
    .returning('*');
  await recordEvent(trx, { rideId: ride.id, actorId, type: `RIDE_${to}`, fromStatus: ride.status, toStatus: to });
  return updated;
}

async function setRequestStatus(trx, request, to, actorId, extra = {}) {
  await trx('ride_requests')
    .where({ id: request.id })
    .update({ status: to, updated_at: trx.fn.now(), ...extra });
  await recordEvent(trx, {
    rideId: request.ride_id,
    rideRequestId: request.id,
    actorId,
    type: `REQUEST_${to}`,
    fromStatus: request.status,
    toStatus: to,
  });
}

// Jashim is at the pickup point. From now on nobody new can join: the group is closed.
async function arrive(driverId) {
  return db.transaction(async (trx) => {
    const ride = await lockActiveRide(trx, driverId);
    const updated = await setRideStatus(trx, ride, 'DRIVER_ARRIVED', driverId);
    return describeRide(updated, trx);
  });
}

// Everyone is in. The group can't change any more, so each final fare is locked now.
async function start(driverId) {
  return db.transaction(async (trx) => {
    const ride = await lockActiveRide(trx, driverId);
    assertRideTransition(ride.status, 'STARTED');

    // Locking order: ride first (above), then its requests.
    const requests = await trx('ride_requests').where({ ride_id: ride.id, status: 'MATCHED' }).forUpdate();
    const passengerCount = requests.length; // separate bookings, not seats

    for (const request of requests) {
      const fare = finalFarePaisa(request.distance_km, request.seats, passengerCount);
      await setRequestStatus(trx, request, 'IN_PROGRESS', driverId, { final_fare_paisa: fare });
    }

    const updated = await setRideStatus(trx, ride, 'STARTED', driverId);
    return describeRide(updated, trx);
  });
}

// Everyone has been dropped off. Record each payment and finish the ride.
async function complete(driverId) {
  return db.transaction(async (trx) => {
    const ride = await lockActiveRide(trx, driverId);
    assertRideTransition(ride.status, 'COMPLETED');

    const requests = await trx('ride_requests').where({ ride_id: ride.id, status: 'IN_PROGRESS' }).forUpdate();

    for (const request of requests) {
      const amount = request.final_fare_paisa;
      let method = request.payment_method;

      if (method === 'WALLET') {
        // Take the fare from TeslaPay, but only if the balance still covers it.
        // It always should (checked when requesting, and the final fare is never higher),
        // but if not, we fall back to cash rather than block the whole ride from finishing.
        const paid = await trx('users')
          .where({ id: request.passenger_id })
          .where('wallet_balance_paisa', '>=', amount)
          .decrement('wallet_balance_paisa', amount);
        if (paid === 0) {
          method = 'CASH';
        }
      }

      // payments.ride_request_id is UNIQUE, so a booking can never be charged twice.
      await trx('payments').insert({ ride_request_id: request.id, method, amount_paisa: amount });
      await setRequestStatus(trx, request, 'COMPLETED', driverId);
    }

    const updated = await setRideStatus(trx, ride, 'COMPLETED', driverId);
    return describeRide(updated, trx, { includeCancelled: true });
  });
}

// Jashim cancels before the trip starts. Everyone in the ride is cancelled too.
async function cancelRide(driverId) {
  return db.transaction(async (trx) => {
    const ride = await lockActiveRide(trx, driverId);
    assertRideTransition(ride.status, 'CANCELLED');

    const requests = await trx('ride_requests').where({ ride_id: ride.id, status: 'MATCHED' }).forUpdate();
    for (const request of requests) {
      await setRequestStatus(trx, request, 'CANCELLED', driverId);
    }

    const updated = await setRideStatus(trx, ride, 'CANCELLED', driverId, { seats_taken: 0 });
    return describeRide(updated, trx, { includeCancelled: true });
  });
}

module.exports = { arrive, start, complete, cancelRide };
