// Fare model from docs/design.md (section 3).
// All money is whole paisa (৳1 = 100 paisa), so there are no decimal rounding errors.

const BASE_FARE_PAISA = 5000; // ৳50
const PER_KM_PAISA = 2000; // ৳20 per km
const POOL_DISCOUNT_PERCENT = 20;

function checkInput(distanceKm, seats) {
  if (!Number.isInteger(distanceKm) || distanceKm <= 0) {
    throw new Error(`distanceKm must be a positive whole number, got ${distanceKm}`);
  }
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new Error(`seats must be a positive whole number, got ${seats}`);
  }
}

// The solo price, with no discount. Shown to the passenger when they request a ride.
function estimateFarePaisa(distanceKm, seats) {
  checkInput(distanceKm, seats);
  return (BASE_FARE_PAISA + PER_KM_PAISA * distanceKm) * seats;
}

// The price actually charged, locked when the ride starts.
// passengerCount = number of separate bookings in the ride. One person booking 2 seats is still 1.
function finalFarePaisa(distanceKm, seats, passengerCount) {
  const subtotal = estimateFarePaisa(distanceKm, seats);
  const isShared = passengerCount >= 2;
  const discount = isShared ? Math.floor((subtotal * POOL_DISCOUNT_PERCENT) / 100) : 0;
  return subtotal - discount;
}

module.exports = {
  BASE_FARE_PAISA,
  PER_KM_PAISA,
  POOL_DISCOUNT_PERCENT,
  estimateFarePaisa,
  finalFarePaisa,
};