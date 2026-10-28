// ==========================================================
// CAMPS.JS - Location-Based Blood Camp Tracker
// ----------------------------------------------------------
//  1. Search by PIN code        -> GET /api/pincode/:pin
//     Search a city / locality  -> GET /api/places?q=   (OpenStreetMap)
//     Use my current location   -> browser Geolocation (asked only on click)
//     Or State + City dropdowns
//  2. Filters: upcoming / ongoing camps, blood banks, hospitals, distance
//  3. Results list + Leaflet map pins (different colours per type/status)
//       camps:                   GET /api/camps
//       blood banks + hospitals: GET /api/map-places
//  4. "View details" window and "Get directions" (Google Maps)
//  5. "Register a camp" form  -> POST /api/camps (pending review)
//  6. Admin review panel      -> approve / reject / cancel / reschedule
//
// Camp status (Upcoming / Ongoing / Completed / Cancelled) is worked
// out by the SERVER from each camp's date and times (Indian time).
// To use another data source later, change only loadCamps() below.
// ==========================================================

const campList = document.getElementById("campList");
const campNotice = document.getElementById("campNotice");
const campStatusBox = document.getElementById("campStatusBox");
const campResultsTitle = document.getElementById("campResultsTitle");
const campResultsCount = document.getElementById("campResultsCount");
const campSort = document.getElementById("campSort");
const $ = id => document.getElementById(id);

const MAX_PLACES_SHOWN = 60;   // blood banks / hospitals listed at once

let campCenter = null;         // { lat, lng, label, source }  source: device | search | city | map
let campPlaceFilter = {};      // { state, city } when there is no centre
let campSearchPin = "";        // PIN the user searched (to mark "Same PIN code")
let campShown = {};            // key -> item, for "View details"
const campMarkers = {};        // key -> Leaflet marker

const STATUS_TEXT = {
    upcoming: "Upcoming",
    ongoing: "Ongoing now",
    completed: "Completed",
    cancelled: "Cancelled"
};


// ==========================================================
// MAP
// ==========================================================
const campMap = L.map("campMap").setView([22.5, 79], 5); // India

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(campMap);

const campCircleLayer = L.layerGroup().addTo(campMap);
const campLayer = L.layerGroup().addTo(campMap);
let campYouMarker = null;

