// The heart of the challenge: Jashim's Bullet, shared seats, and the last-seat race.
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const { request, app, db, resetDatabase, loginAs, zoneId } = require('./helpers');

beforeEach(resetDatabase);
after(() => db.destroy());

// ---- small helpers so each test reads like the story ----

async function requestRide(token, { from, to, seats = 1 }) {
  const res = await request(app)
    .post('/api/ride-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ pickupZoneId: await zoneId(from), dropoffZoneId: await zoneId(to), seats, paymentMethod: 'CASH' });
  return res;
}

function goOnline(token, isOnline = true) {
  return request(app).patch('/api/driver/status').set('Authorization', `Bearer ${token}`).send({ isOnline });
}

function accept(token, requestId) {
  return request(app).post(`/api/driver/requests/${requestId}/accept`).set('Authorization', `Bearer ${token}`);
}

function cancel(token, requestId) {
  return request(app).post(`/api/ride-requests/${requestId}/cancel`).set('Authorization', `Bearer ${token}`);
}

async function currentRide(token) {
  const res = await request(app).get('/api/driver/ride').set('Authorization', `Bearer ${token}`);
  return res.body.ride;
}

// Jashim goes online and accepts the given request, opening a ride.
async function jashimAccepts(requestId) {
  const jashim = await loginAs('jashim');
  await goOnline(jashim);
  const res = await accept(jashim, requestId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return jashim;
}

// ---- tests ----

describe('Jashim accepting rides', () => {
  it('must be online to accept', async () => {
    const nusrat = await loginAs('nusrat');
    const jashim = await loginAs('jashim');
    const req = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });

    const res = await accept(jashim, req.body.request.id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DRIVER_OFFLINE');
  });

  it("opens a ride in Bullet when he accepts Nusrat's request", async () => {
    const nusrat = await loginAs('nusrat');
    const req = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(req.body.request.id);

    const ride = await currentRide(jashim);
    assert.equal(ride.status, 'OPEN');
    assert.equal(ride.vehicle.name, 'Bullet');
    assert.equal(ride.seatsTaken, 1);
    assert.equal(ride.seatsFree, 2);
    assert.deepEqual(ride.passengers.map((p) => p.name), ['Nusrat']);

    const mine = await request(app)
      .get(`/api/ride-requests/${req.body.request.id}`)
      .set('Authorization', `Bearer ${nusrat}`);
    assert.equal(mine.body.request.status, 'MATCHED');
    assert.equal(mine.body.request.rideId, ride.id);
  });

  it('cannot go offline during an active ride', async () => {
    const nusrat = await loginAs('nusrat');
    const req = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(req.body.request.id);

    const res = await goOnline(jashim, false);
    assert.equal(res.status, 409);
  });

  it("doesn't let passengers use driver actions", async () => {
    const nusrat = await loginAs('nusrat');
    const res = await goOnline(nusrat);
    assert.equal(res.status, 403);
  });
});

describe('pooling Nusrat and Rafiq', () => {
  it('puts Rafiq into the same Bullet automatically: same pickup, destinations 1 km apart', async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(n.body.request.id);

    const r = await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1' });

    assert.equal(r.status, 201);
    assert.equal(r.body.request.status, 'MATCHED');
    const ride = await currentRide(jashim);
    assert.equal(r.body.request.rideId, ride.id);
    assert.deepEqual(ride.passengers.map((p) => p.name), ['Nusrat', 'Rafiq']);
    assert.equal(ride.seatsTaken, 2);
  });

  it("doesn't pool a destination too far away (Dhanmondi is 8 km from Mohakhali)", async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    await jashimAccepts(n.body.request.id);

    const r = await requestRide(rafiq, { from: 'Banani', to: 'Dhanmondi' });
    assert.equal(r.body.request.status, 'REQUESTED');
  });

  it("doesn't pool a different pickup zone", async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    await jashimAccepts(n.body.request.id);

    const r = await requestRide(rafiq, { from: 'Gulshan 2', to: 'Gulshan 1' });
    assert.equal(r.body.request.status, 'REQUESTED');
  });

  it('shows Jashim only the waiting requests that fit his open ride', async () => {
    const rafiq = await loginAs('rafiq');
    const shirin = await loginAs('shirin');
    const nusrat = await loginAs('nusrat');
    // Rafiq and Shirin ask BEFORE Jashim has a ride, so they both wait.
    await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1' });
    await requestRide(shirin, { from: 'Banani', to: 'Dhanmondi' });
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(n.body.request.id);

    const res = await request(app).get('/api/driver/requests').set('Authorization', `Bearer ${jashim}`);
    assert.deepEqual(res.body.requests.map((r) => r.passengerName), ['Rafiq']);
  });
});

