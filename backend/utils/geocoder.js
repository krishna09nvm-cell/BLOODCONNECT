// ==========================================================
// GEOCODER - address <-> map coordinates
// ----------------------------------------------------------
// Uses Nominatim, the free geocoding service of OpenStreetMap:
//   search : "Kadri, Mangaluru" or "575003"  ->  latitude, longitude
//   reverse: latitude, longitude  ->  address, city, state, PIN
//
// Why does the BACKEND call it (and not the browser)?
//   Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
//   asks every app to:
//     1. send a User-Agent that names the app        -> USER_AGENT below
//     2. make at most 1 request per second           -> waitForTurn()
//     3. not repeat the same request again and again -> cache
//   Doing it here keeps all three rules in one place.
//
// No API key is needed. For a real public website with many users,
// run your own Nominatim server or use a paid provider (e.g. LocationIQ,
// MapTiler, Google Geocoding) - only this file would change.
// Needs Node.js 18+ (built-in fetch) and an internet connection.
// ==========================================================

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

// Put your own contact e-mail here (the policy asks for a way to contact you)
const USER_AGENT = "LifeDrop-BloodDonationFinder/1.0 (BCA college project; contact: your-email@example.com)";

const cache = new Map();        // url -> result (kept while the server runs)
let lastRequestTime = 0;

// Wait so that requests are at least 1.1 seconds apart
async function waitForTurn() {
    const wait = lastRequestTime + 1100 - Date.now();
    lastRequestTime = Math.max(Date.now(), lastRequestTime + 1100);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
}

async function callNominatim(path, params) {
    const url = `${NOMINATIM_URL}/${path}?` + new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        "accept-language": "en",
        ...params
    });

    if (cache.has(url)) return cache.get(url);

    await waitForTurn();
    const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000) // give up after 10 seconds
    });
    if (!response.ok) {
        throw new Error(`Map search service answered ${response.status}`);
    }
    const data = await response.json();
    cache.set(url, data);
    return data;
}

// Turn one Nominatim result into the simple shape the website uses
function simplifyPlace(result) {
    const a = result.address || {};
    const city = a.city || a.town || a.municipality || a.village || a.suburb || a.county || "";
    return {
        type: "place",
        name: result.name || city || result.display_name.split(",")[0],
        displayName: result.display_name,
        lat: Number(result.lat),
        lng: Number(result.lon),
        address: {
            road: a.road || "",
            area: a.neighbourhood || a.suburb || a.quarter || "",
            city,
            district: a.state_district || a.county || "",
            state: a.state || a.territory || "",
            pincode: a.postcode || ""
        },
        kind: result.type || result.category || "",
        source: "OpenStreetMap (Nominatim)"
    };
}

/**
 * Search for places in India.
 *   "575003"           -> searched as a PIN code
 *   anything else      -> free text (address, area, city, state...)
 * Returns up to 5 places.
 */
async function searchPlaces(query) {
    const text = query.trim();
    const params = /^\d{6}$/.test(text)
        ? { postalcode: text, country: "India", limit: "5" }
        : { q: text, countrycodes: "in", limit: "5" };
    const results = await callNominatim("search", params);
    return results.map(simplifyPlace);
}

// Coordinates -> address (or null if nothing is there, e.g. the sea)
async function reversePlace(lat, lng) {
    const result = await callNominatim("reverse", { lat: String(lat), lon: String(lng), zoom: "16" });
    if (!result || result.error) return null;
    return simplifyPlace(result);
}

module.exports = { searchPlaces, reversePlace };
