// ==========================================================
// PLACES.JS - blood banks, hospitals and PIN codes for the map
// ----------------------------------------------------------
//  isHospital()      a blood bank run by a hospital / medical college
//                    (decided from its official name)
//  pinFromBanks()    built-in PIN code lookup, used when the
//                    OpenStreetMap geocoder cannot be reached
//  nearestPin()      PIN code of the area around a point
// All data comes from data/blood-banks.json (official NHP directory).
// ==========================================================

const HOSPITAL_WORDS = /hospital|medical college|medical sciences|institute of medical|aiims|nursing home|health cent|medical centre|medical center|sanatorium|clinic/i;

function isHospital(bank) {
    return HOSPITAL_WORDS.test(bank.name);
}

function hasPosition(bank) {
    return bank.location === "verified" || bank.location === "approximate";
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Finds a PIN code using only the blood bank list:
 *   1. blood banks with exactly this PIN          -> exact
 *   2. otherwise the same first 4, then 3 digits  -> approximate area
 * Returns { lat, lng, label, exact, source } or null.
 */
function pinFromBanks(pin, banks) {
    const located = banks.filter(b => hasPosition(b) && b.pincode);
    for (const length of [6, 4, 3]) {
        const prefix = pin.slice(0, length);
        const matches = located.filter(b => b.pincode.startsWith(prefix));
        if (!matches.length) continue;
        const first = matches[0];
        const exact = length === 6;
        return {
            lat: median(matches.map(b => b.lat)),
            lng: median(matches.map(b => b.lng)),
            state: first.state,
            city: first.city,
            exact,
            label: exact
                ? `${first.city}, ${first.state}`
                : `approximate area of PIN codes starting ${prefix}… (${first.district || first.city}, ${first.state})`,
            source: "built-in PIN list (from the blood bank directory)"
        };
    }
    return null;
}

// PIN code of the nearest listed blood bank within maxKm (or "")
function nearestPin(lat, lng, banks, getDistanceKm, maxKm = 10) {
    let best = "", bestKm = maxKm;
    banks.forEach(b => {
        if (!hasPosition(b) || !b.pincode) return;
        const km = getDistanceKm(lat, lng, b.lat, b.lng);
        if (km <= bestKm) { best = b.pincode; bestKm = km; }
    });
    return best;
}

module.exports = { isHospital, hasPosition, pinFromBanks, nearestPin };
