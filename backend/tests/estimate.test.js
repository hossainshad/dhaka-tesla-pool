const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { request, app, db, resetDatabase, loginAs, zoneId } = require('./helpers');

before(resetDatabase);
after(() => db.destroy());

async function estimate(token, query) {
  return request(app).get('/api/ride-requests/estimate').query(query).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/ride-requests/estimate', () => {
  it('quotes Nusrat ৳110 alone and ৳88 if she shares', async () => {
    const nusrat = await loginAs('nusrat');
    const res = await estimate(nusrat, {
      pickupZoneId: await zoneId('Banani'),
      dropoffZoneId: await zoneId('Mohakhali'),
      seats: 1,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.estimate, { distanceKm: 3, estimatedFarePaisa: 11000, pooledFarePaisa: 8800 });
  });

  it('does not create a ride request', async () => {
    const nusrat = await loginAs('nusrat');
    await estimate(nusrat, { pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Gulshan 1') });

    const { count } = await db('ride_requests').count('* as count').first();
    assert.equal(Number(count), 0);
  });

  it('rejects the same pickup and destination', async () => {
    const nusrat = await loginAs('nusrat');
    const banani = await zoneId('Banani');
    const res = await estimate(nusrat, { pickupZoneId: banani, dropoffZoneId: banani });
    assert.equal(res.status, 400);
  });
});
