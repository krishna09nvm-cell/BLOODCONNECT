// ==========================================================
// BLOOD DONATION & EMERGENCY DONOR FINDER - BACKEND
// Node.js + Express.js REST API
// ----------------------------------------------------------
// Run:  npm install   then   node server.js
// Open: http://localhost:5000   (the website is served too!)
// ==========================================================

require("./utils/env");          // reads backend/.env (secrets stay on the server)
const express = require("express");
const cors = require("cors");
const path = require("path");

const { getDistanceKm } = require("./utils/haversine");
const { readData, writeData, getNextId } = require("./utils/db");
const { publicDonor } = require("./utils/privacy");
const { donorGroupsFor, CAN_RECEIVE_FROM } = require("./utils/compatibility");
const { searchPlaces, reversePlace } = require("./utils/geocoder");
const { campStatus, makeDemoCamps } = require("./utils/camps");
const { isHospital, hasPosition: bankHasPosition, pinFromBanks, nearestPin } = require("./utils/places");
const { requireAuth, sessionUser, readUsers, writeUsers } = require("./utils/auth");
const createAuthRouter = require("./routes/auth");
const createChatRouter = require("./routes/chat");
const createRouteRouter = require("./routes/route");
const createAdminRouter = require("./routes/admin");
const { sessionAdmin } = require("./utils/admin-auth");
const notify = require("./utils/notifications");
const { emailConfig, readLog } = require("./utils/email");
const { idempotent } = require("./utils/idempotency");

// Official list of Indian States/UTs and their cities (LGD).
// The SAME file is used by the frontend dropdowns.
const INDIA_LOCATIONS = require("../frontend/js/india-locations.js");

// Official blood bank directory (National Health Portal, data.gov.in).
// Read once at start-up - it is reference data, not edited by users.
// Built by tools/build-bloodbanks.py
const BLOOD_BANK_DATA = require("./data/blood-banks.json");
const BLOOD_BANKS = BLOOD_BANK_DATA.bloodBanks;

// Fictional EDUCATIONAL profiles (universal donor / recipient / rare groups).
// Kept in their own file, NOT in donors.json, so they never appear in the
// distance search, the donor list or the homepage counts.
const EDUCATION_DATA = require("./data/education-profiles.json");
const PROFILE_CATEGORIES = ["universal-donor", "universal-recipient", "rare"];

const app = express();
const PORT = Number(process.env.PORT) || 5000;   // hosting services set PORT

// File names inside the /data folder
const DONORS_FILE = "donors.json";
const REQUESTS_FILE = "requests.json";

// The 8 valid blood groups
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];


// ================================
// MIDDLEWARE
// ================================

// Behind a hosting proxy (Render, Railway, Nginx ...) the real visitor IP and
// HTTPS status arrive in X-Forwarded-* headers. Needed for per-visitor rate
// limits and for "Secure" cookies. TRUST_PROXY=1 (default in production).
const TRUST_PROXY = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "");
if (TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

app.use(cors());              // allow requests from other ports (e.g. Live Server)
app.use(express.json());      // read JSON request bodies

const FRONTEND = path.join(__dirname, "..", "frontend");

// The first page is the Welcome / Login page
app.get("/", (req, res) => res.sendFile(path.join(FRONTEND, "welcome.html")));

// The dashboard is only for logged-in users (the API checks again)
app.get("/dashboard.html", (req, res, next) => {
    if (sessionUser(req)) return next();
    res.redirect("/login.html?next=dashboard.html");
});

// The admin dashboard: admins only (every /api/admin call is checked again).
// It is not linked anywhere on the public website.
app.get("/admin.html", (req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    if (sessionAdmin(req)) return next();
    res.redirect("/admin-login.html");
});
app.get("/admin-login.html", (req, res, next) => { res.setHeader("X-Robots-Tag", "noindex, nofollow"); next(); });

// Serve the frontend folder, so http://localhost:5000 opens the website
app.use(express.static(FRONTEND));

app.get("/googledb8b31b1705cd64b.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "googledb8b31b1705cd64b.html"));
});


// ================================
// HELPER FUNCTIONS
// ================================

// In a URL, "+" means "space". So "A+" may arrive as "A " if the
// frontend forgot to encode it (it should send "A%2B").
// This function turns spaces back into "+" BEFORE trimming.
function readBloodGroupQuery(value) {
    if (!value) return "";
    const fixed = value.toString().replace(/ /g, "+");
    return fixed.trim().toUpperCase();
}

// Find a state/UT by name (case-insensitive). Returns the state object or null.
function findState(name) {
    if (!name) return null;
    const lower = name.toString().trim().toLowerCase();
    return INDIA_LOCATIONS.find(s => s.name.toLowerCase() === lower) || null;
}

// Check that a city really belongs to the given state.
// Returns { state, city, district } with the official spelling, or null.
function findLocation(stateName, cityName, district) {
    const state = findState(stateName);
    if (!state || !cityName) return null;
    const lower = cityName.toString().trim().toLowerCase();
    const matches = state.cities.filter(c => c[0].toLowerCase() === lower);
    const city = matches.find(c => district && c[1].toLowerCase() === district.toLowerCase()) || matches[0];
    if (!city) return null;
    return { state: state.name, city: city[0], district: city[1] };
}

// Validate donor fields. Returns an error message, or null if OK.
// checkLocation = false when an update keeps the saved location.
function validateDonor(body, checkLocation = true) {
    const { name, age, bloodGroup, phone, state, city, availability, latitude, longitude } = body;

    if (!name || !age || !bloodGroup || !phone || !state || !city || !availability) {
        return "Please provide all required donor information.";
    }
    if (!findState(state)) {
        return "Please select a valid State/Union Territory.";
    }
    if (!findLocation(state, city, body.district)) {
        return `"${city}" is not a city of ${state}. Please select a city from the list.`;
    }
    if (!BLOOD_GROUPS.includes(bloodGroup)) {
        return "Invalid blood group.";
    }
    if (!/^[0-9]{10}$/.test(phone)) {
        return "Phone number must contain exactly 10 digits.";
    }
    if (Number(age) < 18 || Number(age) > 65) {
        return "Donor age must be between 18 and 65.";
    }

    if (!checkLocation) return null;

    // Location is required for the "nearby" search to work
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (latitude === undefined || longitude === undefined || latitude === "" || longitude === "" ||
        isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return "Please set a valid location (latitude and longitude).";
    }

    return null; // no errors
}

// Build a clean donor object from the request body
// (exact latitude/longitude are stored on the server only - see utils/privacy.js)
function buildDonor(body) {
    const place = findLocation(body.state, body.city, body.district);
    return {
        name: body.name.trim(),
        age: Number(body.age),
        bloodGroup: body.bloodGroup,
        phone: body.phone.trim(),
        state: place.state,          // official spelling from the LGD list
        city: place.city,
        district: place.district,
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        availability: body.availability,
        otherInfo: (body.otherInfo || "").trim()
    };
}


// ================================
// HOME ROUTE (API health check)
// ================================

// Health check for hosting services (no data, no secrets)
app.get("/api/health", (req, res) => res.status(200).json({ ok: true }));

app.get("/api", (req, res) => {
    res.status(200).json({ message: "Blood Donation Backend is Running!" });
});


// ================================
// GET - STATS (for homepage)
// ================================

