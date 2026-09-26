
const MAX_DESTINATION_GAP_KM = 3;

function distanceKm(from, to) {
  return Math.abs(from.x_km - to.x_km) + Math.abs(from.y_km - to.y_km);
}

function destinationsAreClose(newDropoff, existingDropoffs) {
  return existingDropoffs.every(
    (dropoff) => distanceKm(newDropoff, dropoff) <= MAX_DESTINATION_GAP_KM
  );
}

module.exports = { MAX_DESTINATION_GAP_KM, distanceKm, destinationsAreClose };