describe("Bullet's capacity (3 seats)", () => {
  it('never takes more passengers than seats', async () => {
    const rafiq = await loginAs('rafiq');
    const nusrat = await loginAs('nusrat');
    // Rafiq books 2 seats: 1 seat left.
    const r = await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1', seats: 2 });
    const jashim = await jashimAccepts(r.body.request.id);

    // Nusrat wants 2 seats: doesn't fit, so she waits...
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali', seats: 2 });
    assert.equal(n.body.request.status, 'REQUESTED');

    // ...and Jashim can't squeeze her in either.
    const res = await accept(jashim, n.body.request.id);
    assert.equal(res.status, 409);
    assert.equal((await currentRide(jashim)).seatsTaken, 2);
  });

  it('is also protected by the database itself (CHECK constraint)', async () => {
    const nusrat = await loginAs('nusrat');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    await jashimAccepts(n.body.request.id);

    await assert.rejects(
      db('rides').update({ seats_taken: 4 }),
      /rides_seats_within_capacity/
    );
  });
});

describe('the last-seat race: Nusrat and Shirin at the same instant', () => {
  it('gives the last seat to exactly one of them, every time', async () => {
    for (let round = 1; round <= 5; round++) {
      await resetDatabase();
      const rafiq = await loginAs('rafiq');
      const nusrat = await loginAs('nusrat');
      const shirin = await loginAs('shirin');

      // Rafiq takes 2 of Bullet's 3 seats: exactly 1 seat left.
      const r = await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1', seats: 2 });
      const jashim = await jashimAccepts(r.body.request.id);

      // Both ask at the same moment. Both would fit on their own.
      const [n, s] = await Promise.all([
        requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' }),
        requestRide(shirin, { from: 'Banani', to: 'Gulshan 2' }),
      ]);

      const statuses = [n.body.request.status, s.body.request.status].sort();
      assert.deepEqual(statuses, ['MATCHED', 'REQUESTED'], `round ${round}`);

      const ride = await currentRide(jashim);
      assert.equal(ride.seatsTaken, 3, `round ${round}`);
      const seatsOfPassengers = ride.passengers.reduce((sum, p) => sum + p.seats, 0);
      assert.equal(seatsOfPassengers, ride.seatsTaken, `round ${round}`);
    }
  });

  it('handles Jashim double-clicking "accept": one ride, one seat', async () => {
    const nusrat = await loginAs('nusrat');
    const jashim = await loginAs('jashim');
    await goOnline(jashim);
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });

    const results = await Promise.all([accept(jashim, n.body.request.id), accept(jashim, n.body.request.id)]);

    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const rides = await db('rides');
    assert.equal(rides.length, 1);
    assert.equal(rides[0].seats_taken, 1);
  });
});

describe('cancelling after being matched', () => {
  it("frees Rafiq's seat and keeps Nusrat's trip going", async () => {
    const nusrat = await loginAs('nusrat');
    const rafiq = await loginAs('rafiq');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(n.body.request.id);
    const r = await requestRide(rafiq, { from: 'Banani', to: 'Gulshan 1' });

    const res = await cancel(rafiq, r.body.request.id);
    assert.equal(res.status, 200);

    const ride = await currentRide(jashim);
    assert.equal(ride.status, 'OPEN');
    assert.equal(ride.seatsTaken, 1);
    assert.deepEqual(ride.passengers.map((p) => p.name), ['Nusrat']);
  });

  it('cancels the whole ride when the last passenger cancels', async () => {
    const nusrat = await loginAs('nusrat');
    const n = await requestRide(nusrat, { from: 'Banani', to: 'Mohakhali' });
    const jashim = await jashimAccepts(n.body.request.id);

    await cancel(nusrat, n.body.request.id);

    assert.equal(await currentRide(jashim), null);
    const ride = await db('rides').first();
    assert.equal(ride.status, 'CANCELLED');
    assert.equal(ride.seats_taken, 0);
  });
});