// Demo records ("isDemo": true) are fictional test data. The homepage
// numbers count REAL records only, and report demo records separately.
app.get("/api/stats", (req, res) => {
    const allDonors = readData(DONORS_FILE);
    const allRequests = readData(REQUESTS_FILE);
    const donors = allDonors.filter(d => !d.isDemo);
    const demoDonors = allDonors.filter(d => d.isDemo);
    const requests = allRequests.filter(r => !r.isDemo);

    // Count unique cities (same city name in two states counts twice)
    const cities = new Set(donors.map(d => `${d.state || ""}|${d.city}`.toLowerCase()));

    // Count donors per blood group, e.g. { "A+": 3, "O-": 1, ... }
    const byBloodGroup = {};
    const demoByBloodGroup = {};
    BLOOD_GROUPS.forEach(group => {
        byBloodGroup[group] = donors.filter(d => d.bloodGroup === group).length;
        demoByBloodGroup[group] = demoDonors.filter(d => d.bloodGroup === group).length;
    });

    res.status(200).json({
        totalDonors: donors.length,
        availableDonors: donors.filter(d => d.availability === "Available").length,
        emergencyRequests: requests.filter(r => r.status === "Open").length,
        totalRequests: requests.length,
        cities: cities.size,
        byBloodGroup,
        demoDonors: demoDonors.length,
        demoByBloodGroup,
        demoRequests: allRequests.length - requests.length
    });
});


// ================================
// LOCATION SEARCH HELPERS
// ================================

// Read lat/lng from the query string. Returns null if invalid.
function readCenter(query) {
    const lat = Number(query.lat);
    const lng = Number(query.lng);
    if (query.lat === undefined || query.lng === undefined || isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }
    return { lat, lng };
}

// Read the distance filter.
//   minKm = 0  and maxKm = 10    -> "Within 10 km"
//   minKm = 50 and maxKm = null  -> "More than 50 km"
//   minKm = 0  and maxKm = null  -> "All distances"
// Old URLs that send ?radius=25 still work.
function readDistanceRange(query) {
    const minKm = Math.max(0, Number(query.minKm) || 0);
    const rawMax = query.maxKm !== undefined ? query.maxKm : query.radius;
    const maxKm = rawMax === undefined || rawMax === "" || rawMax === "any" ? null : Number(rawMax);
    return { minKm, maxKm: maxKm === null || isNaN(maxKm) ? null : maxKm };
}

function inRange(distance, range) {
    if (range.minKm > 0 && distance <= range.minKm) return false;      // "More than 50 km"
    if (range.maxKm !== null && distance > range.maxKm) return false;  // "Within 10 km"
    return true;
}

// Donors with their exact distance from the centre (exact values stay here)
function donorsWithDistance(center, groups) {
    return readData(DONORS_FILE)
        .filter(d => typeof d.latitude === "number" && typeof d.longitude === "number")
        .filter(d => !groups || groups.includes(d.bloodGroup))
        .map(d => ({ donor: d, exact: getDistanceKm(center.lat, center.lng, d.latitude, d.longitude) }))
        .sort((a, b) => a.exact - b.exact);
}

