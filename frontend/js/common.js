// ==========================================================
// COMMON.JS - shared code used by EVERY page
// (navbar, toast messages, scroll animations, geocoding)
// ==========================================================

// Backend address. The Express server also serves this website,
// so opening http://localhost:5000 is the easiest way to run it.
// (Same address as the page, so the login cookie always works.)
const API_URL = location.protocol.startsWith("http") ? `${location.origin}/api` : "http://localhost:5000/api";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];


// ----------------------------------------------------------
// 1. NAVBAR: mobile menu toggle + shadow when scrolling
// ----------------------------------------------------------
const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle) {
    navToggle.addEventListener("click", () => {
        navToggle.classList.toggle("open");
        navLinks.classList.toggle("open");
    });

    // Close the mobile menu after clicking a link
    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            navToggle.classList.remove("open");
            navLinks.classList.remove("open");
        });
    });
}

window.addEventListener("scroll", () => {
    if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 10);
});


// ----------------------------------------------------------
// 2. TOAST: small popup message at the bottom of the screen
//    usage: showToast("Saved!", "success")
// ----------------------------------------------------------
function showToast(message, type = "") {
    let toast = document.querySelector(".toast");

    // Create the toast element the first time
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = "toast show " + type;

    clearTimeout(toast.timer);
    // longer messages (reference number, e-mail note) stay longer
    toast.timer = setTimeout(() => toast.classList.remove("show"), Math.max(3200, message.length * 55));
}


// ----------------------------------------------------------
// 3. SCROLL ANIMATION: add class="reveal" to any element and
//    it fades in when it scrolls into view.
// ----------------------------------------------------------
const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));


// ----------------------------------------------------------
// 4. SAFETY: escape text before putting it inside innerHTML
//    (stops someone typing <script> into the "name" field)
// ----------------------------------------------------------
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}


// ----------------------------------------------------------
// 5. GEOCODING: address / city -> latitude/longitude (and back)
//    The backend asks OpenStreetMap's Nominatim service for us
//    (see backend/utils/geocoder.js), so these are real map
//    coordinates, not guesses.
// ----------------------------------------------------------

