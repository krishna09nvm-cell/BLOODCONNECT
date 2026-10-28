// ==========================================================
// FIND-DONOR.JS
// Part A: location-based search for DONORS and BLOOD BANKS
//         - search any place (address, city, state, PIN code,
//           blood bank name) using OpenStreetMap geocoding
//         - browser Geolocation / GPS (one time or live),
//           clicking the map, OR State + City dropdowns
//         - distance filter (5/10/25/50 km, more than 50, all,
//           and 75/100/150 km when searching farther)
//         - results sorted nearest first, shown as cards + on a map
//         - "Get directions" links (Google Maps)
// Part B: "All donors" directory (filter, edit, delete)
//
// Privacy: the server never sends a donor's exact location.
// Donors are shown at an approximate area (about 1 km).
// ==========================================================

// ---------- Page elements ----------
const useLocationBtn = document.getElementById("useLocationBtn");
const liveLocation = document.getElementById("liveLocation");
const cityForm = document.getElementById("cityForm");
const locationStatus = document.getElementById("locationStatus");
const bloodGroupFilter = document.getElementById("bloodGroupFilter");
const compatibleFilter = document.getElementById("compatibleFilter");
const showDonors = document.getElementById("showDonors");
const showBanks = document.getElementById("showBanks");
const searchBtn = document.getElementById("searchBtn");
const resultsList = document.getElementById("resultsList");
const resultsTitle = document.getElementById("resultsTitle");
const resultsCount = document.getElementById("resultsCount");
const searchNotice = document.getElementById("searchNotice");
const sourceNote = document.getElementById("sourceNote");

const ERAKTKOSH_URL = "https://eraktkosh.mohfw.gov.in/";

// The point we measure distances from: { lat, lng, label, source }
//   source = "device" (Geolocation) | "city" (State + City) | "map" (clicked)
let searchCenter = null;

// When a city has no map position we list what is registered in
// that city instead (no distances). { state, city, district }
let cityOnlySearch = null;

let lastItems = [];        // donors + blood banks from the last search
let activeTab = "all";     // "all" | "donor" | "bloodBank"
let liveWatchId = null;    // id from navigator.geolocation.watchPosition

// Fill both blood group dropdowns
BLOOD_GROUPS.forEach(group => {
    const option = `<option value="${group}">${group}</option>`;
    bloodGroupFilter.innerHTML += option;
    document.getElementById("allBloodGroup").innerHTML += option;
});

// State + City dropdowns (see location-picker.js)
const locPicker = setupLocationPicker({
    stateId: "locState", cityId: "locCity",
    searchId: "locCitySearch", countId: "locCityCount"
});

const allPicker = setupLocationPicker({
    stateId: "allState", cityId: "allCity", searchId: "allCitySearch"
});


// ==========================================================
// MAP SETUP (Leaflet + OpenStreetMap)
// ==========================================================
const map = L.map("map").setView([20.5937, 78.9629], 5); // centre of India

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const resultLayer = L.layerGroup().addTo(map); // donor areas + blood bank markers
const circleLayer = L.layerGroup().addTo(map); // distance circles
let userMarker = null;                          // marker for the search point
let accuracyCircle = null;                      // GPS accuracy (e.g. +/- 30 m)
const markersByKey = {};                        // "donor-3" / "bloodBank-bb12" -> marker

