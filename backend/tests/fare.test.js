// Pure unit tests: no database, no HTTP. Just the maths from docs/design.md.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { distanceKm, destinationsAreClose } = require('../src/domain/geo');
const { estimateFarePaisa, finalFarePaisa } = require('../src/domain/fare');

// Grid positions from docs/design.md, section 1.
const ZONES = {
  dhanmondi: { x_km: 0, y_km: 0 },
  mohakhali: { x_km: 4, y_km: 4 },
  gulshan1: { x_km: 5, y_km: 4 },
  gulshan2: { x_km: 5, y_km: 6 },
  banani: { x_km: 4, y_km: 7 },
};

describe('distance between zones', () => {
  it("Nusrat's trip, Banani to Mohakhali, is 3 km", () => {
    assert.equal(distanceKm(ZONES.banani, ZONES.mohakhali), 3);
  });

  it("Rafiq's trip, Banani to Gulshan 1, is 4 km", () => {
    assert.equal(distanceKm(ZONES.banani, ZONES.gulshan1), 4);
  });

  it('is the same in both directions', () => {
    assert.equal(distanceKm(ZONES.gulshan1, ZONES.banani), distanceKm(ZONES.banani, ZONES.gulshan1));
  });
});

describe('matching rule: destinations must be within 3 km', () => {
  it('lets Nusrat (Mohakhali) and Rafiq (Gulshan 1) share: 1 km apart', () => {
    assert.equal(destinationsAreClose(ZONES.gulshan1, [ZONES.mohakhali]), true);
  });

  it('allows exactly 3 km (Gulshan 2 is 3 km from Mohakhali)', () => {
    assert.equal(destinationsAreClose(ZONES.gulshan2, [ZONES.mohakhali, ZONES.gulshan1]), true);
  });

  it('rejects Dhanmondi, 8 km from Mohakhali', () => {
    assert.equal(destinationsAreClose(ZONES.dhanmondi, [ZONES.mohakhali]), false);
  });

  it('must be close to EVERY passenger already in the ride', () => {
    // Mohakhali is 1 km from Gulshan 1 but 8 km from Dhanmondi.
    assert.equal(destinationsAreClose(ZONES.mohakhali, [ZONES.gulshan1, ZONES.dhanmondi]), false);
  });
});

describe('fares (in paisa)', () => {
  it('estimates Nusrat alone at ৳110: 50 + 20 × 3', () => {
    assert.equal(estimateFarePaisa(3, 1), 11000);
  });

  it('charges Nusrat ৳88 when she shares with Rafiq (20% off ৳110)', () => {
    assert.equal(finalFarePaisa(3, 1, 2), 8800);
  });

  it('charges Rafiq ৳104 when he shares with Nusrat (20% off ৳130)', () => {
    assert.equal(finalFarePaisa(4, 1, 2), 10400);
  });

  it('gives no discount to a passenger riding alone', () => {
    assert.equal(finalFarePaisa(3, 1, 1), 11000);
  });

  it('does not count one person booking 2 seats as sharing', () => {
    assert.equal(finalFarePaisa(3, 2, 1), 22000);
  });

  it('never charges more than the estimate', () => {
    for (let km = 1; km <= 20; km++) {
      for (let seats = 1; seats <= 3; seats++) {
        for (let passengers = 1; passengers <= 3; passengers++) {
          assert.ok(finalFarePaisa(km, seats, passengers) <= estimateFarePaisa(km, seats));
        }
      }
    }
  });

  it('rejects impossible input instead of returning a wrong price', () => {
    assert.throws(() => estimateFarePaisa(0, 1));
    assert.throws(() => estimateFarePaisa(2.5, 1));
    assert.throws(() => estimateFarePaisa(3, 0));
  });
});