// "Bengaluru (BBMP)" -> "Bengaluru" (map search doesn't know "BBMP")
function plainCityName(city) {
    return city.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

/**
 * Search any place: address, area, city, state, PIN code or blood bank name.
 * Returns { places, bloodBanks, placesError } (see GET /api/places).
 * Throws an Error with a friendly message if the server can't be reached.
 */
async function searchPlaces(query) {
    let response;
    try {
        response = await fetch(`${API_URL}/places?` + new URLSearchParams({ q: query }));
    } catch (error) {
        throw new Error("Cannot reach the server. Is node server.js running?");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Search failed.");
    return data;
}

// First OpenStreetMap match for a text, or null
async function firstPlace(query) {
    const data = await searchPlaces(query);
    return data.places[0] || null;
}

/**
 * Finds the map position of a city from the dropdowns.
 * Returns { lat, lng, label, approximate } or null if not found / offline.
 *   approximate = true when only the district could be found.
 */
async function geocodeCity(city, district, state) {
    try {
        const name = plainCityName(city);
        let point = await firstPlace(`${name}, ${state}`);
        if (point) return { lat: point.lat, lng: point.lng, label: `${city}, ${state}`, approximate: false };

        // Not found? Try the district instead (clearly marked as approximate)
        if (district) {
            point = await firstPlace(`${district} district, ${state}`);
            if (point) return { lat: point.lat, lng: point.lng, label: `${district} district, ${state}`, approximate: true };
        }
        return null;
    } catch (error) {
        console.error("Geocoding failed:", error);
        return null;
    }
}

/**
 * Reverse geocoding: coordinates -> full place (address, city, state, PIN)
 * with .lgd = { state, city, district } matched to our dropdown lists.
 * Returns null if nothing is found or the service can't be reached.
 */
async function reverseGeocodePlace(lat, lng) {
    try {
        const response = await fetch(`${API_URL}/places/reverse?` + new URLSearchParams({ lat, lng }));
        if (!response.ok) return null;
        const data = await response.json();
        return data.place;
    } catch (error) {
        return null;
    }
}

// Short version used by older code: { city, state }
async function reverseGeocode(lat, lng) {
    const place = await reverseGeocodePlace(lat, lng);
    if (!place) return { city: "", state: "" };
    return {
        city: (place.lgd && place.lgd.city) || place.address.city,
        state: (place.lgd && place.lgd.state) || place.address.state
    };
}

/**
 * Wraps the browser Geolocation API in a Promise so we can use await.
 * Resolves with { lat, lng, accuracy }.
 * Browsers allow location only on a SECURE page: https://... or
 * http://localhost. On http://192.168.x.x or a file:// page it fails.
 */
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!window.isSecureContext) {
            reject(new Error("Location only works on a secure page. Open the site at http://localhost:5000 or an https:// address."));
            return;
        }
        if (!navigator.geolocation) {
            reject(new Error("Your browser does not support location access."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy // metres
            }),
            error => {
                // Turn the error code into a friendly message
                const messages = {
                    1: "Location permission was denied.",
                    2: "Your location is unavailable right now.",
                    3: "Getting your location took too long."
                };
                reject(new Error(messages[error.code] || "Could not get your location."));
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}


// ----------------------------------------------------------
// 5b. HAVERSINE in the browser (same formula as backend/utils/haversine.js)
//     Used by live location to check if the user has moved.
// ----------------------------------------------------------
function getDistanceKmBrowser(lat1, lng1, lat2, lng2) {
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ----------------------------------------------------------
// 6. BLOOD COMPATIBILITY
//    COMPATIBILITY  - text for the homepage cards
//    CAN_RECEIVE_FROM - patient group -> donor groups it can receive
//                       (same table as backend/utils/compatibility.js)
// ----------------------------------------------------------
const CAN_RECEIVE_FROM = {
    "A+":  ["A+", "A-", "O+", "O-"],
    "A-":  ["A-", "O-"],
    "B+":  ["B+", "B-", "O+", "O-"],
    "B-":  ["B-", "O-"],
    "AB+": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    "AB-": ["A-", "B-", "AB-", "O-"],
    "O+":  ["O+", "O-"],
    "O-":  ["O-"]
};

const COMPATIBILITY = {
    "A+":  { give: "A+, AB+",               receive: "A+, A-, O+, O-" },
    "A-":  { give: "A+, A-, AB+, AB-",      receive: "A-, O-" },
    "B+":  { give: "B+, AB+",               receive: "B+, B-, O+, O-" },
    "B-":  { give: "B+, B-, AB+, AB-",      receive: "B-, O-" },
    "AB+": { give: "AB+ only",              receive: "Everyone" },
    "AB-": { give: "AB+, AB-",              receive: "AB-, A-, B-, O-" },
    "O+":  { give: "O+, A+, B+, AB+",       receive: "O+, O-" },
    "O-":  { give: "Everyone",              receive: "O- only" }
};


// ----------------------------------------------------------
// 7. Build a donor card's HTML (used by Find Donor page)
// ----------------------------------------------------------

// "Udupi, Karnataka" (older records may not have a state)
function placeText(item) {
    return [item.city, item.state].filter(Boolean).join(", ");
}

// ----------------------------------------------------------
// 8. DEMO RECORDS
//    Sample donors/requests have "isDemo": true. They are fictional,
//    so every card shows a clear label, the phone number is shown as
//    "not callable", and there is no availability claim.
// ----------------------------------------------------------
const DEMO_DONOR_LABEL = "DEMO — NOT A REAL DONOR";

// "0000000101" -> "00000 00101"
function formatPhone(phone) {
    const p = String(phone || "");
    return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function demoBadge(record) {
    return `<span class="pill pill-demo">${escapeHtml(record.demoLabel || DEMO_DONOR_LABEL)}</span>`;
}

// The "Call" button, or a plain "demo number" text for demo records
function contactButton(record, phone) {
    if (record.isDemo) {
        return `<span class="demo-phone" title="Demo number - it cannot be called">📵 ${escapeHtml(formatPhone(phone))} · demo number, not callable</span>`;
    }
    return `<a class="btn btn-primary btn-sm" href="tel:${escapeHtml(phone)}">Call ${escapeHtml(phone)}</a>`;
}

function donorCardHTML(donor, options = {}) {
    const available = donor.availability === "Available";

    const distance = donor.distanceKm !== undefined
        ? `<span class="distance">${donor.distanceKm} km</span>`
        : "";

    // Demo records can only be deleted (editing could make them look real)
    const manageButtons = options.manage
        ? `${donor.isDemo ? "" : `<a class="btn btn-light btn-sm" href="register.html?id=${donor.id}">Edit</a>`}
           <button class="btn-danger-text" data-delete="${donor.id}">Delete</button>`
        : "";

    // Demo: label instead of an availability claim
    const status = donor.isDemo
        ? demoBadge(donor)
        : `<span class="pill ${available ? "pill-green" : "pill-gray"}">${escapeHtml(donor.availability)}</span>`;

    return `
        <article class="donor-card ${donor.isDemo ? "is-demo" : ""}" data-id="${donor.id}">
            <div class="donor-badge">${escapeHtml(donor.bloodGroup)}</div>
            <div>
                <div class="donor-top">
                    <h3>${escapeHtml(donor.name)}</h3>
                    ${distance}
                </div>
                <p class="donor-meta">${escapeHtml(placeText(donor))} · Age ${donor.age}</p>
                ${status}
                ${donor.otherInfo ? `<p class="donor-note">${escapeHtml(donor.otherInfo)}</p>` : ""}
                ${donor.isDemo ? `<p class="donor-note">Fictional sample record for testing. ${escapeHtml(donor.locationNote || "")}</p>` : ""}
                <div class="donor-actions">
                    ${contactButton(donor, donor.phone)}
                    ${manageButtons}
                </div>
            </div>
        </article>`;
}


// ----------------------------------------------------------
// FORM SUBMISSIONS: no duplicates + confirmation text
//   A random key travels with the form until it is saved. If the
//   same submission reaches the server twice (double click, slow
//   network) the server returns the first result: one record and
//   one confirmation e-mail.
// ----------------------------------------------------------
function idempotencyHeaders(form) {
    if (!form.dataset.idem) {
        form.dataset.idem = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return { "Idempotency-Key": form.dataset.idem };
}
function submissionDone(form) { delete form.dataset.idem; }

// "Donor registered! Reference: LD-DNR-... A confirmation e-mail was sent to kk***@gmail.com."
function resultMessage(data) {
    return [data.message, data.reference ? `Reference: ${data.reference}.` : "", data.emailNote || ""].filter(Boolean).join(" ");
}


// ----------------------------------------------------------
// ACCOUNT LINK IN THE NAVBAR
//    Logged in  -> "My Dashboard"   Logged out -> "Login"
//    (the login cookie is HttpOnly, so we ask the server)
// ----------------------------------------------------------
async function addAccountLink() {
    if (!navLinks || document.body.dataset.noAccountLink !== undefined) return;
    let user = null;
    try {
        const response = await fetch(`${API_URL}/auth/me`, { credentials: "same-origin" });
        if (response.ok) user = (await response.json()).user;
    } catch (error) { /* server not running: just show "Login" */ }
    const li = document.createElement("li");
    li.innerHTML = user
        ? `<a href="dashboard.html" class="nav-account" title="${escapeHtml(user.roleName)}">👤 My Dashboard</a>`
        : '<a href="login.html" class="nav-account">Login</a>';
    navLinks.appendChild(li);
}
addAccountLink();
