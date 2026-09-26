// Pure unit tests for the status rules in docs/design.md, section 6. No database needed.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  RIDE_TRANSITIONS,
  REQUEST_TRANSITIONS,
  assertRideTransition,
  assertRequestTransition,
  statusesThatCanBecome,
} = require('../src/domain/lifecycle');

// Checks that a call throws our 409 INVALID_TRANSITION error.
function assertRejected(fn) {
  assert.throws(fn, (err) => err.status === 409 && err.code === 'INVALID_TRANSITION');
}

describe("ride lifecycle (Jashim's Bullet)", () => {
  it('allows the normal journey: OPEN → DRIVER_ARRIVED → STARTED → COMPLETED', () => {
    assert.doesNotThrow(() => assertRideTransition('OPEN', 'DRIVER_ARRIVED'));
    assert.doesNotThrow(() => assertRideTransition('DRIVER_ARRIVED', 'STARTED'));
    assert.doesNotThrow(() => assertRideTransition('STARTED', 'COMPLETED'));
  });

  it('rejects completing a ride that never started', () => {
    assertRejected(() => assertRideTransition('OPEN', 'COMPLETED'));
  });

  it('rejects starting before the driver has arrived', () => {
    assertRejected(() => assertRideTransition('OPEN', 'STARTED'));
  });

  it('rejects cancelling once the trip has started', () => {
    assertRejected(() => assertRideTransition('STARTED', 'CANCELLED'));
  });

  it('treats COMPLETED and CANCELLED as final', () => {
    for (const to of Object.keys(RIDE_TRANSITIONS)) {
      assertRejected(() => assertRideTransition('COMPLETED', to));
      assertRejected(() => assertRideTransition('CANCELLED', to));
    }
  });

  it('rejects unknown statuses', () => {
    assertRejected(() => assertRideTransition('FLYING', 'COMPLETED'));
  });
});

describe("ride request lifecycle (Nusrat's booking)", () => {
  it('allows the normal journey: REQUESTED → MATCHED → IN_PROGRESS → COMPLETED', () => {
    assert.doesNotThrow(() => assertRequestTransition('REQUESTED', 'MATCHED'));
    assert.doesNotThrow(() => assertRequestTransition('MATCHED', 'IN_PROGRESS'));
    assert.doesNotThrow(() => assertRequestTransition('IN_PROGRESS', 'COMPLETED'));
  });

  it('lets a passenger cancel while waiting or matched', () => {
    assert.doesNotThrow(() => assertRequestTransition('REQUESTED', 'CANCELLED'));
    assert.doesNotThrow(() => assertRequestTransition('MATCHED', 'CANCELLED'));
  });

  it('rejects cancelling once the ride is in progress', () => {
    assertRejected(() => assertRequestTransition('IN_PROGRESS', 'CANCELLED'));
  });

  it('rejects skipping the match step', () => {
    assertRejected(() => assertRequestTransition('REQUESTED', 'IN_PROGRESS'));
  });
});

describe('statusesThatCanBecome', () => {
  it('knows a ride can only be cancelled from OPEN or DRIVER_ARRIVED', () => {
    assert.deepEqual(statusesThatCanBecome(RIDE_TRANSITIONS, 'CANCELLED'), ['OPEN', 'DRIVER_ARRIVED']);
  });

  it('knows a request can only be cancelled from REQUESTED or MATCHED', () => {
    assert.deepEqual(statusesThatCanBecome(REQUEST_TRANSITIONS, 'CANCELLED'), ['REQUESTED', 'MATCHED']);
  });
});