// Blood banks with a usable location ("verified" or "approximate"), plus distance
function bloodBanksWithDistance(center) {
    return BLOOD_BANKS
        .filter(b => b.location === "verified" || b.location === "approximate")
        .map(b => ({ ...b, type: "bloodBank", distanceKm: Number(getDistanceKm(center.lat, center.lng, b.lat, b.lng).toFixed(1)) }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
}


// ================================
// GET - LOCATION SEARCH: DONORS + BLOOD BANKS (Haversine)
// Example: /api/search?lat=12.91&lng=74.85&maxKm=25&bloodGroup=A%2B&compatible=true
//   minKm / maxKm   distance filter (see readDistanceRange)
//   bloodGroup      patient's blood group (optional)
//   compatible=true also show donors of compatible groups
//   type            all | donors | bloodBanks
// ================================

const MAX_BLOOD_BANKS = 50; // a big city can have 100+ blood banks

app.get("/api/search", (req, res) => {
    const center = readCenter(req.query);
    if (!center) {
        return res.status(400).json({ message: "Please provide valid lat and lng values." });
    }

    const range = readDistanceRange(req.query);
    const bloodGroup = readBloodGroupQuery(req.query.bloodGroup);
    const compatible = req.query.compatible === "true";
    const type = req.query.type || "all";
    const groups = donorGroupsFor(bloodGroup, compatible);

    // ----- Donors -----
    const allDonors = donorsWithDistance(center, groups);
    const donors = type === "bloodBanks" ? [] : allDonors
        .filter(item => inRange(item.exact, range))
        .map(item => publicDonor(item.donor, item.exact));

    // How many matching donors are within 50 km?
    // (the page uses this to offer "search farther away")
    const donorsWithin50 = allDonors.filter(item => item.exact <= 50).length;
    const nearestDonorKm = allDonors.length ? Number(allDonors[0].exact.toFixed(1)) : null;

    // ----- Blood banks -----
    let bloodBanks = [];
    let bloodBanksTotal = 0;
    if (type !== "donors") {
        const matching = bloodBanksWithDistance(center).filter(b => inRange(b.distanceKm, range));
        bloodBanksTotal = matching.length;
        bloodBanks = matching.slice(0, MAX_BLOOD_BANKS);
    }

    res.status(200).json({
        center,
        range,
        bloodGroup: bloodGroup || "All",
        donorGroups: groups || BLOOD_GROUPS,
        donors,
        donorCount: donors.length,
        donorsWithin50,
        nearestDonorKm: nearestDonorKm === null ? null : Math.max(0.5, Math.round(nearestDonorKm * 2) / 2),
        bloodBanks,
        bloodBanksTotal,
        bloodBankSource: BLOOD_BANK_DATA.meta
    });
});


// ================================
// GET - NEARBY DONORS (kept for older pages)
// Example: /api/donors/nearby?lat=12.91&lng=74.85&radius=10&bloodGroup=O%2B
// NOTE: this route must come BEFORE /api/donors/:id
//       otherwise Express thinks "nearby" is an id.
// ================================

app.get("/api/donors/nearby", (req, res) => {
    const center = readCenter(req.query);
    if (!center) {
        return res.status(400).json({ message: "Please provide valid lat and lng values." });
    }
    const range = readDistanceRange(req.query);
    const bloodGroup = readBloodGroupQuery(req.query.bloodGroup);

    const results = donorsWithDistance(center, bloodGroup ? [bloodGroup] : null)
        .filter(item => inRange(item.exact, range))
        .map(item => publicDonor(item.donor, item.exact));

    res.status(200).json({
        message: "Nearby donors retrieved successfully!",
        center,
        range,
        bloodGroup: bloodGroup || "All",
        count: results.length,
        donors: results
    });
});


// ================================
// GET - BLOOD BANKS BY STATE / CITY (no location needed)
// Example: /api/bloodbanks?state=Karnataka&city=Udupi
// Also lists banks whose map position could not be verified.
// ================================

// Make place names comparable: "Bengaluru (BBMP)" -> "bengaluru",
// "Lakshadweep District" -> "lakshadweep", "Dakshina-Kannada" -> "dakshinakannada"
function placeKey(name) {
    return (name || "").toString().toLowerCase()
        .replace(/\(.*?\)/g, "")
        .replace(/\bdistrict\b/g, "")
        .replace(/[^a-z]/g, "");
}

app.get("/api/bloodbanks", (req, res) => {
    const state = (req.query.state || "").trim().toLowerCase();
    const city = placeKey(req.query.city);
    const district = placeKey(req.query.district);

    if (!state) {
        return res.status(400).json({ message: "Please choose a state." });
    }

    // The directory's city/district names don't always match the LGD
    // spelling, so a blood bank matches on its city OR its district.
    const results = BLOOD_BANKS
        .filter(b => b.state.toLowerCase() === state)
        .filter(b => !city ||
            placeKey(b.city) === city ||
            (district && placeKey(b.district) === district))
        .map(b => ({ ...b, type: "bloodBank" }));

    res.status(200).json({ count: results.length, bloodBanks: results, bloodBankSource: BLOOD_BANK_DATA.meta });
});


// ================================
// GET - ALL DONORS (with optional search)
// Example: /api/donors?bloodGroup=B%2B&state=Karnataka&city=Udupi
// ================================

app.get("/api/donors", (req, res) => {
    let donors = readData(DONORS_FILE);

    const bloodGroup = readBloodGroupQuery(req.query.bloodGroup);
    const state = (req.query.state || "").trim().toLowerCase();
    const city = (req.query.city || "").trim().toLowerCase();
    // Free-text search: every word must appear in the name, blood group,
    // city, district or state. e.g. "meera", "o-", "kolkata", "kabir rajasthan"
    const words = (req.query.q || "").toString().toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (bloodGroup) {
        donors = donors.filter(d => d.bloodGroup === bloodGroup);
    }
    if (words.length) {
        donors = donors.filter(d => {
            const text = `${d.name} ${d.bloodGroup} ${d.city} ${d.district || ""} ${d.state || ""}`.toLowerCase();
            return words.every(w => text.includes(w));
        });
    }
    if (state) {
        donors = donors.filter(d => (d.state || "").toLowerCase() === state);
    }
    if (city) {
        // exact match, because the city comes from the dropdown
        donors = donors.filter(d => (d.city || "").toLowerCase() === city);
    }

    // Alphabetical by name
    donors.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({
        message: "Donors retrieved successfully!",
        count: donors.length,
        donors: donors.map(d => publicDonor(d)) // no exact coordinates
    });
});


// ================================
// GET - SINGLE DONOR
// ================================

app.get("/api/donors/:id", (req, res) => {
    const id = Number(req.params.id);
    const donor = readData(DONORS_FILE).find(d => d.id === id);

    if (!donor) {
        return res.status(404).json({ message: "Donor not found." });
    }

    // Even the edit page only gets the approximate location
    res.status(200).json({ message: "Donor retrieved successfully!", donor: publicDonor(donor) });
});


// ================================
// POST - CREATE DONOR
// ================================

app.post("/api/donors", idempotent, async (req, res) => {
    const error = validateDonor(req.body);
    if (error) {
        return res.status(400).json({ message: error });
    }

    const donors = readData(DONORS_FILE);

    const newDonor = {
        id: getNextId(donors),
        ...buildDonor(req.body),
        reference: notify.makeReference("DNR"),
        createdAt: new Date().toISOString()
    };

    donors.push(newDonor);
    writeData(DONORS_FILE, donors);

    // Logged in? Confirm by e-mail (only after the donor was saved)
    const user = sessionUser(req);
    const email = user ? await notify.formConfirmation(user, `donor:${newDonor.id}`, {
        formType: "Blood donor registration", title: "Your donor registration was received", reference: newDonor.reference, when: newDonor.createdAt,
        paragraphs: ["Thank you for registering as a blood donor. People who need blood can now find you in the donor search (only your approximate area is shown)."],
        details: [["Donor name", newDonor.name], ["Blood group", newDonor.bloodGroup], ["City", `${newDonor.city}, ${newDonor.state}`], ["Availability", newDonor.availability]],
        note: "Your phone number is shown only to people searching for donors. You can update or remove your record any time.",
        buttonText: "Find blood donation camps", buttonUrl: `${notify.T.appUrl()}/camps.html`
    }) : null;

    res.status(201).json({ message: "Donor registered successfully!", donor: publicDonor(newDonor), reference: newDonor.reference, email, emailNote: notify.emailNote(email) });
});


// ================================
// PUT - UPDATE DONOR
// ================================

app.put("/api/donors/:id", async (req, res) => {
    const id = Number(req.params.id);
    const donors = readData(DONORS_FILE);
    const index = donors.findIndex(d => d.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Donor not found." });
    }

    // Demo records are fictional: editing one could make it look like a real donor
    if (donors[index].isDemo) {
        return res.status(403).json({ message: "Demo records can't be edited. Delete it, or register a real donor instead." });
    }

    // The edit page only knows the approximate location. Unless the donor
    // moved the pin (locationChanged = true), keep the saved exact location.
    const locationChanged = req.body.locationChanged === true;

    const error = validateDonor(req.body, locationChanged);
    if (error) {
        return res.status(400).json({ message: error });
    }

    const updated = buildDonor(req.body);
    if (!locationChanged) {
        updated.latitude = donors[index].latitude;
        updated.longitude = donors[index].longitude;
    }

    // Keep id and createdAt, replace everything else
    donors[index] = { ...donors[index], ...updated, updatedAt: new Date().toISOString() };
    writeData(DONORS_FILE, donors);

    const user = sessionUser(req);
    const d = donors[index];
    const email = user ? await notify.formConfirmation(user, `donor-update:${d.id}:${d.updatedAt}`, {
        formType: "Blood donor details updated", title: "Your donor details were updated", reference: d.reference, when: d.updatedAt,
        paragraphs: ["The changes to this donor record were saved."],
        details: [["Donor name", d.name], ["Blood group", d.bloodGroup], ["City", `${d.city}, ${d.state}`], ["Availability", d.availability]]
    }) : null;

    res.status(200).json({ message: "Donor updated successfully!", donor: publicDonor(d), email, emailNote: notify.emailNote(email) });
});


// ================================
// DELETE - DELETE DONOR
// ================================

app.delete("/api/donors/:id", (req, res) => {
    const id = Number(req.params.id);
    const donors = readData(DONORS_FILE);
    const index = donors.findIndex(d => d.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Donor not found." });
    }

    const deletedDonor = donors.splice(index, 1)[0];
    writeData(DONORS_FILE, donors);

    res.status(200).json({ message: "Donor deleted successfully!", donor: publicDonor(deletedDonor) });
});


// ================================
// GET - EMERGENCY REQUESTS
// Example: /api/requests?bloodGroup=O-&status=Open
// ================================

app.get("/api/requests", (req, res) => {
    let requests = readData(REQUESTS_FILE);

    const bloodGroup = readBloodGroupQuery(req.query.bloodGroup);
    const status = req.query.status;

    if (bloodGroup) requests = requests.filter(r => r.bloodGroup === bloodGroup);
    if (status) requests = requests.filter(r => r.status === status);

    // Newest requests first
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
        message: "Emergency requests retrieved successfully!",
        count: requests.length,
        requests
    });
});


// ================================
// POST - CREATE EMERGENCY REQUEST
// ================================

app.post("/api/requests", idempotent, async (req, res) => {
    const { patientName, bloodGroup, units, hospital, state, city, contactPhone, urgency, notes } = req.body;

    if (!patientName || !bloodGroup || !units || !hospital || !state || !city || !contactPhone || !urgency) {
        return res.status(400).json({ message: "Please fill in all required fields." });
    }
    const place = findLocation(state, city, req.body.district);
    if (!place) {
        return res.status(400).json({ message: "Please select a valid state and city from the list." });
    }
    if (!BLOOD_GROUPS.includes(bloodGroup)) {
        return res.status(400).json({ message: "Invalid blood group." });
    }
    if (!/^[0-9]{10}$/.test(contactPhone)) {
        return res.status(400).json({ message: "Contact phone must contain exactly 10 digits." });
    }
    if (Number(units) < 1 || Number(units) > 10) {
        return res.status(400).json({ message: "Units must be between 1 and 10." });
    }

    const requests = readData(REQUESTS_FILE);

    const newRequest = {
        id: getNextId(requests),
        patientName: patientName.trim(),
        bloodGroup,
        units: Number(units),
        hospital: hospital.trim(),
        state: place.state,
        city: place.city,
        district: place.district,
        contactPhone: contactPhone.trim(),
        urgency,                      // "Critical" | "Urgent" | "Normal"
        notes: (notes || "").trim(),
        status: "Open",               // becomes "Fulfilled" later
        reference: notify.makeReference("REQ"),
        createdAt: new Date().toISOString()
    };

    requests.push(newRequest);
    writeData(REQUESTS_FILE, requests);

    // Logged in? Confirm by e-mail. Patient name and phone are NOT put in the e-mail.
    const user = sessionUser(req);
    const email = user ? await notify.formConfirmation(user, `request:${newRequest.id}`, {
        formType: "Emergency blood request", title: "Your blood request was posted", reference: newRequest.reference, when: newRequest.createdAt,
        paragraphs: ["Your emergency blood request is now visible to donors on the website. Also call nearby blood banks: they can often help fastest."],
        details: [["Blood group", newRequest.bloodGroup], ["Units", String(newRequest.units)], ["Hospital", newRequest.hospital], ["City", `${newRequest.city}, ${newRequest.state}`], ["Urgency", newRequest.urgency]],
        note: "Mark the request as fulfilled on the website when you have the blood, so donors are not called unnecessarily.",
        buttonText: "Find blood banks near you", buttonUrl: `${notify.T.appUrl()}/camps.html?view=banks`
    }) : null;

    res.status(201).json({ message: "Emergency request created!", request: newRequest, reference: newRequest.reference, email, emailNote: notify.emailNote(email) });
});


