// The full story: Jashim picks up Nusrat and Rafiq in Bullet, drives, and gets paid.
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const { request, app, db, resetDatabase, loginAs, zoneId } = require('./helpers');

beforeEach(resetDatabase);
after(() => db.destroy());

// ---- small helpers so each test reads like the story ----

async function requestRide(token, { from, to, seats = 1, paymentMethod = 'CASH' }) {
  return request(app)
    .post('/api/ride-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ pickupZoneId: await zoneId(from), dropoffZoneId: await zoneId(to), seats, paymentMethod });
}

function driverAction(token, action) {
  return request(app).post(`/api/driver/ride/${action}`).set('Authorization', `Bearer ${token}`);
}

function myRequest(token, id) {
  return request(app).get(`/api/ride-requests/${id}`).set('Authorization', `Bearer ${token}`);
}

// Nusrat (TeslaPay) and Rafiq (cash) are pooled in Jashim's Bullet, ready for the trip.
async function nusratAndRafiqInBullet() {
  const nusrat = await loginAs('nusrat');
  const rafiq = await loginAs('rafiq');
  const jashim = await loginAs('jashim');

  const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali', paymentMethod: 'WALLET' });
  await request(app).patch('/api/driver/status').set('Authorization', `Bearer ${jashim}`).send({ isOnline: true });
  await request(app)
    .post(`/api/driver/requests/${n.body.request.id}/accept`)
    .set('Authorization', `Bearer ${jashim}`);
  const r = await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1', paymentMethod: 'CASH' });
  assert.equal(r.body.request.status, 'MATCHED');

  return { nusrat, rafiq, jashim, nusratRequestId: n.body.request.id, rafiqRequestId: r.body.request.id };
}

// ---- tests ----

describe('the full trip', () => {
  it('charges Nusrat ৳88 and Rafiq ৳104, and records both payments', async () => {
    const { nusrat, rafiq, jashim, nusratRequestId, rafiqRequestId } = await nusratAndRafiqInBullet();

    assert.equal((await driverAction(jashim, 'arrive')).body.ride.status, 'DRIVER_ARRIVED');

    const started = await driverAction(jashim, 'start');
    assert.equal(started.body.ride.status, 'STARTED');
    assert.equal((await myRequest(nusrat, nusratRequestId)).body.request.status, 'IN_PROGRESS');

    const completed = await driverAction(jashim, 'complete');
    assert.equal(completed.body.ride.status, 'COMPLETED');

    const nusratView = (await myRequest(nusrat, nusratRequestId)).body.request;
    const rafiqView = (await myRequest(rafiq, rafiqRequestId)).body.request;
    assert.equal(nusratView.status, 'COMPLETED');
    assert.equal(nusratView.finalFarePaisa, 8800);
    assert.equal(rafiqView.finalFarePaisa, 10400);

    const payments = await db('payments').orderBy('ride_request_id');
    assert.deepEqual(
      payments.map((p) => [p.method, p.amount_paisa]),
      [['WALLET', 8800], ['CASH', 10400]]
    );

    // TeslaPay: ৳500 - ৳88 = ৳412. Cash doesn't touch Rafiq's wallet.
    const nusratUser = await db('users').where({ name: 'Nusrat' }).first();
    const rafiqUser = await db('users').where({ name: 'Rafiq' }).first();
    assert.equal(nusratUser.wallet_balance_paisa, 41200);
    assert.equal(rafiqUser.wallet_balance_paisa, 30000);
  });

  it('gives no discount to a passenger who rides alone', async () => {
    const nusrat = await loginAs('nusrat');
    const jashim = await loginAs('jashim');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    await request(app).patch('/api/driver/status').set('Authorization', `Bearer ${jashim}`).send({ isOnline: true });
    await request(app)
      .post(`/api/driver/requests/${n.body.request.id}/accept`)
      .set('Authorization', `Bearer ${jashim}`);

    await driverAction(jashim, 'arrive');
    await driverAction(jashim, 'start');

    assert.equal((await myRequest(nusrat, n.body.request.id)).body.request.finalFarePaisa, 11000);
  });

  it('shows up in Jashim\'s history with the total he earned (৳192)', async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    await driverAction(jashim, 'arrive');
    await driverAction(jashim, 'start');
    await driverAction(jashim, 'complete');

    const res = await request(app).get('/api/driver/rides').set('Authorization', `Bearer ${jashim}`);
    assert.equal(res.body.rides.length, 1);
    assert.equal(res.body.rides[0].totalFarePaisa, 19200);
    assert.deepEqual(res.body.rides[0].passengers.map((p) => p.name), ['Nusrat', 'Rafiq']);
  });

  it('keeps a full history of what happened, in order', async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    await driverAction(jashim, 'arrive');
    await driverAction(jashim, 'start');
    await driverAction(jashim, 'complete');

    const ride = await db('rides').first();
    const rideEvents = await db('ride_events').where({ ride_id: ride.id }).whereNull('ride_request_id').orderBy('id');
    assert.deepEqual(
      rideEvents.map((e) => e.type),
      ['RIDE_OPENED', 'RIDE_DRIVER_ARRIVED', 'RIDE_STARTED', 'RIDE_COMPLETED']
    );
  });
});

