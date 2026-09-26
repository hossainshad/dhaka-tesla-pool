// Allowed status changes, from docs/design.md (section 6).
// Any change not listed here is rejected with 409 Conflict.

const { AppError } = require('../errors');

const RIDE_TRANSITIONS = {
  OPEN: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [], // final
  CANCELLED: [], // final
};

const REQUEST_TRANSITIONS = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [], // final
  CANCELLED: [], // final
};

// Statuses that keep a driver or passenger "busy".
// Same lists as the partial unique indexes in the migration.
const ACTIVE_RIDE_STATUSES = ['OPEN', 'DRIVER_ARRIVED', 'STARTED'];
const ACTIVE_REQUEST_STATUSES = ['REQUESTED', 'MATCHED', 'IN_PROGRESS'];

function assertTransition(transitions, thing, from, to) {
  const allowed = transitions[from] || [];
  if (!allowed.includes(to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `A ${thing} cannot go from ${from} to ${to}`);
  }
}

function assertRideTransition(from, to) {
  assertTransition(RIDE_TRANSITIONS, 'ride', from, to);
}

function assertRequestTransition(from, to) {
  assertTransition(REQUEST_TRANSITIONS, 'ride request', from, to);
}

// Every status that is allowed to change into `to`.
// Used in database updates like: UPDATE ... SET status = 'CANCELLED' WHERE status IN (these),
// so the check and the change happen in one atomic step.
function statusesThatCanBecome(transitions, to) {
  return Object.keys(transitions).filter((from) => transitions[from].includes(to));
}

module.exports = {
  RIDE_TRANSITIONS,
  REQUEST_TRANSITIONS,
  ACTIVE_RIDE_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  assertRideTransition,
  assertRequestTransition,
  statusesThatCanBecome,
};