// ================================
// PATCH - MARK REQUEST AS FULFILLED
// ================================

app.patch("/api/requests/:id/fulfill", (req, res) => {
    const id = Number(req.params.id);
    const requests = readData(REQUESTS_FILE);
    const request = requests.find(r => r.id === id);

    if (!request) {
        return res.status(404).json({ message: "Request not found." });
    }

    request.status = "Fulfilled";
    request.fulfilledAt = request.fulfilledAt || new Date().toISOString();   // for response-time analytics
    writeData(REQUESTS_FILE, requests);

    res.status(200).json({ message: "Request marked as fulfilled.", request });
});


// ================================
// DELETE - DELETE EMERGENCY REQUEST
// ================================

app.delete("/api/requests/:id", (req, res) => {
    const id = Number(req.params.id);
    const requests = readData(REQUESTS_FILE);
    const index = requests.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Request not found." });
    }

    const deleted = requests.splice(index, 1)[0];
    writeData(REQUESTS_FILE, requests);

    res.status(200).json({ message: "Request deleted.", request: deleted });
});


// ================================
// GET - STATES & CITIES (official LGD list)
// /api/locations              -> list of states/UTs with city counts
// /api/locations?state=Goa    -> cities of one state
// ================================

app.get("/api/locations", (req, res) => {
    if (req.query.state) {
        const state = findState(req.query.state);
        if (!state) return res.status(404).json({ message: "State not found." });
        return res.status(200).json({
            state: state.name,
            type: state.type,
            count: state.cities.length,
            cities: state.cities.map(([name, district, lgdCode]) => ({ name, district, lgdCode }))
        });
    }

    res.status(200).json({
        count: INDIA_LOCATIONS.length,
        states: INDIA_LOCATIONS.map(s => ({ name: s.name, type: s.type, cities: s.cities.length }))
    });
});


// ================================
// PLACE SEARCH (address, city, state, PIN code or blood bank name)
// Example: /api/places?q=Kadri, Mangaluru     /api/places?q=575001
// Returns two lists:
//   bloodBanks - matching blood banks from the official directory
//   places     - places found by OpenStreetMap (see utils/geocoder.js)
// If OpenStreetMap can't be reached, bloodBanks still work and
// placesError explains what went wrong.
// ================================

// Match an OpenStreetMap address to our official State/City lists
function matchToLgd(address) {
    const state = findState(address.state);
    if (!state) return null;
    const place = findLocation(state.name, address.city) ||
        findLocation(state.name, address.district) ||
        { state: state.name, city: "", district: "" };
    return place;
}

function withLgd(place) {
    return place ? { ...place, lgd: matchToLgd(place.address) } : null;
}

// Blood banks whose name, address, city or PIN code contains every word typed
function searchBloodBanks(query) {
    const words = query.toLowerCase().split(/[\s,]+/).filter(w => w.length > 1);
    if (!words.length) return [];
    return BLOOD_BANKS
        .filter(b => b.location === "verified" || b.location === "approximate")
        .filter(b => {
            const text = `${b.name} ${b.address} ${b.city} ${b.district} ${b.state} ${b.pincode}`.toLowerCase();
            return words.every(w => text.includes(w));
        })
        .slice(0, 6)
        .map(b => ({ ...b, type: "bloodBank" }));
}

app.get("/api/places", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    if (q.length < 2) {
        return res.status(400).json({ message: "Type at least 2 characters to search." });
    }
    if (q.length > 150) {
        return res.status(400).json({ message: "That search is too long." });
    }

    const bloodBanks = searchBloodBanks(q);
    let places = [];
    let placesError = null;

    try {
        places = (await searchPlaces(q)).map(withLgd);
    } catch (error) {
        console.error("Place search failed:", error.message);
        placesError = "The map search service (OpenStreetMap) could not be reached. Check your internet connection.";
    }

    res.status(200).json({ query: q, places, bloodBanks, placesError });
});


// ================================
// REVERSE GEOCODING: point -> address, city, state, PIN
// Example: /api/places/reverse?lat=12.8698&lng=74.8430
// ================================

app.get("/api/places/reverse", async (req, res) => {
    const center = readCenter(req.query);
    if (!center) {
        return res.status(400).json({ message: "Please provide valid lat and lng values." });
    }
    try {
        const place = withLgd(await reversePlace(center.lat, center.lng));
        res.status(200).json({ place });
    } catch (error) {
        console.error("Reverse geocoding failed:", error.message);
        res.status(502).json({ message: "The map search service (OpenStreetMap) could not be reached." });
    }
});


// ================================
// GET - EDUCATIONAL DEMO PROFILES (fictional)
// Example: /api/education-profiles?category=rare&q=bombay
//   category = universal-donor | universal-recipient | rare   (optional)
//   q        = words to find in name, blood group, city, state or category
// ================================

app.get("/api/education-profiles", (req, res) => {
    const category = (req.query.category || "").toString();
    const words = (req.query.q || "").toString().toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (category && !PROFILE_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Unknown category." });
    }

    const profiles = EDUCATION_DATA.profiles
        .filter(p => !category || p.category === category)
        .filter(p => {
            const text = `${p.name} ${p.bloodGroup} ${p.bloodGroupDetail} ${p.city} ${p.district} ${p.state} ${p.categoryLabel}`.toLowerCase();
            return words.every(w => text.includes(w));
        });

    res.status(200).json({ about: EDUCATION_DATA.about, count: profiles.length, profiles });
});


// ==========================================================
// BLOOD DONATION CAMP TRACKER
// ----------------------------------------------------------
// data/camps.json holds every camp. Each camp has a reviewStatus:
//   "pending"  - sent by an organiser, waiting for review (NOT public)
//   "approved" - checked by an admin, shown on the website
//   "rejected" - not shown
// Admin actions need the ADMIN_KEY. Set your own before using it:
//   Windows:  set ADMIN_KEY=my-secret     then  node server.js
//   Mac/Linux: ADMIN_KEY=my-secret node server.js
// ==========================================================

const CAMPS_FILE = "camps.json";
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";
const CAMP_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"];

// First run: create the camps file with clearly labelled DEMO camps
// PIN code of the area around a demo camp (from the nearest listed blood bank)
const demoAreaPin = (lat, lng) => nearestPin(lat, lng, BLOOD_BANKS, getDistanceKm);

function readCamps() {
    let camps = readData(CAMPS_FILE);
    if (!require("./utils/db").dataFileExists(CAMPS_FILE)) {
        camps = makeDemoCamps(new Date(), demoAreaPin).map((c, i) => ({ id: i + 1, ...c }));
        writeData(CAMPS_FILE, camps);
    }
    return camps;
}