// Demo donors get a grey, dashed "test" marker so they can't be mistaken for real donors
function donorIcon(donor) {
    const style = donor.isDemo ? "demo" : donor.availability !== "Available" ? "unavailable" : "";
    return L.divIcon({
        className: "",
        html: `<div class="donor-pin ${style}"><span>${escapeHtml(donor.bloodGroup)}</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 43],
        popupAnchor: [0, -40]
    });
}

const bankIcon = L.divIcon({
    className: "",
    html: '<div class="bank-pin">+</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14]
});

// Blue dot = your GPS position
const userIcon = L.divIcon({
    className: "",
    html: '<div class="user-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

// Blue pin = a place you searched for or clicked on the map
const searchPinIcon = L.divIcon({
    className: "",
    html: '<div class="search-pin"></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34]
});


// ==========================================================
// 1. SETTING THE SEARCH LOCATION
// ==========================================================
function setStatus(message, type = "") {
    locationStatus.textContent = message;
    locationStatus.className = "location-status " + type;
}

// source = "device" (GPS) | "search" (search bar) | "map" (clicked) | "city" (dropdowns)
// accuracy = GPS accuracy in metres (only for "device")
function setSearchCenter(lat, lng, label, source, accuracy) {
    searchCenter = { lat, lng, label, source };
    cityOnlySearch = null;
    setStatus(`📍 Searching near ${label}`, "ok");

    const icon = source === "device" ? userIcon : searchPinIcon;
    if (userMarker) userMarker.setLatLng([lat, lng]).setIcon(icon);
    else userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    userMarker.bindPopup(`<b>Search location</b><br>${escapeHtml(label)}`);

    // Light-blue circle = how accurate the GPS position is
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    if (source === "device" && accuracy) {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy, color: "#8f0b21", weight: 1, fillOpacity: 0.1, interactive: false
        }).addTo(map);
    }
}


// ==========================================================
// 1a. PLACE DETAILS: address, city, state, PIN of the chosen point
// ==========================================================
const placeInfo = document.getElementById("placeInfo");

function showPlaceInfo(place, extra = {}) {
    if (!place) {
        placeInfo.innerHTML = `<h3>${escapeHtml(extra.title || "Selected location")}</h3>
            <span class="hint">The address of this point could not be found (no internet, or nothing is mapped here).
            Distances still work.</span>`;
        placeInfo.hidden = false;
        return;
    }

    const a = place.address || {};
    const rows = [
        ["Place", place.name],
        ["Address", [a.road, a.area].filter(Boolean).join(", ")],
        ["City", (place.lgd && place.lgd.city) || a.city],
        ["District", (place.lgd && place.lgd.district) || a.district],
        ["State", (place.lgd && place.lgd.state) || a.state],
        ["PIN code", a.pincode || place.pincode],
        ["GPS accuracy", extra.accuracy ? `about ${Math.round(extra.accuracy)} m` : ""],
        ["Coordinates", `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`]
    ].filter(([, value]) => value);

    placeInfo.innerHTML = `
        <h3>${escapeHtml(extra.title || "Selected location")}</h3>
        <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
        <span class="hint">Source: ${escapeHtml(place.source || "OpenStreetMap")}</span>`;
    placeInfo.hidden = false;

    // Also select the matching State + City in the dropdowns
    if (place.lgd && place.lgd.state) {
        locPicker.setValue(place.lgd.state, place.lgd.city, place.lgd.district);
    }
}

// Look up the address of a point, then show it (only if it is still the search point)
async function describePoint(lat, lng, extra) {
    placeInfo.innerHTML = '<span class="hint">Finding the address of this point...</span>';
    placeInfo.hidden = false;
    const place = await reverseGeocodePlace(lat, lng);
    if (!searchCenter || searchCenter.lat !== lat || searchCenter.lng !== lng) return;
    showPlaceInfo(place, extra);
    return place;
}


// ==========================================================
// 1b. SEARCH ANY PLACE (address, area, city, state, PIN, blood bank)
//     GET /api/places?q=...  (backend asks OpenStreetMap)
// ==========================================================
const placeSearchForm = document.getElementById("placeSearchForm");
const placeQuery = document.getElementById("placeQuery");
const placeResults = document.getElementById("placeResults");
const placeSearchBtn = document.getElementById("placeSearchBtn");
let foundPlaces = []; // results of the last search (places + blood banks)

placeSearchForm.addEventListener("submit", async event => {
    event.preventDefault();
    const query = placeQuery.value.trim();

    if (query.length < 2) {
        showPlaceMessage("Type an address, city, PIN code or blood bank name.", true);
        return;
    }

    placeSearchBtn.disabled = true;
    placeSearchBtn.innerHTML = '<span class="spinner"></span>';
    showPlaceMessage(`Searching for "${query}"...`);

    try {
        const data = await searchPlaces(query);
        renderPlaceResults(query, data);
    } catch (error) {
        showPlaceMessage(error.message, true);
    } finally {
        placeSearchBtn.disabled = false;
        placeSearchBtn.textContent = "Search";
    }
});

function showPlaceMessage(text, isError) {
    placeResults.innerHTML = `<li class="message ${isError ? "error" : ""}">${escapeHtml(text)}</li>`;
    placeResults.hidden = false;
}

function renderPlaceResults(query, data) {
    // Places first (what most people type), then blood banks
    foundPlaces = [...data.places, ...data.bloodBanks];
    let html = "";

    if (data.places.length) {
        html += '<li class="group-title">Places (OpenStreetMap)</li>';
        html += data.places.map((p, i) => `
            <li><button type="button" data-index="${i}">
                <span class="result-icon">📍</span>
                <span><strong>${escapeHtml(p.name)}</strong>
                <small>${escapeHtml(p.displayName)}</small></span>
            </button></li>`).join("");
    }
    if (data.bloodBanks.length) {
        html += '<li class="group-title">Blood banks</li>';
        html += data.bloodBanks.map((b, i) => `
            <li><button type="button" data-index="${data.places.length + i}">
                <span class="result-icon">🏥</span>
                <span><strong>${escapeHtml(b.name)}</strong>
                <small>${escapeHtml([b.address, b.city, b.state, b.pincode].filter(Boolean).join(", "))}</small></span>
            </button></li>`).join("");
    }
    if (data.placesError) {
        html += `<li class="message error">${escapeHtml(data.placesError)}</li>`;
    }
    if (!foundPlaces.length && !data.placesError) {
        html = `<li class="message error">No place found for "${escapeHtml(query)}". Check the spelling, add the
                city or state (e.g. "Kadri, Mangaluru"), or try a 6-digit PIN code.</li>`;
    }

    placeResults.innerHTML = html;
    placeResults.hidden = false;
}

// Picking a result puts a marker there and searches around it
placeResults.addEventListener("click", event => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    selectFoundPlace(foundPlaces[Number(button.dataset.index)]);
});

function selectFoundPlace(item) {
    placeResults.hidden = true;
    stopLiveLocation();

    if (item.type === "bloodBank") {
        setSearchCenter(item.lat, item.lng, item.name, "search");
        showPlaceInfo({
            name: item.name, lat: item.lat, lng: item.lng, pincode: item.pincode,
            address: { road: item.address, city: item.city, district: item.district, state: item.state },
            source: "Blood Bank Directory, National Health Portal",
            lgd: findState(item.state) ? { state: item.state, city: item.city, district: "" } : null
        }, { title: "Selected blood bank" });
    } else {
        setSearchCenter(item.lat, item.lng, item.name, "search");
        showPlaceInfo(item, { title: "Selected place" });
    }
    search();
}

// Close the results list with Escape
placeQuery.addEventListener("keydown", event => {
    if (event.key === "Escape") placeResults.hidden = true;
});


// ==========================================================
// 1c. CLICK ON THE MAP to choose a point
// ==========================================================
map.on("click", event => {
    const { lat, lng } = event.latlng;
    stopLiveLocation();
    setSearchCenter(lat, lng, "the point you clicked", "map");
    search({ keepView: true });
    describePoint(lat, lng, { title: "Point you clicked" }).then(place => {
        if (place && searchCenter && searchCenter.source === "map") {
            searchCenter.label = `the point you clicked (${place.lgd && place.lgd.city ? place.lgd.city : place.name})`;
            setStatus(`📍 Searching near ${searchCenter.label}`, "ok");
        }
    });
});

// What to do when the browser can't give us a location
function locationFailed(error) {
    setStatus(error.message + " You can search for a place above, click on the map, or choose your state and city.", "error");
    placeQuery.focus();
}

// Option 1a: "Use my current location" (one time, asks permission)
useLocationBtn.addEventListener("click", async () => {
    const originalText = useLocationBtn.innerHTML;
    useLocationBtn.disabled = true;
    useLocationBtn.innerHTML = '<span class="spinner"></span> Getting your location...';

    try {
        const { lat, lng, accuracy } = await getCurrentPosition();
        setSearchCenter(lat, lng, "your current location", "device", accuracy);
        search();

        // Show the address / state / city of this point (needs internet)
        const place = await describePoint(lat, lng, { title: "Your current location", accuracy });
        if (place && place.lgd && searchCenter && searchCenter.source === "device") {
            const where = [place.lgd.city, place.lgd.state].filter(Boolean).join(", ");
            searchCenter.label = `your current location (${where})`;
            setStatus(`📍 Searching near ${searchCenter.label}`, "ok");
        }
    } catch (error) {
        locationFailed(error);
    } finally {
        useLocationBtn.disabled = false;
        useLocationBtn.innerHTML = originalText;
    }
});

// Option 1b: live location - results update as the user moves
liveLocation.addEventListener("change", () => {
    if (!liveLocation.checked) {
        stopLiveLocation();
        return;
    }
    if (!navigator.geolocation) {
        liveLocation.checked = false;
        locationFailed(new Error("Your browser does not support location access."));
        return;
    }

    setStatus("Waiting for your live location...");
    liveWatchId = navigator.geolocation.watchPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Only search again if we moved more than 200 m
            const moved = !searchCenter || searchCenter.source !== "device" ||
                getDistanceKmBrowser(searchCenter.lat, searchCenter.lng, lat, lng) > 0.2;
            if (!moved) return;

            const first = !searchCenter || searchCenter.source !== "device";
            setSearchCenter(lat, lng, "your live location", "device", position.coords.accuracy);
            search({ keepView: !first });
            // Look up the address on the first fix only (the service allows 1 request/second)
            if (first) describePoint(lat, lng, { title: "Your live location", accuracy: position.coords.accuracy });
        },
        () => {
            stopLiveLocation();
            locationFailed(new Error("Live location was blocked or is unavailable."));
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
});

function stopLiveLocation() {
    if (liveWatchId !== null) navigator.geolocation.clearWatch(liveWatchId);
    liveWatchId = null;
    liveLocation.checked = false;
}

// Option 2: choose State + City from the dropdowns
cityForm.addEventListener("submit", async event => {
    event.preventDefault();
    const state = locPicker.getState();
    const city = locPicker.getCity();
    const district = locPicker.getDistrict();

    if (!state) {
        showToast("Please select a State/Union Territory.", "error");
        return;
    }
    if (!city) {
        showToast("Please select a city.", "error");
        document.getElementById("locCitySearch").focus();
        return;
    }

    stopLiveLocation();

    // Show the same place in the directory below
    allPicker.setValue(state, city, district);
    loadAllDonors();

    setStatus(`Finding ${city}, ${state} on the map...`);
    const place = await geocodeCity(city, district, state);

    if (!place) {
        // No map position -> we cannot measure distance honestly.
        searchCenter = null;
        cityOnlySearch = { state, city, district };
        setStatus(`Couldn't find ${city} on the map (are you offline?). Showing donors and blood banks registered in ${city}, without distances.`, "error");
        searchCityOnly();
        return;
    }

    const label = place.approximate
        ? `${place.label} (district centre, approximate)`
        : `${place.label} (city centre)`;
    placeInfo.hidden = true;
    setSearchCenter(place.lat, place.lng, label, "city");
    search();
});