describe('what each passenger can see', () => {
  it('shows Nusrat her driver, her Tesla and that she is sharing, but not Rafiq\'s details', async () => {
    const { nusrat, nusratRequestId } = await nusratAndRafiqInBullet();

    const res = await myRequest(nusrat, nusratRequestId);
    assert.equal(res.body.request.ride.driverName, 'Jashim');
    assert.equal(res.body.request.ride.vehicle.name, 'Bullet');
    assert.equal(res.body.request.ride.passengerCount, 2);
    assert.ok(!JSON.stringify(res.body).includes('Rafiq'), 'must not reveal other passengers');
  });
});

describe('the group closes when Jashim arrives', () => {
  it("doesn't let Shirin join after Jashim marked arrived", async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    await driverAction(jashim, 'arrive');

    const shirin = await loginAs('shirin');
    const s = await requestRide(shirin, { from: 'Banani', to: 'Gulshan 2' });
    assert.equal(s.body.request.status, 'REQUESTED');
  });
});

describe('invalid moves are rejected', () => {
  it("won't complete a ride that hasn't started", async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    const res = await driverAction(jashim, 'complete');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_TRANSITION');
  });

  it("won't start before Jashim has arrived", async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    const res = await driverAction(jashim, 'start');
    assert.equal(res.status, 409);
  });

  it("won't let Nusrat cancel once the trip has started", async () => {
    const { nusrat, jashim, nusratRequestId } = await nusratAndRafiqInBullet();
    await driverAction(jashim, 'arrive');
    await driverAction(jashim, 'start');

    const res = await request(app)
      .post(`/api/ride-requests/${nusratRequestId}/cancel`)
      .set('Authorization', `Bearer ${nusrat}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_TRANSITION');
  });

  it("won't let Jashim cancel once the trip has started", async () => {
    const { jashim } = await nusratAndRafiqInBullet();
    await driverAction(jashim, 'arrive');
    await driverAction(jashim, 'start');

    const res = await driverAction(jashim, 'cancel');
    assert.equal(res.status, 409);
  });

  it('answers 404 when Jashim has no active ride', async () => {
    const jashim = await loginAs('jashim');
    const res = await driverAction(jashim, 'arrive');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NO_ACTIVE_RIDE');
  });
});

describe('Jashim cancels before starting', () => {
  it('cancels the ride and everyone in it, and Nusrat can request again', async () => {
    const { nusrat, jashim, nusratRequestId } = await nusratAndRafiqInBullet();

    const res = await driverAction(jashim, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.ride.status, 'CANCELLED');
    assert.equal((await myRequest(nusrat, nusratRequestId)).body.request.status, 'CANCELLED');

    const again = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    assert.equal(again.status, 201);
  });
});