// What the public may see: no organiser contact unless an admin verified it
function publicCamp(camp, center) {
    const out = {
        id: camp.id, name: camp.name, organiser: camp.organiser, organiserType: camp.organiserType,
        venue: camp.venue, city: camp.city, district: camp.district, state: camp.state, pincode: camp.pincode,
        pincodeNote: camp.pincodeNote || "",
        date: camp.date, startTime: camp.startTime, endTime: camp.endTime,
        latitude: camp.latitude, longitude: camp.longitude,
        registrationLink: camp.registrationLink || "",
        status: campStatus(camp),
        reviewNote: camp.reviewNote || "",
        isDemo: Boolean(camp.isDemo), demoLabel: camp.demoLabel || "",
        updatedAt: camp.updatedAt,
        contactVerified: Boolean(camp.contactVerified)
    };
    // Real camps: contact only after the team checked it.
    // Demo camps: fictional "00000 009xx" number that cannot be called.
    if (camp.contactVerified || camp.isDemo) {
        out.contactName = camp.contactName;
        out.contactPhone = camp.contactPhone;
        out.contactEmail = camp.contactEmail;
    }
    if (center) {
        out.distanceKm = Number(getDistanceKm(center.lat, center.lng, camp.latitude, camp.longitude).toFixed(1));
    }
    return out;
}

function hasPosition(camp) {
    return typeof camp.latitude === "number" && typeof camp.longitude === "number";
}

// ================================
// GET - CAMPS (approved only)
// Example: /api/camps?lat=12.87&lng=74.84&maxKm=25&status=upcoming,ongoing&sort=distance
//   lat, lng        optional - adds distanceKm and lets you filter by distance
//   minKm, maxKm    same as /api/search  (maxKm=any -> no limit)
//   status          comma list: upcoming, ongoing, completed, cancelled
//   state, city, q  optional text filters
//   sort            distance (needs lat/lng) | date
// ================================

app.get("/api/camps", (req, res) => {
    const center = req.query.lat !== undefined ? readCenter(req.query) : null;
    if (req.query.lat !== undefined && !center) {
        return res.status(400).json({ message: "Please provide valid lat and lng values." });
    }
    const range = readDistanceRange(req.query);
    const statuses = (req.query.status || "upcoming,ongoing").split(",").filter(s => CAMP_STATUSES.includes(s));
    const state = (req.query.state || "").trim().toLowerCase();
    const city = (req.query.city || "").trim().toLowerCase();
    const words = (req.query.q || "").toString().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const sort = req.query.sort === "date" || !center ? "date" : "distance";

    const approved = readCamps().filter(c => c.reviewStatus === "approved" && hasPosition(c));
    const all = approved.map(c => publicCamp(c, center));

    let camps = all
        .filter(c => statuses.includes(c.status))
        .filter(c => !state || c.state.toLowerCase() === state)
        .filter(c => !city || c.city.toLowerCase() === city)
        .filter(c => {
            const text = `${c.name} ${c.organiser} ${c.venue} ${c.city} ${c.district} ${c.state} ${c.pincode}`.toLowerCase();
            return words.every(w => text.includes(w));
        });

    // How many matching camps are within 50 km (to offer "search farther")
    const within50 = center ? camps.filter(c => c.distanceKm <= 50).length : null;
    const nearestKm = center && camps.length ? Math.min(...camps.map(c => c.distanceKm)) : null;

    if (center) camps = camps.filter(c => inRange(c.distanceKm, range));

    camps.sort(sort === "distance"
        ? (a, b) => a.distanceKm - b.distanceKm
        : (a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

    const lastUpdated = approved.reduce((max, c) => (c.updatedAt > max ? c.updatedAt : max), "");

    res.status(200).json({ count: camps.length, camps, within50, nearestKm, sort, lastUpdated, checkedAt: new Date().toISOString() });
});


// ================================
// GET - PIN CODE -> MAP POSITION
// Example: /api/pincode/575001
//   1. OpenStreetMap Nominatim (geocoding service, no API key)
//   2. if it can't be reached / has no result: built-in list from
//      the blood bank directory (exact PIN, else same first digits)
// ================================

app.get("/api/pincode/:pin", async (req, res) => {
    const pin = String(req.params.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ message: "Please enter a 6-digit PIN code, for example 575001." });
    }
    if (pin.startsWith("0")) {
        return res.status(400).json({ message: "Indian PIN codes don't start with 0. Please check the number." });
    }

    let geocoderError = null;
    try {
        const found = await searchPlaces(pin);
        if (found.length) {
            const p = found[0];
            return res.status(200).json({
                pin, lat: p.lat, lng: p.lng, exact: true,
                label: [p.address.city, p.address.state].filter(Boolean).join(", ") || p.displayName,
                source: p.source
            });
        }
    } catch (error) {
        console.error("PIN lookup failed:", error.message);
        geocoderError = "The map search service (OpenStreetMap) could not be reached, so the built-in PIN list was used.";
    }

    const offline = pinFromBanks(pin, BLOOD_BANKS);
    if (!offline) {
        return res.status(404).json({ message: `We couldn't find PIN code ${pin}. Check the number, or search your city or locality instead.` });
    }
    res.status(200).json({ pin, ...offline, geocoderError });
});


// ================================
// GET - BLOOD BANKS + HOSPITALS FOR THE CAMP MAP
// Example: /api/map-places?lat=12.87&lng=74.84&maxKm=25&kinds=bank,hospital
//   kinds    bank (blood banks) and/or hospital (hospital-run blood banks)
//   lat/lng  + minKm/maxKm -> nearest first, with distanceKm
//   state, city            -> when there is no lat/lng
//   limit                  -> at most this many (default 60)
// ================================

app.get("/api/map-places", (req, res) => {
    const center = req.query.lat !== undefined ? readCenter(req.query) : null;
    const state = (req.query.state || "").trim().toLowerCase();
    const city = placeKey(req.query.city);
    if (!center && !state) {
        return res.status(400).json({ message: "Give a location (lat/lng) or a state." });
    }
    const kinds = (req.query.kinds || "bank,hospital").split(",");
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const range = readDistanceRange(req.query);

    let places = BLOOD_BANKS
        .filter(bankHasPosition)
        .map(b => ({ ...b, type: "place", kind: isHospital(b) ? "hospital" : "bank" }))
        .filter(p => kinds.includes(p.kind))
        .filter(p => !state || p.state.toLowerCase() === state)
        .filter(p => !city || placeKey(p.city) === city || placeKey(p.district) === city);

    if (center) {
        places = places
            .map(p => ({ ...p, distanceKm: Number(getDistanceKm(center.lat, center.lng, p.lat, p.lng).toFixed(1)) }))
            .filter(p => inRange(p.distanceKm, range))
            .sort((a, b) => a.distanceKm - b.distanceKm);
    } else {
        places.sort((a, b) => a.name.localeCompare(b.name));
    }

    res.status(200).json({ total: places.length, count: Math.min(places.length, limit), places: places.slice(0, limit), source: BLOOD_BANK_DATA.meta });
});


// ================================
// POST - ORGANISER SUBMITS A CAMP  (saved as "pending", not public)
// ================================

