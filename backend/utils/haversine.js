// ==========================================================
// HAVERSINE FORMULA
// ----------------------------------------------------------
// Calculates the straight-line ("as the crow flies") distance
// between two points on Earth using their latitude/longitude.
//
//   a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)
//   c = 2 · atan2(√a, √(1−a))
//   distance = R · c          (R = Earth's radius = 6371 km)
// ==========================================================

const EARTH_RADIUS_KM = 6371;

// Convert degrees to radians (Math.sin/cos work with radians)
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Returns the distance in kilometres between two coordinates.
 * @param {number} lat1 - latitude of point 1
 * @param {number} lng1 - longitude of point 1
 * @param {number} lat2 - latitude of point 2
 * @param {number} lng2 - longitude of point 2
 */
function getDistanceKm(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
}

module.exports = { getDistanceKm };