// Camp pin colour depends on its status (see .camp-pin in style.css)
function campIcon(camp) {
    return L.divIcon({ className: "", html: `<div class="camp-pin ${camp.status}"><span>🩸</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] });
}
// Blood bank = red "+", hospital = purple "H"
function placeIcon(p) {
    return L.divIcon({ className: "", html: `<div class="bank-pin ${p.kind === "hospital" ? "hospital-pin" : ""}">${p.kind === "hospital" ? "H" : "+"}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
}

// Click anywhere on the map to search around that point
campMap.on("click", e => {
    campSearchPin = "";
    setCampCenter(e.latlng.lat, e.latlng.lng, "the point you picked on the map", "map");
    loadCamps({ keepView: true });
});


// ==========================================================
// 1. LOCATION
// ==========================================================
function setCampStatus(message, type = "") {
    campStatusBox.textContent = message;
    campStatusBox.className = "location-status " + type;
}

function setCampCenter(lat, lng, label, source) {
    campCenter = { lat, lng, label, source };
    campPlaceFilter = {};
    setCampStatus(`📍 Showing results near ${label}`, "ok");
    campSort.value = "distance"; // with a location, nearest first makes sense
    $("campClearBtn").hidden = false;

    const icon = L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    if (campYouMarker) campYouMarker.setLatLng([lat, lng]);
    else campYouMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(campMap);
    campYouMarker.bindPopup(`<b>Your search location</b><br>${escapeHtml(label)}`);
}

function clearCampCenter() {
    campCenter = null;
    if (campYouMarker) { campMap.removeLayer(campYouMarker); campYouMarker = null; }
}

// Button "loading" state
function setBusy(button, busy, text = "Searching…") {
    if (busy) { button.dataset.label = button.innerHTML; button.innerHTML = `<span class="spinner"></span> ${text}`; button.disabled = true; }
    else { button.innerHTML = button.dataset.label || button.innerHTML; button.disabled = false; }
}

// ---------- a) PIN code ----------
function pinMessage(text, isError = true) {
    const box = $("campPinMsg");
    box.textContent = text;
    box.className = "field-msg " + (isError ? "error" : "ok");
    box.hidden = !text;
}

// Only digits, at most 6
$("campPin").addEventListener("input", () => {
    $("campPin").value = $("campPin").value.replace(/\D/g, "").slice(0, 6);
    pinMessage("");
});

$("campPinForm").addEventListener("submit", event => {
    event.preventDefault();
    searchPin($("campPin").value.trim());
});

async function searchPin(pin) {
    // Check in the browser first (the server checks again)
    if (!/^\d{6}$/.test(pin)) { pinMessage("Please enter a 6-digit PIN code, for example 575001."); $("campPin").focus(); return; }
    if (pin.startsWith("0")) { pinMessage("Indian PIN codes don't start with 0. Please check the number."); $("campPin").focus(); return; }

    const button = $("campPinBtn");
    setBusy(button, true, "");
    pinMessage("Looking up the PIN code…", false);
    try {
        const response = await fetch(`${API_URL}/pincode/${pin}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        pinMessage(`PIN ${pin}: ${data.label} (${data.exact ? "" : "approximate, "}${data.source}).`, false);
        campSearchPin = pin;
        setCampCenter(data.lat, data.lng, `PIN code ${pin} — ${data.label}`, "search");
        loadCamps();
    } catch (error) {
        pinMessage(error.message && !/fetch/i.test(error.message) ? error.message : "Cannot reach the server. Is node server.js running?");
    } finally {
        setBusy(button, false);
    }
}

// ---------- b) City, locality or address (OpenStreetMap) ----------
const campPlaceResults = $("campPlaceResults");
let campFoundPlaces = [];

$("campPlaceForm").addEventListener("submit", async event => {
    event.preventDefault();
    const query = $("campPlaceQuery").value.trim();
    // Only digits? Treat it as a PIN code
    if (/^\d+$/.test(query)) { $("campPin").value = query; campPlaceResults.hidden = true; searchPin(query); return; }
    if (query.length < 2) {
        campPlaceResults.innerHTML = '<li class="message error">Type at least 2 letters of a city or locality.</li>';
        campPlaceResults.hidden = false;
        return;
    }

    const button = $("campPlaceBtn");
    setBusy(button, true, "");
    campPlaceResults.innerHTML = '<li class="message">Searching…</li>';
    campPlaceResults.hidden = false;
    try {
        const data = await searchPlaces(query);
        campFoundPlaces = [...data.places, ...data.bloodBanks];
        let html = campFoundPlaces.map((p, i) => `
            <li><button type="button" data-index="${i}">
                <span class="result-icon">${p.type === "bloodBank" ? "🏥" : "📍"}</span>
                <span><strong>${escapeHtml(p.name)}</strong>
                <small>${escapeHtml(p.displayName || [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", "))}</small></span>
            </button></li>`).join("");
        if (data.placesError) html += `<li class="message error">${escapeHtml(data.placesError)}</li>`;
        if (!campFoundPlaces.length && !data.placesError) {
            html = `<li class="message error">No place found for "${escapeHtml(query)}". Try adding the city or state, a 6-digit PIN code, or click your spot on the map.</li>`;
        }
        campPlaceResults.innerHTML = html;
    } catch (error) {
        campPlaceResults.innerHTML = `<li class="message error">${escapeHtml(error.message)}</li>`;
    } finally {
        setBusy(button, false);
    }
});

campPlaceResults.addEventListener("click", event => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    const place = campFoundPlaces[Number(button.dataset.index)];
    campPlaceResults.hidden = true;
    const pin = place.address ? place.address.pincode : place.pincode;
    campSearchPin = /^\d{6}$/.test(pin || "") ? pin : "";
    setCampCenter(place.lat, place.lng, place.displayName ? place.displayName.split(",").slice(0, 3).join(",") : place.name, "search");
    loadCamps();
});

// ---------- c) GPS: permission is asked only when the button is clicked ----------
$("campGpsBtn").addEventListener("click", async () => {
    const button = $("campGpsBtn");
    setBusy(button, true, "Getting your location…");
    try {
        const { lat, lng } = await getCurrentPosition();
        campSearchPin = "";
        setCampCenter(lat, lng, "your current location", "device");
        loadCamps();
    } catch (error) {
        setCampStatus(error.message + " You can search with your PIN code instead.", "error");
        $("campPin").focus();
    } finally {
        setBusy(button, false);
    }
});

// ---------- d) State + City dropdowns ----------
const campPicker = setupLocationPicker({ stateId: "campState", cityId: "campCity", searchId: "campCitySearch" });

$("campCityForm").addEventListener("submit", async event => {
    event.preventDefault();
    const state = campPicker.getState();
    const city = campPicker.getCity();
    if (!state) { showToast("Please select a State/Union Territory.", "error"); return; }
    campSearchPin = "";
    $("campClearBtn").hidden = false;

    if (!city) {
        clearCampCenter();
        campPlaceFilter = { state };
        setCampStatus(`Showing results in ${state}. Choose a city to sort by distance.`);
        loadCamps();
        return;
    }

    setCampStatus(`Finding ${city} on the map...`);
    const place = await geocodeCity(city, campPicker.getDistrict(), state);
    if (!place) {
        clearCampCenter();
        campPlaceFilter = { state, city };
        setCampStatus(`Couldn't find ${city} on the map (are you offline?). Showing results listed in ${city}, without distances.`, "error");
        loadCamps();
        return;
    }
    setCampCenter(place.lat, place.lng, `${place.label} (city centre)`, "city");
    loadCamps();
});

// ---------- Clear search ----------
$("campClearBtn").addEventListener("click", () => {
    clearCampCenter();
    campPlaceFilter = {};
    campSearchPin = "";
    $("campPin").value = "";
    $("campPlaceQuery").value = "";
    campPlaceResults.hidden = true;
    pinMessage("");
    campPicker.reset();
    setCampRange("0-25");
    $("campFartherChips").hidden = true;
    campSort.value = "date";
    setCampStatus("Showing camps across India. Enter a PIN code or use your location to see the nearest camps, blood banks and hospitals.");
    $("campClearBtn").hidden = true;
    loadCamps();
    campMap.setView([22.5, 79], 5);
});


// ==========================================================
// 2. FILTERS
// ==========================================================
function getCampRange() {
    const [min, max] = document.querySelector('input[name="campRadius"]:checked').value.split("-");
    return { minKm: Number(min), maxKm: max === "any" ? null : Number(max) };
}

function setCampRange(value) {
    const radio = document.querySelector(`input[name="campRadius"][value="${value}"]`);
    if (!radio) return;
    if (radio.closest("#campFartherChips")) $("campFartherChips").hidden = false;
    radio.checked = true;
}

const checkedValues = ids => ids.map(id => $(id)).filter(box => box.checked).map(box => box.value);
const selectedStatuses = () => checkedValues(["stUpcoming", "stOngoing", "stCompleted", "stCancelled"]);
const selectedKinds = () => checkedValues(["stBanks", "stHospitals"]);

$("campSearchBtn").addEventListener("click", () => loadCamps());
campSort.addEventListener("change", () => loadCamps());
document.querySelectorAll('input[name="campRadius"], #stUpcoming, #stOngoing, #stCompleted, #stCancelled, #stBanks, #stHospitals')
    .forEach(el => el.addEventListener("change", () => loadCamps()));


// ==========================================================
// 3. LOAD + SHOW RESULTS
//    camps:                   GET /api/camps
//    blood banks + hospitals: GET /api/map-places
// ==========================================================
async function getJson(url) {
    let response;
    try { response = await fetch(url); }
    catch (error) { throw new Error("Cannot reach the server. Is node server.js running?"); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
}

let loadCounter = 0;
async function loadCamps(opts = {}) {
    const statuses = selectedStatuses();
    const kinds = selectedKinds();
    if (!statuses.length && !kinds.length) {
        showToast("Tick at least one thing to show.", "error");
        return;
    }
    const range = getCampRange();
    const params = new URLSearchParams();
    if (campCenter) {
        params.set("lat", campCenter.lat);
        params.set("lng", campCenter.lng);
        params.set("minKm", range.minKm);
        params.set("maxKm", range.maxKm === null ? "any" : range.maxKm);
    }
    if (campPlaceFilter.state) params.set("state", campPlaceFilter.state);
    if (campPlaceFilter.city) params.set("city", campPlaceFilter.city);

    const placesNeedLocation = kinds.length > 0 && !campCenter && !campPlaceFilter.state;
    const thisLoad = ++loadCounter;
    campResultsCount.textContent = "Loading…";

    try {
        const [campData, placeData] = await Promise.all([
            statuses.length
                ? getJson(`${API_URL}/camps?${params}&` + new URLSearchParams({ status: statuses.join(","), sort: campSort.value }))
                : { camps: [], count: 0, within50: null, nearestKm: null, lastUpdated: "", checkedAt: new Date().toISOString() },
            kinds.length && !placesNeedLocation
                ? getJson(`${API_URL}/map-places?${params}&` + new URLSearchParams({ kinds: kinds.join(","), limit: MAX_PLACES_SHOWN }))
                : { places: [], total: 0 }
        ]);
        if (thisLoad !== loadCounter) return; // a newer search started meanwhile
        renderResults(campData, placeData, range, placesNeedLocation, opts);
    } catch (error) {
        campResultsCount.textContent = "Error";
        campList.innerHTML = `<div class="empty-state"><strong>Cannot load results</strong>${escapeHtml(error.message || "")}</div>`;
    }
}

function rangeLabel(range) {
    if (range.minKm > 0 && range.maxKm === null) return `more than ${range.minKm} km away`;
    if (range.maxKm === null) return "at any distance";
    return `within ${range.maxKm} km`;
}

// "Show route" button (js/camp-route.js)
const routeBtn = (key, cls) => window.CampRoute ? CampRoute.button(key, cls) : "";
const keepByText = list => window.CampRoute ? CampRoute.filterItems(list) : list;

function renderResults(campData, placeData, range, placesNeedLocation, opts) {
    // the quick filter (camp name, city, state or PIN) narrows the list AND the map
    const camps = keepByText(campData.camps.map(c => ({ ...c, type: "camp" })));
    const places = keepByText(placeData.places.map(p => ({ ...p, type: "place" })));
    const byDistance = campCenter && campSort.value === "distance";
    const items = byDistance ? [...camps, ...places].sort((a, b) => a.distanceKm - b.distanceKm) : [...camps, ...places];

    const where = campCenter ? rangeLabel(range)
        : campPlaceFilter.city ? `in ${campPlaceFilter.city}`
        : campPlaceFilter.state ? `in ${campPlaceFilter.state}` : "across India";
    campResultsTitle.textContent = `Results ${where}`;
    const banks = places.filter(p => p.kind === "bank").length;
    const hospitals = places.length - banks;
    campResultsCount.textContent = `${camps.length} camp${camps.length === 1 ? "" : "s"}` +
        (selectedKinds().length && !placesNeedLocation ? ` · ${banks} blood bank${banks === 1 ? "" : "s"} · ${hospitals} hospital${hospitals === 1 ? "" : "s"}` : "");

    renderCampNotice(campData, placeData, range, placesNeedLocation);

    campShown = {};
    items.forEach(x => { campShown[itemKey(x)] = x; });
    campList.innerHTML = items.length
        ? items.map(x => x.type === "camp" ? campCardHTML(x) : placeCardHTML(x)).join("")
        : '<div class="empty-state"><strong>No results to show</strong>Change the filters, try a bigger distance or search another PIN code.</div>';

    $("campUpdated").textContent =
        (campData.lastUpdated ? `Camp information last updated: ${formatDateTime(campData.lastUpdated)}. ` : "") +
        `Statuses checked at ${formatDateTime(campData.checkedAt)}. Only camps verified by our team are listed as real camps. ` +
        "Blood banks and hospitals: official National Health Portal directory; call before going, stock is not shown.";

    drawCampMap(items, range, opts);
}

// "No verified blood donation camps found nearby..." + other notes
function renderCampNotice(campData, placeData, range, placesNeedLocation) {
    const parts = [];
    if (campCenter && selectedStatuses().length && campData.count === 0) {
        const button = (value, text) => `<button type="button" class="btn btn-light btn-sm" data-range="${value}">${text}</button>`;
        let html = "<strong>No verified blood donation camps found nearby. Try expanding your search or selecting another city.</strong>";
        if (campData.nearestKm !== null) html += `The nearest matching camp is about ${Math.round(campData.nearestKm)} km away.`;
        if (placeData.places.length) html += " Blood banks and hospitals near you are listed below.";
        const options = [];
        if (range.maxKm !== null && range.maxKm < 50) options.push(button("0-50", "Within 50 km"));
        if (range.maxKm !== null && campData.within50 === 0) {
            [75, 100, 150].filter(km => km > range.maxKm).forEach(km => options.push(button(`0-${km}`, `Within ${km} km`)));
        }
        if (range.maxKm !== null) options.push(button("0-any", "All distances"));
        if (options.length) html += `<div class="inline-row">${options.join("")}</div>`;
        parts.push(html);
    }
    if (placesNeedLocation) parts.push("Enter a PIN code, use your location or choose a state to see blood banks and hospitals.");
    if (placeData.total > placeData.places.length) {
        parts.push(`Showing the ${placeData.places.length} ${campCenter ? "nearest" : "first"} of ${placeData.total} blood banks and hospitals. ` +
            (campCenter ? "Choose a smaller distance to narrow it down." : "Choose a city or PIN code to sort them by distance."));
    }
    campNotice.innerHTML = parts.map(p => `<div>${p}</div>`).join("");
    campNotice.hidden = !parts.length;
}

// Expand the search without starting over
campNotice.addEventListener("click", event => {
    const button = event.target.closest("[data-range]");
    if (!button) return;
    setCampRange(button.dataset.range);
    loadCamps();
});


// ---------- formatting ----------
const itemKey = x => (x.type === "camp" ? "camp:" : "place:") + x.id;

// "2026-10-24" -> "Oct"
function monthShort(dateText) {
    return new Date(`${dateText}T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
}
function formatDate(dateText) {
    return new Date(`${dateText}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function formatTime(time) {
    const [h, m] = time.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function formatDateTime(iso) {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

// Google Maps directions, starting from the user's point (not a city centre)
function directionsTo(lat, lng) {
    const destination = `${lat},${lng}`;
    const params = new URLSearchParams({ api: "1", destination });
    const origin = campCenter ? `${campCenter.lat},${campCenter.lng}` : "";
    if (campCenter && campCenter.source !== "city" && origin !== destination) params.set("origin", origin);
    return "https://www.google.com/maps/dir/?" + params;
}

const campAddress = c => `${c.venue}, ${c.city}, ${c.state}${c.pincode ? " - " + c.pincode : ""}`;
const placeAddress = p => [p.address, p.city, p.state].filter(Boolean).join(", ") + (p.pincode ? " - " + p.pincode : "");

function campContactHTML(c) {
    if (c.isDemo) return contactButton(c, c.contactPhone); // "demo number, not callable"
    if (!c.contactVerified) return "Contact details not verified yet";
    return [c.contactName ? escapeHtml(c.contactName) : "",
        c.contactPhone ? `<a href="tel:${escapeHtml(c.contactPhone)}">📞 ${escapeHtml(c.contactPhone)}</a>` : "",
        c.contactEmail ? `<a href="mailto:${escapeHtml(c.contactEmail)}">✉ ${escapeHtml(c.contactEmail)}</a>` : ""].filter(Boolean).join(" · ");
}
const samePin = x => campSearchPin && x.pincode === campSearchPin ? '<span class="pill pill-green">Same PIN code</span>' : "";
const isActive = c => c.status !== "completed" && c.status !== "cancelled";

function campCardHTML(c) {
    return `
        <article class="donor-card camp-card ${c.isDemo ? "is-demo" : ""} status-${c.status}" data-item="${escapeHtml(itemKey(c))}">
            <div class="camp-date-badge"><span>${escapeHtml(monthShort(c.date))}</span><b>${escapeHtml(c.date.slice(8))}</b></div>
            <div>
                <div class="donor-top">
                    <h3>${escapeHtml(c.name)}</h3>
                    ${c.distanceKm !== undefined ? `<span class="distance">${c.distanceKm} km</span>` : ""}
                </div>
                <div class="card-pills">
                    <span class="pill camp-status ${c.status}">${STATUS_TEXT[c.status] || c.status}</span>
                    ${c.isDemo ? `<span class="pill pill-demo">${escapeHtml(c.demoLabel)}</span>` : '<span class="pill pill-green">Verified</span>'}
                    ${samePin(c)}
                </div>
                <p class="donor-meta"><b>${escapeHtml(formatDate(c.date))}</b> · ${formatTime(c.startTime)} – ${formatTime(c.endTime)} (IST)</p>
                <p class="bank-address">Organised by <b>${escapeHtml(c.organiser)}</b><br>${escapeHtml(campAddress(c))}</p>
                ${c.status === "cancelled" ? `<p class="lab-note" style="color:var(--red-dark)">Cancelled: ${escapeHtml(c.reviewNote || "")}</p>` : ""}
                <div class="bank-contacts"><span>${campContactHTML(c)}</span></div>
                <div class="donor-actions">
                    <button type="button" class="btn btn-light btn-sm" data-detail="${escapeHtml(itemKey(c))}">View details</button>
                    ${isActive(c) ? routeBtn(itemKey(c)) + `<a class="btn btn-primary btn-sm" href="${directionsTo(c.latitude, c.longitude)}" target="_blank" rel="noopener">Get directions ↗</a>` : ""}
                </div>
                ${c.isDemo ? '<p class="stock-note">Sample data for testing the tracker. Do not travel to this camp.</p>' : ""}
            </div>
        </article>`;
}

function placeCardHTML(p) {
    const phones = [...(p.phones || []), ...(p.helpline || [])];
    const hospital = p.kind === "hospital";
    return `
        <article class="donor-card bank-card" data-item="${escapeHtml(itemKey(p))}">
            <div class="bank-badge text-badge ${hospital ? "hospital-badge" : ""}">${hospital ? "H" : "+"}</div>
            <div>
                <div class="donor-top">
                    <h3>${escapeHtml(p.name)}</h3>
                    ${p.distanceKm !== undefined ? `<span class="distance">${p.distanceKm} km</span>` : ""}
                </div>
                <div class="card-pills">
                    <span class="pill ${hospital ? "pill-hospital" : "pill-red"}">${hospital ? "Hospital blood bank" : "Blood bank"}</span>
                    ${p.category ? `<span class="pill pill-gray">${escapeHtml(p.category)}</span>` : ""}
                    ${p.location === "approximate" ? '<span class="pill pill-amber">Approximate location</span>' : ""}
                    ${samePin(p)}
                </div>
                <p class="bank-address">${escapeHtml(placeAddress(p))}</p>
                <div class="bank-contacts"><span>${phones.length ? phones.slice(0, 2).map(n => `<a href="tel:${escapeHtml(n)}">📞 ${escapeHtml(n)}</a>`).join(" · ") : "No phone number listed"}</span></div>
                <div class="donor-actions">
                    <button type="button" class="btn btn-light btn-sm" data-detail="${escapeHtml(itemKey(p))}">View details</button>
                    ${routeBtn(itemKey(p))}
                    <a class="btn btn-primary btn-sm" href="${directionsTo(p.lat, p.lng)}" target="_blank" rel="noopener">Get directions ↗</a>
                </div>
            </div>
        </article>`;
}


// ---------- map pins ----------
function popupHTML(x) {
    if (x.type === "camp") {
        return `<div class="map-popup"><b>${escapeHtml(x.name)}</b>${x.isDemo ? `<br><b class="popup-demo">${escapeHtml(x.demoLabel)}</b>` : ""}
            <br><span class="camp-status-text ${x.status}">${STATUS_TEXT[x.status]}</span> · ${escapeHtml(formatDate(x.date))}, ${formatTime(x.startTime)} – ${formatTime(x.endTime)}
            <br>${escapeHtml(campAddress(x))}<br>${campContactHTML(x)}${x.distanceKm !== undefined ? `<br>${x.distanceKm} km away` : ""}
            <div class="popup-actions"><button type="button" class="popup-btn" data-detail="${escapeHtml(itemKey(x))}">View details</button>${isActive(x) ? routeBtn(itemKey(x), "popup-btn popup-btn-light") + `<a href="${directionsTo(x.latitude, x.longitude)}" target="_blank" rel="noopener">Get directions ↗</a>` : ""}</div></div>`;
    }
    const phones = [...(x.phones || []), ...(x.helpline || [])];
    return `<div class="map-popup"><b>${escapeHtml(x.name)}</b><br>${x.kind === "hospital" ? "Hospital blood bank" : "Blood bank"}${x.category ? " · " + escapeHtml(x.category) : ""}
        <br>${escapeHtml(placeAddress(x))}${phones.length ? "<br>📞 " + escapeHtml(phones[0]) : ""}${x.distanceKm !== undefined ? `<br>${x.distanceKm} km away` : ""}
        <div class="popup-actions"><button type="button" class="popup-btn" data-detail="${escapeHtml(itemKey(x))}">View details</button>${routeBtn(itemKey(x), "popup-btn popup-btn-light")}<a href="${directionsTo(x.lat, x.lng)}" target="_blank" rel="noopener">Get directions ↗</a></div></div>`;
}

function drawCampMap(items, range, opts = {}) {
    campLayer.clearLayers();
    campCircleLayer.clearLayers();
    Object.keys(campMarkers).forEach(k => delete campMarkers[k]);

    const points = [];
    items.forEach(x => {
        const latLng = x.type === "camp" ? [x.latitude, x.longitude] : [x.lat, x.lng];
        const marker = L.marker(latLng, { icon: x.type === "camp" ? campIcon(x) : placeIcon(x), zIndexOffset: x.type === "camp" ? 500 : 0 })
            .bindPopup(popupHTML(x), { maxWidth: 280 });
        marker.on("click", () => highlightItem(itemKey(x)));
        marker.addTo(campLayer);
        campMarkers[itemKey(x)] = marker;
        points.push(latLng);
    });
    if (opts.keepView) return;

    if (campCenter) {
        const center = [campCenter.lat, campCenter.lng];
        if (range.maxKm !== null) {
            L.circle(center, { radius: range.maxKm * 1000, color: "#c8102e", weight: 1.5, fillOpacity: 0.05, interactive: false }).addTo(campCircleLayer);
        }
        points.push(center);
        if (range.maxKm !== null && range.maxKm <= 50) {
            campMap.fitBounds(L.latLng(center).toBounds(range.maxKm * 2000), { padding: [20, 20] });
            return;
        }
    }
    if (points.length > 1) campMap.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    else if (points.length === 1) campMap.setView(points[0], 11);
}

function highlightItem(key) {
    document.querySelectorAll("#campList [data-item]").forEach(card => card.classList.toggle("selected", card.dataset.item === key));
    const card = document.querySelector(`#campList [data-item="${CSS.escape(key)}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Clicking a card (not its buttons) opens its pin on the map
campList.addEventListener("click", event => {
    if (event.target.closest("a, button")) return;
    const card = event.target.closest("[data-item]");
    if (!card) return;
    const marker = campMarkers[card.dataset.item];
    if (marker) {
        campMap.setView(marker.getLatLng(), 14);
        marker.openPopup();
        highlightItem(card.dataset.item);
    }
});


// ==========================================================
// VIEW DETAILS (pop-up window)
// ==========================================================
function detailRow(label, value) {
    return value ? `<div class="detail-row"><dt>${label}</dt><dd>${value}</dd></div>` : "";
}
const distanceText = x => x.distanceKm !== undefined
    ? `${x.distanceKm} km from ${escapeHtml(campCenter.label)} (straight line)` : "Set a location to see the distance";

function openDetails(key) {
    const x = campShown[key];
    if (!x) return;
    let html;
    if (x.type === "camp") {
        html = `
            <div class="card-pills"><span class="pill camp-status ${x.status}">${STATUS_TEXT[x.status]}</span>${x.isDemo ? `<span class="pill pill-demo">${escapeHtml(x.demoLabel)}</span>` : '<span class="pill pill-green">Verified by our team</span>'}</div>
            <h2 id="detailTitle">${escapeHtml(x.name)}</h2>
            <dl class="detail-list">
                ${detailRow("Date", escapeHtml(formatDate(x.date)))}
                ${detailRow("Time", `${formatTime(x.startTime)} – ${formatTime(x.endTime)} (IST)`)}
                ${detailRow("Organiser", `${escapeHtml(x.organiser)} (${escapeHtml(x.organiserType)})`)}
                ${detailRow("Address", escapeHtml(`${x.venue}, ${x.city}, ${x.district ? x.district + " district, " : ""}${x.state}`))}
                ${detailRow("PIN code", x.pincode ? escapeHtml(x.pincode) + (x.pincodeNote ? ` <small class="hint">(${escapeHtml(x.pincodeNote)})</small>` : "") : "Not given")}
                ${detailRow("Coordinates", `${x.latitude.toFixed(5)}, ${x.longitude.toFixed(5)}`)}
                ${detailRow("Contact", campContactHTML(x))}
                ${detailRow("Distance", distanceText(x))}
                ${detailRow("Registration", x.registrationLink ? `<a class="text-link" href="${escapeHtml(x.registrationLink)}" target="_blank" rel="noopener">Register to donate ↗</a>` : "")}
                ${detailRow("Note", escapeHtml(x.reviewNote || ""))}
                ${detailRow("Last updated", escapeHtml(formatDateTime(x.updatedAt)))}
            </dl>
            ${x.isDemo ? '<p class="lab-note">This is sample data for demonstrating the tracker. It is not a real camp: do not travel to it or call the number.</p>' : ""}
            <div class="donor-actions">
                ${isActive(x) ? routeBtn(key, "btn btn-light") + `<a class="btn btn-primary" href="${directionsTo(x.latitude, x.longitude)}" target="_blank" rel="noopener">Get directions ↗</a>` : ""}
                <button type="button" class="btn btn-light" data-show-on-map="${escapeHtml(key)}">Show on map</button>
            </div>`;
    } else {
        html = `
            <div class="card-pills"><span class="pill ${x.kind === "hospital" ? "pill-hospital" : "pill-red"}">${x.kind === "hospital" ? "Hospital blood bank" : "Blood bank"}</span>${x.category ? `<span class="pill pill-gray">${escapeHtml(x.category)}</span>` : ""}</div>
            <h2 id="detailTitle">${escapeHtml(x.name)}</h2>
            <dl class="detail-list">
                ${detailRow("Address", escapeHtml([x.address, x.city, x.district ? x.district + " district" : "", x.state].filter(Boolean).join(", ")))}
                ${detailRow("PIN code", escapeHtml(x.pincode || "Not listed"))}
                ${detailRow("Coordinates", `${x.lat.toFixed(5)}, ${x.lng.toFixed(5)}${x.location === "approximate" ? " (approximate)" : ""}`)}
                ${detailRow("Phone", (x.phones || []).map(n => `<a href="tel:${escapeHtml(n)}">📞 ${escapeHtml(n)}</a>`).join("<br>") || "Not listed")}
                ${detailRow("Helpline", escapeHtml((x.helpline || []).join(", ")))}
                ${detailRow("E-mail", escapeHtml(x.email || ""))}
                ${detailRow("Open", escapeHtml(x.serviceTime || ""))}
                ${detailRow("Distance", distanceText(x))}
            </dl>
            <p class="stock-note">Source: National Health Portal blood bank directory. Blood stock is not shown: please call to check availability.</p>
            <div class="donor-actions">
                ${routeBtn(key, "btn btn-light")}
                <a class="btn btn-primary" href="${directionsTo(x.lat, x.lng)}" target="_blank" rel="noopener">Get directions ↗</a>
                <button type="button" class="btn btn-light" data-show-on-map="${escapeHtml(key)}">Show on map</button>
            </div>`;
    }
    $("detailBody").innerHTML = html;
    $("detailModal").hidden = false;
    document.body.classList.add("modal-open");
    $("detailClose").focus();
}

function closeDetails() {
    $("detailModal").hidden = true;
    document.body.classList.remove("modal-open");
}

// "View details" buttons on cards AND in map pop-ups
document.addEventListener("click", event => {
    const detail = event.target.closest("[data-detail]");
    if (detail) { event.preventDefault(); openDetails(detail.dataset.detail); return; }
    const show = event.target.closest("[data-show-on-map]");
    if (show) {
        closeDetails();
        const marker = campMarkers[show.dataset.showOnMap];
        if (marker) {
            $("campMap").scrollIntoView({ behavior: "smooth", block: "center" });
            campMap.setView(marker.getLatLng(), 15);
            marker.openPopup();
        }
    }
});
$("detailClose").addEventListener("click", closeDetails);
$("detailModal").addEventListener("click", event => { if (event.target === $("detailModal")) closeDetails(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("detailModal").hidden) closeDetails(); });


// ==========================================================
// 4. REGISTER A CAMP (organisers)  ->  POST /api/camps
// ==========================================================
const formPicker = setupLocationPicker({ stateId: "cfState", cityId: "cfCity", searchId: "cfCitySearch" });
const campForm = document.getElementById("campForm");
const val = id => document.getElementById(id).value.trim();

// Earliest date allowed = today
document.getElementById("cfDate").min = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// Look up the venue's coordinates from its address (OpenStreetMap)
document.getElementById("cfFindBtn").addEventListener("click", async () => {
    const hint = document.getElementById("cfFindHint");
    const query = [val("cfVenue"), formPicker.getCity(), formPicker.getState(), val("cfPincode")].filter(Boolean).join(", ");
    if (!val("cfVenue") || !formPicker.getCity()) {
        hint.textContent = "Fill in the venue address, state and city first.";
        return;
    }
    hint.textContent = "Searching...";
    try {
        let place = (await searchPlaces(query)).places[0];
        // Full address not found? Try the city only, and say so
        let approximate = false;
        if (!place) {
            place = (await searchPlaces(`${plainCityName(formPicker.getCity())}, ${formPicker.getState()}`)).places[0];
            approximate = true;
        }
        if (!place) {
            hint.textContent = "Not found. Leave the coordinates empty: our team will add them during review.";
            return;
        }
        document.getElementById("cfLat").value = place.lat.toFixed(6);
        document.getElementById("cfLng").value = place.lng.toFixed(6);
        hint.textContent = approximate
            ? "Only the city was found, so these are the city centre's coordinates. Please correct them if you can."
            : `Found: ${place.displayName}. Please check this is the venue.`;
    } catch (error) {
        hint.textContent = error.message;
    }
});

campForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!document.getElementById("cfAuthorised").checked) {
        showToast("Please confirm you are authorised to submit this camp.", "error");
        return;
    }
    const camp = {
        name: val("cfName"), organiser: val("cfOrganiser"), organiserType: val("cfOrganiserType"),
        venue: val("cfVenue"), state: formPicker.getState(), city: formPicker.getCity(), district: formPicker.getDistrict(),
        pincode: val("cfPincode"), date: val("cfDate"), startTime: val("cfStart"), endTime: val("cfEnd"),
        contactName: val("cfContactName"), contactPhone: val("cfPhone"), contactEmail: val("cfEmail"),
        registrationLink: val("cfLink"), latitude: val("cfLat"), longitude: val("cfLng")
    };

    const button = document.getElementById("cfSubmit");
    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/camps`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...idempotencyHeaders(campForm) },
            credentials: "same-origin",     // if logged in, the server e-mails a confirmation
            body: JSON.stringify(camp)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        submissionDone(campForm);
        showToast(resultMessage(data), "success");
        campForm.reset();
        formPicker.reset();
    } catch (error) {
        showToast(error.message || "Cannot reach the server.", "error");
    } finally {
        button.disabled = false;
    }
});


// ==========================================================
// 5. ADMIN REVIEW  (needs the ADMIN_KEY set on the server)
// ==========================================================
const adminList = document.getElementById("adminList");
let adminKey = "";

document.getElementById("adminKeyForm").addEventListener("submit", event => {
    event.preventDefault();
    adminKey = document.getElementById("adminKey").value;
    loadAdminCamps();
});

async function loadAdminCamps() {
    try {
        const response = await fetch(`${API_URL}/camps/review?` + new URLSearchParams({ key: adminKey }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        adminList.innerHTML = data.camps.map(c => `
            <div class="admin-camp" data-id="${c.id}">
                <div class="card-pills">
                    <span class="pill ${c.reviewStatus === "pending" ? "pill-amber" : "pill-green"}">${c.reviewStatus === "pending" ? "Waiting for review" : "Approved"}</span>
                    <span class="pill camp-status ${c.status}">${STATUS_TEXT[c.status] || c.status}</span>
                    ${c.isDemo ? '<span class="pill pill-demo">DEMO</span>' : ""}
                </div>
                <h3>${escapeHtml(c.name)}</h3>
                <p class="donor-meta">${escapeHtml(c.organiser)} (${escapeHtml(c.organiserType)}) · ${escapeHtml(c.date)} ${escapeHtml(c.startTime)}–${escapeHtml(c.endTime)}<br>
                   ${escapeHtml(c.venue)}, ${escapeHtml(c.city)}, ${escapeHtml(c.state)} ${escapeHtml(c.pincode || "")}<br>
                   Contact: ${escapeHtml(c.contactName || "-")} ${escapeHtml(c.contactPhone || "")} ${escapeHtml(c.contactEmail || "")}
                   ${c.registrationLink ? `<br>Link: ${escapeHtml(c.registrationLink)}` : ""}</p>
                ${c.reviewStatus === "pending" ? `
                    <div class="inline-row">
                        <input type="text" class="a-lat" placeholder="Latitude" value="${c.latitude ?? ""}">
                        <input type="text" class="a-lng" placeholder="Longitude" value="${c.longitude ?? ""}">
                    </div>
                    <label class="check-row"><input type="checkbox" class="a-contact"> I checked the contact details (show them publicly)</label>
                    <div class="donor-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-action="approve">Approve</button>
                        <button type="button" class="btn btn-light btn-sm" data-action="reject">Reject</button>
                    </div>` : `
                    <div class="inline-row">
                        <input type="date" class="a-date" value="${escapeHtml(c.date)}">
                        <input type="time" class="a-start" value="${escapeHtml(c.startTime)}">
                        <input type="time" class="a-end" value="${escapeHtml(c.endTime)}">
                        <input type="text" class="a-note" placeholder="Reason (shown publicly)">
                    </div>
                    <div class="donor-actions">
                        <button type="button" class="btn btn-light btn-sm" data-action="reschedule">Save new date/time</button>
                        <button type="button" class="btn btn-light btn-sm" data-action="cancel">Mark as cancelled</button>
                    </div>`}
            </div>`).join("") || '<p class="hint">No camps yet.</p>';
    } catch (error) {
        adminList.innerHTML = `<p class="location-status error">${escapeHtml(error.message || "Cannot reach the server.")}</p>`;
    }
}

adminList.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const box = button.closest(".admin-camp");
    const get = cls => box.querySelector(cls) ? box.querySelector(cls).value.trim() : undefined;
    const body = { key: adminKey, action: button.dataset.action };

    if (body.action === "approve") {
        body.latitude = get(".a-lat");
        body.longitude = get(".a-lng");
        body.contactVerified = box.querySelector(".a-contact").checked;
    }
    if (body.action === "reschedule") {
        body.date = get(".a-date");
        body.startTime = get(".a-start");
        body.endTime = get(".a-end");
        body.note = get(".a-note") || "Date/time updated by the organiser.";
    }
    if (body.action === "cancel") body.note = get(".a-note") || "Cancelled by the organiser.";

    try {
        const response = await fetch(`${API_URL}/camps/${box.dataset.id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showToast(data.message, "success");
        loadAdminCamps();
        loadCamps();
    } catch (error) {
        showToast(error.message || "Cannot reach the server.", "error");
    }
});


// ==========================================================
// START: all upcoming/ongoing camps in India, refreshed every
// 5 minutes so statuses (upcoming -> ongoing -> completed) stay current
// ==========================================================
// "Blood Banks" link (camps.html?view=banks): start with blood banks + hospitals only
if (new URLSearchParams(location.search).get("view") === "banks") {
    ["stUpcoming", "stOngoing"].forEach(id => { $(id).checked = false; });
    setCampStatus("Showing blood banks and hospitals. Enter your PIN code or use your location to see the nearest ones.");
    $("campPin").focus();
}
loadCamps();
setInterval(() => { if (!document.hidden) loadCamps({ keepView: true }); }, 5 * 60 * 1000);
