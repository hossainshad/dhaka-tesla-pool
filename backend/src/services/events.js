// Writes one row to ride_events: the history that explains exactly what happened.
// Always call it with the same transaction (trx) as the change it describes,
// so the change and its history are saved together or not at all.
async function recordEvent(trx, { rideId, rideRequestId, actorId, type, fromStatus, toStatus }) {
  await trx('ride_events').insert({
    ride_id: rideId ?? null,
    ride_request_id: rideRequestId ?? null,
    actor_id: actorId ?? null,
    type,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
  });
}

module.exports = { recordEvent };