function validateCamp(b) {
    const required = ["name", "organiser", "organiserType", "venue", "state", "city", "date", "startTime", "endTime", "contactName"];
    for (const field of required) {
        if (!b[field] || !String(b[field]).trim()) return "Please fill in all required fields.";
    }
    if (!findLocation(b.state, b.city, b.district)) return "Please select a valid state and city.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !/^\d{2}:\d{2}$/.test(b.startTime) || !/^\d{2}:\d{2}$/.test(b.endTime)) {
        return "Please enter a valid date and time.";
    }
    if (b.endTime <= b.startTime) return "The end time must be after the start time.";
    if (campStatus(b) === "completed") return "This camp has already ended.";
    if (!b.contactPhone && !b.contactEmail) return "Please give a contact phone number or e-mail.";
    if (b.contactPhone && !/^[0-9]{10}$/.test(b.contactPhone)) return "Contact phone must be 10 digits.";
    if (b.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contactEmail)) return "Please enter a valid e-mail.";
    if (b.registrationLink && !/^https?:\/\//.test(b.registrationLink)) return "The registration link must start with http:// or https://";
    if (b.pincode && !/^\d{6}$/.test(b.pincode)) return "PIN code must be 6 digits.";
    if (b.latitude !== undefined && b.latitude !== "" && b.latitude !== null) {
        const lat = Number(b.latitude), lng = Number(b.longitude);
        if (isNaN(lat) || isNaN(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) return "Coordinates must be inside India.";
    }
    return null;
}

// E-mail about a camp to the person who submitted it
//   kind: submitted | updated | deleted | approved | rejected | cancelled | rescheduled
function campEmail(user, camp, kind) {
    const text = {
        submitted: ["Blood donation camp registration", "Your camp was submitted for verification", "Thank you! Your blood donation camp was received. Our team will check it; it appears on the public map only after it has been approved."],
        updated: ["Blood donation camp update", "Your camp changes were received", "Your changes were saved. The camp will be checked again before the new details are shown publicly."],
        deleted: ["Blood donation camp deleted", "Your camp was deleted", "This camp was deleted from your account and is no longer shown on the website."],
        approved: ["Blood donation camp approved", "Your camp is now live", "Good news: your blood donation camp was verified and is now shown on the public map."],
        rejected: ["Blood donation camp not approved", "Your camp was not approved", "We could not verify this camp, so it is not shown publicly. Please check the details or contact us."],
        cancelled: ["Blood donation camp cancelled", "Your camp was marked as cancelled", "This camp is now shown as cancelled on the website."],
        rescheduled: ["Blood donation camp rescheduled", "Your camp's date or time was changed", "The new date and time are now shown on the website."]
    }[kind];
    return notify.formConfirmation(user, `camp-${kind}:${camp.id}:${camp.updatedAt}`, {
        formType: text[0], title: text[1], reference: camp.reference, when: camp.updatedAt, paragraphs: [text[2]],
        details: [["Camp", camp.name], ["When", notify.T.formatCampDate(camp)], ["Venue", `${camp.venue}, ${camp.city}, ${camp.state}${camp.pincode ? " - " + camp.pincode : ""}`],
            ["Status", { pending: "Pending verification", approved: "Approved · public", rejected: "Not approved" }[camp.reviewStatus] + (camp.cancelled ? " · Cancelled" : "")],
            ["Note", camp.reviewNote || ""]],
        buttonText: "Open my dashboard", buttonUrl: `${notify.T.appUrl()}/dashboard.html#camps`
    });
}

// Clean camp fields from a form (used by organisers and the public form)
function campFields(b) {
    const place = findLocation(b.state, b.city, b.district);
    const num = v => (v === "" || v === undefined || v === null ? null : Number(v));
    return {
        name: b.name.trim(), organiser: b.organiser.trim(), organiserType: b.organiserType,
        venue: b.venue.trim(), city: place.city, district: place.district, state: place.state,
        pincode: (b.pincode || "").trim(),
        date: b.date, startTime: b.startTime, endTime: b.endTime,
        latitude: num(b.latitude), longitude: num(b.longitude),
        contactName: b.contactName.trim(), contactPhone: (b.contactPhone || "").trim(), contactEmail: (b.contactEmail || "").trim(),
        registrationLink: (b.registrationLink || "").trim()
    };
}

app.post("/api/camps", idempotent, async (req, res) => {
    const b = req.body;
    const error = validateCamp(b);
    if (error) return res.status(400).json({ message: error });

    const place = findLocation(b.state, b.city, b.district);
    const camps = readCamps();
    const now = new Date().toISOString();
    const camp = {
        id: getNextId(camps),
        name: b.name.trim(), organiser: b.organiser.trim(), organiserType: b.organiserType,
        venue: b.venue.trim(), city: place.city, district: place.district, state: place.state,
        pincode: (b.pincode || "").trim(),
        date: b.date, startTime: b.startTime, endTime: b.endTime,
        latitude: b.latitude === "" || b.latitude === undefined || b.latitude === null ? null : Number(b.latitude),
        longitude: b.longitude === "" || b.longitude === undefined || b.longitude === null ? null : Number(b.longitude),
        contactName: b.contactName.trim(), contactPhone: (b.contactPhone || "").trim(), contactEmail: (b.contactEmail || "").trim(),
        contactVerified: false,
        registrationLink: (b.registrationLink || "").trim(),
        reviewStatus: "pending",          // <- NOT public until an admin approves it
        cancelled: false, reviewNote: "", isDemo: false,
        reference: notify.makeReference("CAMP"),
        submittedAt: now, updatedAt: now
    };
    const user = sessionUser(req);
    if (user && user.role === "organizer") camp.ownerId = user.id;   // shows up in their dashboard
    camps.push(camp);
    writeData(CAMPS_FILE, camps);

    const email = user ? await campEmail(user, camp, "submitted") : null;
    res.status(201).json({ message: "Thank you! Your camp was sent for review. It will appear on the website after it has been verified.", reference: camp.reference, email, emailNote: notify.emailNote(email) });
});


// ================================
// ADMIN - REVIEW CAMPS  (needs ADMIN_KEY)
// GET  /api/camps/review?key=...         -> pending + approved camps (full details)
// POST /api/camps/:id/review  { key, action, ... }
//   action = approve | reject | cancel | reschedule
//   approve:    contactVerified (true/false), latitude, longitude (if missing)
//   reschedule: date, startTime, endTime, venue (optional)
// ================================

function isAdmin(key) {
    // In production the default key is never accepted (set ADMIN_KEY to use this route)
    if (process.env.NODE_ENV === "production" && ADMIN_KEY === "change-this-admin-key") return false;
    return typeof key === "string" && key.length > 0 && key === ADMIN_KEY;
}

app.get("/api/camps/review", (req, res) => {
    if (!isAdmin(req.query.key)) return res.status(401).json({ message: "Wrong admin key." });
    const camps = readCamps()
        .filter(c => c.reviewStatus !== "rejected")
        .map(c => ({ ...c, status: campStatus(c) }))
        .sort((a, b) => (a.reviewStatus === "pending" ? -1 : 1) - (b.reviewStatus === "pending" ? -1 : 1) || a.date.localeCompare(b.date));
    res.status(200).json({ count: camps.length, camps });
});

app.post("/api/camps/:id/review", async (req, res) => {
    const b = req.body;
    if (!isAdmin(b.key)) return res.status(401).json({ message: "Wrong admin key." });
    const out = await reviewCamp(Number(req.params.id), b);
    res.status(out.status).json(out.body);
});

// Shared by the ADMIN_KEY route above and the Admin Dashboard (routes/admin.js).
// Returns { status, body }.
async function reviewCamp(id, b) {
    const fail = (status, message) => ({ status, body: { message } });
    const camps = readCamps();
    const camp = camps.find(c => c.id === id);
    if (!camp) return fail(404, "Camp not found.");

    if (b.action === "approve") {
        if (b.latitude !== undefined && b.latitude !== "") {
            const lat = Number(b.latitude), lng = Number(b.longitude);
            if (isNaN(lat) || isNaN(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) {
                return fail(400, "Coordinates must be inside India.");
            }
            camp.latitude = lat;
            camp.longitude = lng;
        }
        if (!hasPosition(camp)) {
            return fail(400, "Add the venue's latitude and longitude before approving.");
        }
        camp.reviewStatus = "approved";
        camp.contactVerified = b.contactVerified === true;
    } else if (b.action === "reject") {
        camp.reviewStatus = "rejected";
    } else if (b.action === "cancel") {
        camp.cancelled = true;
        camp.reviewNote = (b.note || "Cancelled by the organiser.").toString().slice(0, 200);
    } else if (b.action === "reschedule") {
        const updated = { ...camp, date: b.date || camp.date, startTime: b.startTime || camp.startTime, endTime: b.endTime || camp.endTime };
        if (campStatus(updated) === "unscheduled") return fail(400, "Please enter a valid date and times.");
        Object.assign(camp, { date: updated.date, startTime: updated.startTime, endTime: updated.endTime });
        if (b.venue) camp.venue = b.venue.toString().trim();
        camp.cancelled = false;
        camp.reviewNote = (b.note || "Date/time updated.").toString().slice(0, 200);
    } else {
        return fail(400, "Unknown action.");
    }

    camp.updatedAt = new Date().toISOString();
    if (!camp.reference) camp.reference = notify.makeReference("CAMP");
    writeData(CAMPS_FILE, camps);

    // Tell the organiser (essential) ...
    const owner = camp.ownerId ? readUsers().find(u => u.id === camp.ownerId) : null;
    const kind = { approve: "approved", reject: "rejected", cancel: "cancelled", reschedule: "rescheduled" }[b.action];
    const email = owner ? await campEmail(owner, camp, kind) : null;
    // ... and, for a newly approved camp, people nearby who asked for it (optional)
    let nearby = 0;
    if (b.action === "approve" && !camp.isDemo) {
        nearby = await notify.nearbyCamp(camp, readUsers(), u => pinFromBanks(u.pincode, BLOOD_BANKS), getDistanceKm);
    }

    return { status: 200, body: { message: `Camp ${b.action === "approve" ? "approved" : b.action === "reject" ? "rejected" : b.action === "cancel" ? "cancelled" : "updated"}.`
        + (owner ? ` Organiser: ${notify.emailNote(email) || "e-mail already sent."}` : "") + (nearby ? ` Nearby camp e-mails queued for ${nearby} user(s).` : ""),
        camp: { ...camp, status: campStatus(camp) } } };
}


// ================================
// LOGIN & REGISTRATION  (routes/auth.js)
// ================================
app.use("/api/auth", createAuthRouter({ findLocation }));


// ================================
// CAMP ORGANIZER DASHBOARD (logged-in "organizer" accounts only)
//   GET    /api/organizer/camps        my camps, with review status
//   POST   /api/organizer/camps        add a camp   -> pending
//   PUT    /api/organizer/camps/:id    edit my camp -> pending again
//   DELETE /api/organizer/camps/:id    delete my camp
// ================================
const organizerOnly = requireAuth("organizer");

function myCamp(req, res) {
    const camps = readCamps();
    const camp = camps.find(c => String(c.id) === String(req.params.id) && c.ownerId === req.user.id);
    if (!camp) { res.status(404).json({ message: "Camp not found (you can only change your own camps)." }); return null; }
    return { camps, camp };
}

app.get("/api/organizer/camps", organizerOnly, (req, res) => {
    const camps = readCamps()
        .filter(c => c.ownerId === req.user.id)
        .map(c => ({ ...c, status: campStatus(c) }))
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
    res.json({ count: camps.length, camps });
});

app.post("/api/organizer/camps", organizerOnly, idempotent, async (req, res) => {
    const error = validateCamp(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const camps = readCamps();
    const now = new Date().toISOString();
    const camp = {
        id: getNextId(camps), ...campFields(req.body),
        ownerId: req.user.id,              // who may edit/delete it (never shown publicly)
        contactVerified: false, reviewStatus: "pending", cancelled: false, reviewNote: "", isDemo: false,
        reference: notify.makeReference("CAMP"),
        submittedAt: now, updatedAt: now
    };
    camps.push(camp);
    writeData(CAMPS_FILE, camps);
    const email = await campEmail(req.user, camp, "submitted");
    res.status(201).json({ message: "Camp saved. It is pending verification and will be public after an administrator approves it.", camp, reference: camp.reference, email, emailNote: notify.emailNote(email) });
});

app.put("/api/organizer/camps/:id", organizerOnly, idempotent, async (req, res) => {
    const found = myCamp(req, res);
    if (!found) return;
    const error = validateCamp(req.body || {});
    if (error) return res.status(400).json({ message: error });
    Object.assign(found.camp, campFields(req.body), {
        reviewStatus: "pending", contactVerified: false, // changed details must be checked again
        reviewNote: "", updatedAt: new Date().toISOString()
    });
    if (!found.camp.reference) found.camp.reference = notify.makeReference("CAMP");
    writeData(CAMPS_FILE, found.camps);
    const email = await campEmail(req.user, found.camp, "updated");
    res.json({ message: "Camp updated. It is pending verification again.", camp: found.camp, reference: found.camp.reference, email, emailNote: notify.emailNote(email) });
});

app.delete("/api/organizer/camps/:id", organizerOnly, async (req, res) => {
    const found = myCamp(req, res);
    if (!found) return;
    writeData(CAMPS_FILE, found.camps.filter(c => c !== found.camp));
    const email = await campEmail(req.user, { ...found.camp, updatedAt: new Date().toISOString() }, "deleted");
    res.json({ message: "Camp deleted.", email, emailNote: notify.emailNote(email) });
});


// ================================
// ROAD ROUTES (routes/route.js - OSRM) + CITY MARKERS FOR THE CAMP MAP
// ================================
app.use("/api/route", createRouteRouter());

// Cities with approved camps or at least 5 located blood banks:
// { city, state, lat, lng, camps, demoCamps, banks }
app.get("/api/city-hubs", (req, res) => {
    const hubs = new Map();
    const hub = (state, city) => {
        const key = state + "|" + placeKey(city);
        if (!hubs.has(key)) hubs.set(key, { city, state, campPts: [], bankPts: [], camps: 0, demoCamps: 0, banks: 0 });
        return hubs.get(key);
    };
    BLOOD_BANKS.filter(bankHasPosition).forEach(b => { const h = hub(b.state, b.city); h.banks++; h.bankPts.push([b.lat, b.lng]); });
    readCamps().filter(c => c.reviewStatus === "approved" && hasPosition(c) && !c.cancelled && ["upcoming", "ongoing"].includes(campStatus(c)))
        .forEach(c => { const h = hub(c.state, c.city); h.city = c.city; h.camps++; if (c.isDemo) h.demoCamps++; h.campPts.push([c.latitude, c.longitude]); });
    const median = v => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    let list = [...hubs.values()].filter(h => h.camps > 0 || h.banks >= 5).map(h => {
        const pts = h.bankPts.length ? h.bankPts : h.campPts;
        return { city: h.city, state: h.state, lat: median(pts.map(p => p[0])), lng: median(pts.map(p => p[1])), camps: h.camps, demoCamps: h.demoCamps, banks: h.banks };
    });
    // Same city spelled two ways ("Mangaluru" / "Mangalore")? Merge hubs closer than 8 km.
    const merged = [];
    list.sort((a, b) => b.camps - a.camps || b.banks - a.banks).forEach(h => {
        const near = merged.find(m => m.state === h.state && getDistanceKm(m.lat, m.lng, h.lat, h.lng) < 8);
        if (near) { near.camps += h.camps; near.demoCamps += h.demoCamps; near.banks += h.banks; }
        else merged.push({ ...h });
    });
    res.json({ count: merged.length, hubs: merged });
});


// ================================
// AI ASSISTANT  (routes/chat.js - the API key stays on the server)
// ================================
app.use("/api/chat", createChatRouter());


// ================================
// E-MAIL: unsubscribe link (optional camp e-mails only) + admin log
// ================================
app.get("/api/notifications/unsubscribe", (req, res) => {
    const userId = String(req.query.u || "");
    const page = (title, text) => res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${title}</title><body style="font-family:Arial,sans-serif;background:#fff0f3;color:#1d1416;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">
        <div style="background:#fff;border:1px solid #f3d3da;border-radius:18px;padding:28px;max-width:440px;text-align:center"><div style="font-size:40px">🩸</div>
        <h1 style="color:#8f0b21;font-size:22px">${title}</h1><p>${text}</p><p><a href="/" style="color:#c8102e;font-weight:bold">Back to the website</a></p></div></body>`);
    if (!notify.checkUnsubscribeToken(userId, req.query.t)) return page("Link not valid", "This unsubscribe link is not valid. You can change your e-mail settings in your profile.");
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (user) { user.notifyNearbyCamps = false; writeUsers(users); }
    page("You are unsubscribed", "You will no longer get e-mails about nearby blood donation camps. Account and form confirmation e-mails will still be sent.");
});

// Admin: recent e-mails (masked addresses, status only - never the content)
app.get("/api/admin/email-log", (req, res) => {
    if (!isAdmin(req.query.key) && !sessionAdmin(req)) return res.status(401).json({ message: "Wrong admin key." });
    const cfg = emailConfig();
    res.json({ provider: cfg.provider, configured: cfg.ready, from: cfg.from, emails: readLog().slice(-50).reverse().map(({ dedupeKey, ...e }) => e) });
});


// ================================
// PUBLIC DASHBOARD  (statistics.html, "Dashboard" in the menu)
// GET /api/public-stats?view=monthly|yearly&source=real|demo
// Aggregated counts only: no names, phones, e-mails or locations
// finer than the city. Duplicates are removed before counting.
// source=demo returns clearly labelled SAMPLE numbers.
// ================================
const PublicStats = require("../frontend/js/analytics-core.js");
app.get("/api/public-stats", (req, res) => {
    const view = req.query.view === "yearly" ? "yearly" : "monthly";
    if (req.query.source === "demo") {
        return res.json({ source: "demo", result: PublicStats.computePublic(PublicStats.makeDemoDataset(), { view }) });
    }
    const digits = v => String(v || "").replace(/\D/g, "").slice(-10);
    const data = {
        donors: readData(DONORS_FILE).filter(d => !d.isDemo).map(d => ({ key: digits(d.phone) || "id:" + d.id, bloodGroup: d.bloodGroup, city: d.city, state: d.state, createdAt: d.createdAt })),
        requests: readData(REQUESTS_FILE).filter(r => !r.isDemo).map(r => ({
            key: `${digits(r.contactPhone)}|${r.bloodGroup}|${String(r.hospital || "").trim().toLowerCase()}|${String(r.createdAt || "").slice(0, 10)}`,
            bloodGroup: r.bloodGroup, city: r.city, state: r.state, status: r.status, createdAt: r.createdAt, fulfilledAt: r.fulfilledAt, fulfilmentConfirmed: Boolean(r.fulfilmentConfirmed)
        })),
        donations: readData("donations.json").map(n => ({ key: "id:" + n.id, verified: n.verified === true, date: n.date, city: n.city, state: n.state })),
        camps: readCamps().filter(c => !c.isDemo).map(c => ({ date: c.date, reviewStatus: c.reviewStatus, cancelled: Boolean(c.cancelled), city: c.city, state: c.state })),
        users: readUsers().map(u => ({ key: String(u.email || u.id).toLowerCase(), createdAt: u.createdAt }))
    };
    res.set("Cache-Control", "no-store");
    res.json({ source: "real", result: PublicStats.computePublic(data, { view }) });
});


// ================================
// FEEDBACK FORM  (js/feedback.js)
// POST /api/feedback  { usedFor, helped, ease, recommend, suggestion?, context? }
// Anonymous: no name, e-mail, phone, IP address or location is stored.
// Results appear in the Admin Analytics Dashboard.
// ================================
const FEEDBACK_FILE = "feedback.json";
const { FEEDBACK_OPTIONS } = require("../frontend/js/analytics-core.js");
const feedbackHits = new Map();     // per-IP limit, kept in memory only (never saved)
app.post("/api/feedback", idempotent, (req, res) => {
    const b = req.body || {};
    for (const key of Object.keys(FEEDBACK_OPTIONS)) {
        if (!FEEDBACK_OPTIONS[key].includes(b[key])) return res.status(400).json({ message: "Please answer questions 1 to 4." });
    }
    const suggestion = String(b.suggestion || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (suggestion.length > 200) return res.status(400).json({ message: "Suggestions can be at most 200 characters." });
    const ip = req.ip || "?", now = Date.now();
    const hits = (feedbackHits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
    if (hits.length >= 5) return res.status(429).json({ message: "Thanks! We already received several responses from you. Please try again later." });
    hits.push(now); feedbackHits.set(ip, hits);
    const list = readData(FEEDBACK_FILE);
    list.push({
        id: getNextId(list), usedFor: b.usedFor, helped: b.helped, ease: b.ease, recommend: b.recommend, suggestion,
        context: ["home", "after-registration", "after-fulfilled"].includes(b.context) ? b.context : "page",
        createdAt: new Date().toISOString()
    });
    writeData(FEEDBACK_FILE, list);
    res.status(201).json({ message: "Thank you for sharing your feedback!" });
});


// ================================
// ADMIN ANALYTICS DASHBOARD (routes/admin.js)
// Separate admin accounts (npm run create-admin) + server-side checks.
// ================================
app.use("/api/admin", createAdminRouter({
    DONORS_FILE, REQUESTS_FILE, readCamps, reviewCamp, findLocation, canReceiveFrom: CAN_RECEIVE_FROM, campStatus
}));


// ================================
// INVALID API ROUTE
// ================================

app.use("/api", (req, res) => {
    res.status(404).json({ message: "Route not found." });
});


// ================================
// START SERVER
// ================================

// First admin on a hosting service (no terminal needed): set ADMIN_EMAIL,
// ADMIN_PASSWORD (min 10 chars) and optionally ADMIN_NAME as environment
// variables. The account is created once if it does not exist yet; the
// password is stored only as a scrypt hash and is never logged.
function bootstrapAdmin() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    const { createAdmin, readAdmins } = require("./utils/admin-auth");
    if (readAdmins().some(a => a.email === ADMIN_EMAIL.trim().toLowerCase())) return;
    try { createAdmin({ name: ADMIN_NAME || "Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD }); console.log("Admin account created from environment variables."); }
    catch (e) { console.log("Could not create the admin from environment variables: " + e.message); }
}

app.listen(PORT, () => {
    bootstrapAdmin();
    if (String(process.env.DEMO_DATA || "").toLowerCase() === "off") {
        const r = require("./utils/demo-data").removeDemoRecords();
        console.log(`DEMO_DATA=off: removed demo records (donors ${r["donors.json"]}, requests ${r["requests.json"]}, camps ${r["camps.json"]}). Real records kept.`);
    }
    console.log(`Data folder: ${require("./utils/db").DATA_DIR}`);
    if (ADMIN_KEY === "change-this-admin-key") {
        console.log(process.env.NODE_ENV === "production"
            ? "NOTE: ADMIN_KEY not set - the old ADMIN_KEY camp-review route is disabled. Use the Admin Dashboard (/admin-login.html)."
            : "WARNING: using the default ADMIN_KEY. Set your own (see the README) before sharing the site.");
    }
    const mail = emailConfig();
    console.log(mail.ready
        ? `E-mail notifications: ON (${mail.provider}, from ${mail.from})`
        : `E-mail notifications: OFF - no provider configured (see backend/.env.example). E-mails are saved as previews in ${require("path").join(require("./utils/db").DATA_DIR, "outbox")}.`);
    console.log(process.env.ANTHROPIC_API_KEY
        ? `AI Assistant: ON (${process.env.CHAT_MODEL || "claude-haiku-5-5"})`
        : "AI Assistant: OFF - add ANTHROPIC_API_KEY to backend/.env to turn it on.");
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open the website: http://localhost:${PORT}`);
});
