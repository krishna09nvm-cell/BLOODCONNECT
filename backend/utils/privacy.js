// ==========================================================
// DONOR PRIVACY
// ----------------------------------------------------------
// A donor's exact latitude/longitude is stored ONLY on the
// server (data/donors.json). It is used to calculate distances,
// but it is never sent to the browser.
//
// What the browser gets instead:
//   * approxLatitude / approxLongitude - rounded to 2 decimals
//     (a grid of about 1.1 km), good enough to show the area on
//     a map, not good enough to find someone's house.
//   * distanceKm - rounded to the nearest 0.5 km (minimum 0.5),
//     so the exact position can't be worked out from distances.
// ==========================================================

// 2 decimal places of latitude ~ 1.1 km
function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
}

// 3.27 km -> 3.5 km, 0.2 km -> 0.5 km
function roundDistance(km) {
    return Math.max(0.5, Math.round(km * 2) / 2);
}

// Copy of a donor that is safe to send to any visitor
function publicDonor(donor, exactDistanceKm) {
    const { latitude, longitude, ...safe } = donor;

    if (typeof latitude === "number" && typeof longitude === "number") {
        safe.approxLatitude = roundCoordinate(latitude);
        safe.approxLongitude = roundCoordinate(longitude);
    }
    if (exactDistanceKm !== undefined) {
        safe.distanceKm = roundDistance(exactDistanceKm);
    }
    safe.type = "donor";
    return safe;
}

module.exports = { publicDonor, roundDistance, roundCoordinate };
