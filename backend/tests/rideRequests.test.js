const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const { request, app, db, resetDatabase, loginAs, zoneId } = require('./helpers');

// Every test starts from a fresh database with the story cast.
beforeEach(resetDatabase);
after(() => db.destroy());

// Sends a ride request as the given user.
async function requestRide(token, { from, to, seats = 1, paymentMethod = 'CASH' }) {
  return request(app)
    .post('/api/ride-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ pickupZoneId: await zoneId(from), dropoffZoneId: await zoneId(to), seats, paymentMethod });
}

describe('GET /api/zones', () => {
  it('lists all 9 Dhaka zones', async () => {
    const res = await request(app).get('/api/zones');
    assert.equal(res.status, 200);
    assert.equal(res.body.zones.length, 9);
    assert.ok(res.body.zones.some((z) => z.name === 'Banani'));
  });
});

describe('POST /api/ride-requests', () => {
  it('lets Nusrat request Banani → Mohakhali and shows her ৳110 estimate', async () => {
    const nusrat = await loginAs('nusrat');
    const res = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.status, 'REQUESTED');
    assert.equal(res.body.request.pickupZone.name, 'Banani');
    assert.equal(res.body.request.dropoffZone.name, 'Mohakhali');
    assert.equal(res.body.request.distanceKm, 3);
    assert.equal(res.body.request.estimatedFarePaisa, 11000);
  });

  it('stops Nusrat from having two active requests at once', async () => {
    const nusrat = await loginAs('nusrat');
    await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const second = await requestRide(nusrat, { from: 'Banani', to: 'Gulshan 1' });

    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'ACTIVE_REQUEST_EXISTS');
  });

  it("refuses TeslaPay when Shirin's ৳50 balance can't cover the fare, but accepts cash", async () => {
    const shirin = await loginAs('shirin');
    const wallet = await requestRide(shirin, { from: 'Banani', to: 'Gulshan 2', paymentMethod: 'WALLET' });
    assert.equal(wallet.status, 400);
    assert.equal(wallet.body.error.code, 'INSUFFICIENT_BALANCE');

    const cash = await requestRide(shirin, { from: 'Banani', to: 'Gulshan 2', paymentMethod: 'CASH' });
    assert.equal(cash.status, 201);
  });

  it('rejects the same pickup and destination', async () => {
    const nusrat = await loginAs('nusrat');
    const res = await requestRide(nusrat, { from: 'Banani', to: 'Banani' });
    assert.equal(res.status, 400);
  });

  it('rejects more seats than Bullet has', async () => {
    const nusrat = await loginAs('nusrat');
    const res = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali', seats: 4 });
    assert.equal(res.status, 400);
  });

  it("doesn't let Jashim (a driver) request a ride", async () => {
    const jashim = await loginAs('jashim');
    const res = await requestRide(jashim, { from: 'Banani', to: 'Mohakhali' });
    assert.equal(res.status, 403);
  });
});

describe("other people's requests", () => {
  it("hides Nusrat's request from Rafiq and doesn't let him cancel it", async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const created = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const id = created.body.request.id;

    const view = await request(app).get(`/api/ride-requests/${id}`).set('Authorization', `Bearer ${rafiq}`);
    const cancel = await request(app)
      .post(`/api/ride-requests/${id}/cancel`)
      .set('Authorization', `Bearer ${rafiq}`);

    assert.equal(view.status, 404);
    assert.equal(cancel.status, 404);
    const stillThere = await db('ride_requests').where({ id }).first();
    assert.equal(stillThere.status, 'REQUESTED');
  });
});

describe('cancelling', () => {
  it('lets Nusrat cancel while waiting, then request again', async () => {
    const nusrat = await loginAs('nusrat');
    const created = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const id = created.body.request.id;

    const cancel = await request(app)
      .post(`/api/ride-requests/${id}/cancel`)
      .set('Authorization', `Bearer ${nusrat}`);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.request.status, 'CANCELLED');

    const again = await requestRide(nusrat, { from: 'Banani', to: 'Gulshan 1' });
    assert.equal(again.status, 201);
  });

  it('rejects cancelling the same request twice', async () => {
    const nusrat = await loginAs('nusrat');
    const created = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const url = `/api/ride-requests/${created.body.request.id}/cancel`;

    await request(app).post(url).set('Authorization', `Bearer ${nusrat}`);
    const second = await request(app).post(url).set('Authorization', `Bearer ${nusrat}`);

    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'INVALID_TRANSITION');
  });

  it('records the history in ride_events', async () => {
    const nusrat = await loginAs('nusrat');
    const created = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const id = created.body.request.id;
    await request(app).post(`/api/ride-requests/${id}/cancel`).set('Authorization', `Bearer ${nusrat}`);

    const events = await db('ride_events').where({ ride_request_id: id }).orderBy('id');
    assert.deepEqual(
      events.map((e) => e.type),
      ['REQUEST_CREATED', 'REQUEST_CANCELLED']
    );
  });
});

describe('GET /api/ride-requests', () => {
  it("shows Nusrat her own history, newest first, and nobody else's", async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const first = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    await request(app)
      .post(`/api/ride-requests/${first.body.request.id}/cancel`)
      .set('Authorization', `Bearer ${nusrat}`);
    await requestRide(nusrat, { from: 'Banani', to: 'Gulshan 1' });
    await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1' });

    const res = await request(app).get('/api/ride-requests').set('Authorization', `Bearer ${nusrat}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.requests.length, 2);
    assert.equal(res.body.requests[0].dropoffZone.name, 'Gulshan 1');
    assert.equal(res.body.requests[1].status, 'CANCELLED');
  });
});