// ==========================================================
// 2. FILTERS
// ==========================================================

// Radio values look like "0-25" (within 25 km), "50-any" (more than 50 km)
function getRange() {
    const value = document.querySelector('input[name="radius"]:checked').value;
    const [min, max] = value.split("-");
    return { minKm: Number(min), maxKm: max === "any" ? null : Number(max) };
}

function setRange(value) {
    const radio = document.querySelector(`input[name="radius"][value="${value}"]`);
    if (!radio) return;
    if (radio.closest("#fartherChips")) document.getElementById("fartherChips").hidden = false;
    radio.checked = true;
}

function rangeText(range) {
    if (range.minKm > 0 && range.maxKm === null) return `more than ${range.minKm} km away`;
    if (range.maxKm === null) return "at any distance";
    return `within ${range.maxKm} km`;
}

// Which result types are ticked: "all" | "donors" | "bloodBanks" | null
function getType() {
    if (showDonors.checked && showBanks.checked) return "all";
    if (showDonors.checked) return "donors";
    if (showBanks.checked) return "bloodBanks";
    return null;
}


// ==========================================================
// 3. SEARCH: GET /api/search  (donors + blood banks, Haversine)
// ==========================================================
async function search(options = {}) {
    if (!searchCenter) {
        if (cityOnlySearch) return searchCityOnly();
        showToast("Set your location first (current location or state and city).", "error");
        return;
    }
    const type = getType();
    if (!type) {
        showToast("Tick Donors, Blood banks or both.", "error");
        return;
    }

    const range = getRange();
    const bloodGroup = bloodGroupFilter.value;

    // URLSearchParams safely encodes "+" in blood groups (A+ -> A%2B)
    const params = new URLSearchParams({
        lat: searchCenter.lat,
        lng: searchCenter.lng,
        minKm: range.minKm,
        maxKm: range.maxKm === null ? "any" : range.maxKm,
        type
    });
    if (bloodGroup) params.set("bloodGroup", bloodGroup);
    if (bloodGroup && compatibleFilter.checked) params.set("compatible", "true");

    if (!options.keepView) resultsList.innerHTML = '<div class="empty-state">Searching...</div>';

    try {
        const response = await fetch(`${API_URL}/search?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        renderSearch(data, range, type, options);
    } catch (error) {
        console.error(error);
        searchNotice.hidden = true;
        resultsList.innerHTML = `<div class="empty-state"><strong>Something went wrong</strong>${escapeHtml(error.message)}<br>Is the backend running?</div>`;
    }
}

function renderSearch(data, range, type, options) {
    // One list, nearest first. Each item has type "donor" or "bloodBank".
    lastItems = [...data.donors, ...data.bloodBanks].sort((a, b) => a.distanceKm - b.distanceKm);

    const group = bloodGroupFilter.value;
    const who = group ? `${group} ${compatibleFilter.checked ? "(and compatible) " : ""}donors` : "Donors";
    resultsTitle.textContent =
        type === "bloodBanks" ? `Blood banks ${rangeText(range)}` :
        type === "donors" ? `${who} ${rangeText(range)}` :
        `${who} & blood banks ${rangeText(range)}`;

    // Blood bank data source + "nearest 50 of 120" note
    let note = "";
    if (type !== "donors") {
        note = `Blood banks: ${data.bloodBankSource.source}. ${data.bloodBankSource.note}`;
        if (data.bloodBanksTotal > data.bloodBanks.length) {
            note = `Showing the nearest ${data.bloodBanks.length} of ${data.bloodBanksTotal} blood banks. ` + note;
        }
    }
    sourceNote.textContent = note;

    renderNotice(data, range, type);
    renderList(options);
}

// "No matching donors found within 50 km. Would you like to search farther away?"
function renderNotice(data, range, type) {
    searchNotice.hidden = true;
    if (type === "bloodBanks" || data.donorCount > 0) return;

    const nearest = data.nearestDonorKm;
    const nearestText = nearest === null
        ? "No donor with a matching blood group is registered yet."
        : `The nearest matching donor is about ${nearest} km away.`;

    // Buttons that widen the search, keeping the same location
    const button = (value, text) => `<button type="button" class="btn btn-light btn-sm" data-range="${value}">${text}</button>`;
    let html = "";

    if (range.maxKm !== null && range.maxKm <= 50) {
        if (data.donorsWithin50 === 0) {
            html = `<strong>No matching donors found within 50 km. Would you like to search farther away?</strong>${nearestText}`;
            if (nearest !== null) {
                html += `<div class="inline-row">${button("0-75", "Within 75 km")}${button("0-100", "Within 100 km")}${button("0-150", "Within 150 km")}${button("0-any", "Farther (all distances)")}</div>`;
            }
        } else {
            const bigger = [25, 50].filter(km => km > range.maxKm);
            html = `<strong>No matching donors within ${range.maxKm} km.</strong>` +
                `${data.donorsWithin50} matching donor${data.donorsWithin50 === 1 ? "" : "s"} within 50 km.` +
                `<div class="inline-row">${bigger.map(km => button(`0-${km}`, `Within ${km} km`)).join("")}</div>`;
        }
    } else if (range.maxKm !== null) {
        const bigger = [100, 150].filter(km => km > range.maxKm);
        html = `<strong>No matching donors within ${range.maxKm} km.</strong>${nearestText}` +
            (nearest !== null ? `<div class="inline-row">${bigger.map(km => button(`0-${km}`, `Within ${km} km`)).join("")}${button("0-any", "All distances")}</div>` : "");
    } else {
        html = `<strong>No matching donors ${rangeText(range)}.</strong>${nearest === null ? nearestText : "Try a smaller distance, or another blood group."}`;
    }

    searchNotice.innerHTML = html;
    searchNotice.hidden = false;
}

// Clicking a "Within 75 km" button: change the filter and search again
// from the SAME location (no need to start over)
searchNotice.addEventListener("click", event => {
    const button = event.target.closest("[data-range]");
    if (!button) return;
    setRange(button.dataset.range);
    search();
});


// ==========================================================
// 4. RESULT CARDS (donor / blood bank)
// ==========================================================

// Google Maps directions link (no API key needed for a link)
function directionsUrl(destination) {
    const params = new URLSearchParams({ api: "1", destination });
    // Start from the chosen point (GPS, searched place or clicked point).
    // For a city centre, let Google Maps use the phone's own location.
    const origin = searchCenter ? `${searchCenter.lat},${searchCenter.lng}` : "";
    if (searchCenter && searchCenter.source !== "city" && origin !== destination) {
        params.set("origin", origin);
    }
    return "https://www.google.com/maps/dir/?" + params;
}

function bankDirections(bank) {
    // Use coordinates only when they passed our checks; otherwise the address
    if (bank.location === "verified" || bank.location === "approximate") {
        return directionsUrl(`${bank.lat},${bank.lng}`);
    }
    return directionsUrl([bank.name, bank.address, bank.city, bank.state, bank.pincode].filter(Boolean).join(", "));
}

function telLink(number) {
    const digits = number.replace(/[^\d+]/g, "");
    return `<a href="tel:${digits}">${escapeHtml(number)}</a>`;
}

function donorResultCard(d) {
    const available = d.availability === "Available";
    const group = bloodGroupFilter.value;
    const compatiblePill = group && d.bloodGroup !== group
        ? `<span class="pill pill-amber">Compatible with ${escapeHtml(group)}</span>` : "";
    // No directions to a demo donor's test location (nobody is there)
    const directions = d.approxLatitude !== undefined && !d.isDemo
        ? `<a class="dir-link" target="_blank" rel="noopener" href="${directionsUrl(`${d.approxLatitude},${d.approxLongitude}`)}">Directions to area ↗</a>`
        : "";
    const status = d.isDemo
        ? demoBadge(d)
        : `<span class="pill ${available ? "pill-green" : "pill-gray"}">${escapeHtml(d.availability)}</span>`;
    const note = d.isDemo
        ? `Fictional sample record for testing. ${d.locationNote || "Test location, not a real address."}`
        : "Approximate area only, to protect the donor's privacy. Call to agree on where to meet (usually the hospital).";

    return `
        <article class="donor-card ${d.isDemo ? "is-demo" : ""}" data-key="donor-${d.id}">
            <div class="donor-badge">${escapeHtml(d.bloodGroup)}</div>
            <div>
                <div class="donor-top">
                    <h3>${escapeHtml(d.name)}</h3>
                    ${d.distanceKm !== undefined ? `<span class="distance">≈ ${d.distanceKm} km</span>` : ""}
                </div>
                <div class="card-pills">
                    <span class="pill pill-red">Donor</span>
                    ${status}
                    ${compatiblePill}
                </div>
                <p class="donor-meta">${escapeHtml(placeText(d))} · Age ${d.age}</p>
                ${d.otherInfo ? `<p class="donor-note">${escapeHtml(d.otherInfo)}</p>` : ""}
                <div class="donor-actions">
                    ${contactButton(d, d.phone)}
                    ${directions}
                </div>
                <p class="stock-note">${escapeHtml(note)}</p>
            </div>
        </article>`;
}

function bankResultCard(b) {
    const locationPill =
        b.location === "approximate" ? '<span class="pill pill-amber">Approximate location</span>' :
        b.location === "unverified" || b.location === "missing" ? '<span class="pill pill-amber">Map location not verified</span>' : "";
    const contacts = [
        ...b.phones.map(telLink),
        ...b.helpline.map(n => "Helpline: " + telLink(n)),
        b.email ? `<a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a>` : ""
    ].filter(Boolean);

    return `
        <article class="donor-card bank-card" data-key="bloodBank-${b.id}">
            <div class="bank-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>
            </div>
            <div>
                <div class="donor-top">
                    <h3>${escapeHtml(b.name)}</h3>
                    ${b.distanceKm !== undefined ? `<span class="distance">${b.distanceKm} km</span>` : ""}
                </div>
                <div class="card-pills">
                    <span class="pill pill-blue">Blood bank</span>
                    ${b.category ? `<span class="pill pill-gray">${escapeHtml(b.category)}</span>` : ""}
                    ${b.serviceTime ? `<span class="pill pill-gray">${escapeHtml(b.serviceTime)}</span>` : ""}
                    ${locationPill}
                </div>
                <p class="bank-address">${escapeHtml([b.address, b.city, b.state].filter(Boolean).join(", "))}${b.pincode ? " - " + escapeHtml(b.pincode) : ""}</p>
                <div class="bank-contacts">${contacts.length ? contacts.map(c => `<span>${c}</span>`).join("") : "<span>No contact number listed</span>"}</div>
                <p class="stock-note">Blood group stock is not listed here. Call the blood bank or check
                    <a href="${ERAKTKOSH_URL}" target="_blank" rel="noopener">e-RaktKosh</a> before going.</p>
                <div class="donor-actions">
                    <a class="dir-link" target="_blank" rel="noopener" href="${bankDirections(b)}">Get directions ↗</a>
                </div>
            </div>
        </article>`;
}

// Draw the list + map for the selected tab
function renderList(options = {}) {
    const donors = lastItems.filter(i => i.type === "donor");
    const banks = lastItems.filter(i => i.type === "bloodBank");
    document.getElementById("countAll").textContent = lastItems.length;
    document.getElementById("countDonors").textContent = donors.length;
    document.getElementById("countBanks").textContent = banks.length;
    resultsCount.textContent = `${lastItems.length} found`;

    const items = activeTab === "all" ? lastItems : lastItems.filter(i => i.type === activeTab);

    resultsList.innerHTML = items.length
        ? items.map(i => i.type === "donor" ? donorResultCard(i) : bankResultCard(i)).join("")
        : `<div class="empty-state"><strong>Nothing to show here</strong>Try a bigger distance or another filter, or
           <a href="emergency.html" style="color:var(--red);font-weight:700;">post an emergency request</a>.</div>`;

    drawMap(items, options);
}

document.getElementById("resultTabs").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    activeTab = button.dataset.show;
    document.querySelectorAll("#resultTabs button").forEach(b => b.classList.toggle("active", b === button));
    renderList();
});


// ==========================================================
// 5. MAP: donor areas, blood bank markers, distance circles
// ==========================================================
function drawMap(items, options = {}) {
    resultLayer.clearLayers();
    circleLayer.clearLayers();
    Object.keys(markersByKey).forEach(key => delete markersByKey[key]);

    const points = [];

    items.forEach(item => {
        let marker;
        if (item.type === "donor") {
            if (item.approxLatitude === undefined) return;
            const pos = [item.approxLatitude, item.approxLongitude];
            // A shaded circle shows "somewhere around here", not a house
            const color = item.isDemo ? "#6b5d61" : "#c8102e";
            L.circle(pos, { radius: 700, color, weight: 1, dashArray: item.isDemo ? "4 4" : null, fillOpacity: 0.12, interactive: false }).addTo(resultLayer);
            marker = L.marker(pos, { icon: donorIcon(item) }).bindPopup(item.isDemo ? `
                <b>${escapeHtml(item.demoLabel || DEMO_DONOR_LABEL)}</b><br>
                ${escapeHtml(item.name)} (fictional, ${escapeHtml(item.bloodGroup)})<br>
                ${escapeHtml(placeText(item))}${item.distanceKm !== undefined ? ` · ≈ ${item.distanceKm} km` : ""}<br>
                Test location only, not a real address` : `
                <b>${escapeHtml(item.name)}</b> (${escapeHtml(item.bloodGroup)} donor)<br>
                ${escapeHtml(placeText(item))}${item.distanceKm !== undefined ? ` · ≈ ${item.distanceKm} km` : ""}<br>
                Approximate area (about 1 km)<br>
                📞 ${escapeHtml(item.phone)}`);
            points.push(pos);
        } else {
            if (item.location !== "verified" && item.location !== "approximate") return;
            const pos = [item.lat, item.lng];
            marker = L.marker(pos, { icon: bankIcon }).bindPopup(`
                <b>${escapeHtml(item.name)}</b><br>
                ${escapeHtml(item.address)}${item.distanceKm !== undefined ? `<br>${item.distanceKm} km away` : ""}<br>
                ${item.phones[0] ? "📞 " + escapeHtml(item.phones[0]) + "<br>" : ""}
                <a href="${bankDirections(item)}" target="_blank" rel="noopener">Get directions</a>`);
            points.push(pos);
        }
        const key = `${item.type}-${item.id}`;
        marker.on("click", () => highlightCard(key, true));
        marker.addTo(resultLayer);
        markersByKey[key] = marker;
    });

    if (!searchCenter) {
        if (points.length && !options.keepView) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
        return;
    }

    // Circles show the distance filter
    const range = getRange();
    const center = [searchCenter.lat, searchCenter.lng];
    if (range.maxKm !== null) {
        L.circle(center, { radius: range.maxKm * 1000, color: "#c8102e", weight: 1.5, fillColor: "#c8102e", fillOpacity: 0.05, interactive: false }).addTo(circleLayer);
    }
    if (range.minKm > 0) {
        L.circle(center, { radius: range.minKm * 1000, color: "#6b5d61", weight: 1.5, dashArray: "6 6", fill: false, interactive: false }).addTo(circleLayer);
    }

    if (options.keepView) return;
    points.push(center);
    if (range.maxKm !== null && range.maxKm <= 50) {
        map.fitBounds(L.latLng(center).toBounds(range.maxKm * 2000), { padding: [20, 20] });
    } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
    } else {
        map.setView(center, 9);
    }
}

function highlightCard(key, scroll) {
    document.querySelectorAll("#resultsList .donor-card").forEach(card => {
        card.classList.toggle("selected", card.dataset.key === key);
    });
    if (scroll) {
        const card = document.querySelector(`#resultsList .donor-card[data-key="${key}"]`);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

// Clicking a card zooms the map to it
resultsList.addEventListener("click", event => {
    if (event.target.closest("a")) return; // let Call / Directions links work
    const card = event.target.closest(".donor-card");
    if (!card) return;
    const marker = markersByKey[card.dataset.key];
    if (marker) {
        map.setView(marker.getLatLng(), 14);
        marker.openPopup();
        highlightCard(card.dataset.key, false);
    }
});


// ==========================================================
// 6. FALLBACK: what is registered in a city (no distances)
// ==========================================================
async function searchCityOnly() {
    const { state, city, district } = cityOnlySearch;
    const group = bloodGroupFilter.value;
    const groups = group ? (compatibleFilter.checked ? CAN_RECEIVE_FROM[group] : [group]) : null;
    const type = getType() || "all";

    try {
        let donors = [];
        let banks = [];
        if (type !== "bloodBanks") {
            const response = await fetch(`${API_URL}/donors?${new URLSearchParams({ state, city })}`);
            const data = await response.json();
            donors = data.donors.filter(d => !groups || groups.includes(d.bloodGroup));
        }
        if (type !== "donors") {
            const response = await fetch(`${API_URL}/bloodbanks?${new URLSearchParams({ state, city, district })}`);
            const data = await response.json();
            banks = data.bloodBanks;
            sourceNote.textContent = `Blood banks: ${data.bloodBankSource.source}. ${data.bloodBankSource.note}`;
        }

        lastItems = [...donors, ...banks];
        resultsTitle.textContent = `Registered in ${city}, ${state}`;
        searchNotice.innerHTML = `<strong>Distances are not available.</strong>We couldn't find ${escapeHtml(city)} on the map, so these results are listed by name. Use "Use my current location" to sort by distance.`;
        searchNotice.hidden = false;
        clearSearchPoint();
        renderList();
    } catch (error) {
        resultsList.innerHTML = '<div class="empty-state"><strong>Cannot reach the server</strong>Start the backend with: node server.js</div>';
    }
}

// No search point -> remove the blue dot and the distance circles
function clearSearchPoint() {
    circleLayer.clearLayers();
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    placeInfo.hidden = true;
}


// Re-run the search automatically when a filter changes
function hasLocation() { return Boolean(searchCenter || cityOnlySearch); }
function rerun() { if (hasLocation()) search(); }

searchBtn.addEventListener("click", () => search());
[bloodGroupFilter, compatibleFilter, showDonors, showBanks].forEach(el => el.addEventListener("change", rerun));
document.querySelectorAll('input[name="radius"]').forEach(radio => radio.addEventListener("change", rerun));


// ==========================================================
// PART B: ALL DONORS DIRECTORY
// GET /api/donors?bloodGroup=&state=&city=   and   DELETE
// ==========================================================
const allDonors = document.getElementById("allDonors");
const allBloodGroup = document.getElementById("allBloodGroup");

function demoCount(list) {
    return list.filter(d => d.isDemo).length;
}

async function loadAllDonors() {
    const params = new URLSearchParams();
    if (allBloodGroup.value) params.set("bloodGroup", allBloodGroup.value);
    if (allPicker.getState()) params.set("state", allPicker.getState());
    if (allPicker.getCity()) params.set("city", allPicker.getCity());
    const text = document.getElementById("allSearch").value.trim();
    if (text) params.set("q", text); // name, blood group, city or state

    // e.g. "in Udupi, Karnataka"
    const where = [allPicker.getCity(), allPicker.getState()].filter(Boolean).join(", ");

    try {
        const response = await fetch(`${API_URL}/donors?${params}`);
        const data = await response.json();

        document.getElementById("allCount").textContent =
            `Showing ${data.count} donor${data.count === 1 ? "" : "s"}${where ? " in " + where : ""}` +
            (demoCount(data.donors) ? ` · ${demoCount(data.donors)} DEMO record${demoCount(data.donors) === 1 ? "" : "s"} (fictional, not real donors)` : "");

        allDonors.innerHTML = data.donors.length
            ? data.donors.map(d => donorCardHTML(d, { manage: true })).join("")
            : '<div class="empty-state" style="grid-column:1/-1;"><strong>No donors match your search</strong>Try another blood group, state or city.</div>';
    } catch (error) {
        allDonors.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><strong>Cannot reach the server</strong>Start the backend with: node server.js</div>';
    }
}

document.getElementById("allFilterForm").addEventListener("submit", event => {
    event.preventDefault();
    loadAllDonors();
});

document.getElementById("allResetBtn").addEventListener("click", () => {
    allBloodGroup.value = "";
    document.getElementById("allSearch").value = "";
    allPicker.reset();
    loadAllDonors();
});

// Delete button (event delegation: one listener for all cards)
allDonors.addEventListener("click", async event => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;

    const id = button.dataset.delete;
    if (!confirm("Are you sure you want to delete this donor?")) return;

    try {
        const response = await fetch(`${API_URL}/donors/${id}`, { method: "DELETE" });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(data.message, "success");
        loadAllDonors();
        rerun();
    } catch (error) {
        showToast(error.message || "Delete failed", "error");
    }
});


// ==========================================================
// ON PAGE LOAD: read ?bloodGroup=..&state=..&city=.. from the URL
// (sent by the homepage quick search, blood group cards and
//  the "Find matching donors" button on emergency requests)
// ==========================================================
const urlParams = new URLSearchParams(window.location.search);
const startGroup = urlParams.get("bloodGroup") || "";
const startState = urlParams.get("state") || "";
const startCity = urlParams.get("city") || "";
const startDistrict = urlParams.get("district") || "";

if (BLOOD_GROUPS.includes(startGroup)) {
    bloodGroupFilter.value = startGroup;
    allBloodGroup.value = startGroup;
}
if (urlParams.get("compatible") === "true") compatibleFilter.checked = true;
if (startState) {
    allPicker.setValue(startState, startCity, startDistrict);
    locPicker.setValue(startState, startCity, startDistrict);
}

loadAllDonors();

if (startCity && locPicker.getCity()) {
    cityForm.requestSubmit(); // finds the city on the map and searches
} else if (startState) {
    setStatus(`Showing donors in ${locPicker.getState()} below. Choose a city or use your current location to search by distance.`);
}
