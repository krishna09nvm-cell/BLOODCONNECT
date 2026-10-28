// ==========================================================
// DASHBOARD.JS - role-based dashboard (logged-in users only)
// ----------------------------------------------------------
//  Blood Donor     -> "Camps near me" (map + PIN / place search) + Profile
//  Blood Finder    -> "Find camps & blood banks" (+ hospitals)   + Profile
//  Camp Organizer  -> "My camps" (add / edit / delete, pending
//                     until an admin approves)                   + Profile
// The server checks the login on every request; this page also
// sends logged-out visitors to the login page.
// ==========================================================

const $ = id => document.getElementById(id);
let me = null;

const STATUS_TEXT = { upcoming: "Upcoming", ongoing: "Ongoing now", completed: "Completed", cancelled: "Cancelled", unscheduled: "Date to be confirmed" };
const REVIEW_TEXT = { pending: "Pending verification", approved: "Approved · public", rejected: "Not approved" };

// ---------------- Start ----------------
(async function start() {
    me = await currentUser();
    if (!me) { location.replace("login.html?next=dashboard.html"); return; } // protected page
    $("dashLoading").hidden = true;
    $("dashApp").hidden = false;
    renderHeader();
    buildTabs();
    renderProfile();
})();

$("navLogout").addEventListener("click", e => { e.preventDefault(); logout(); });
$("headerLogout").addEventListener("click", logout);

function renderHeader() {
    const first = me.fullName.split(" ")[0];
    $("roleBadge").textContent = `${me.roleName} dashboard`;
    $("dashWelcome").textContent = `Welcome, ${first}!`;
    $("dashIntro").textContent = {
        donor: "Find blood donation camps near you and plan your next donation.",
        finder: "Find blood donation camps, blood banks and hospitals near any PIN code or place.",
        organizer: "Add your blood donation camps. They go live after verification."
    }[me.role];
    document.title = `${me.roleName} Dashboard | LifeDrop`;
}

// ---------------- Tabs ----------------
const TABS = {
    donor: [["find", "Camps near me"], ["profile", "My profile"]],
    finder: [["find", "Find camps & blood banks"], ["profile", "My profile"]],
    organizer: [["camps", "My camps"], ["campform", "Add a camp"], ["profile", "My profile"]]
};
function buildTabs() {
    $("dashTabs").innerHTML = TABS[me.role].map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false">${label}</button>`).join("");
    const wanted = location.hash.slice(1);
    showTab(TABS[me.role].some(t => t[0] === wanted) ? wanted : TABS[me.role][0][0]);
}
function showTab(id) {
    document.querySelectorAll(".dash-tab").forEach(t => { t.hidden = t.id !== "tab-" + id; });
    document.querySelectorAll("#dashTabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    try { history.replaceState(null, "", "#" + id); } catch (e) { }
    if (id === "find") initFind();
    if (id === "camps") loadOrgCamps();
    if (id === "campform") { initOrgMap(); if (!editingId) resetOrgForm(); }
    if (id === "profile") loadNotifications();
}
$("dashTabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
document.querySelectorAll("[data-tab-link]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); showTab(a.dataset.tabLink); }));


// ==========================================================
// SHARED HELPERS
// ==========================================================
async function api(path, options = {}) { return authRequest(path, options); }

function formatDate(d) { return new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
function formatTime(t) { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
function directions(lat, lng, origin) {
    const p = new URLSearchParams({ api: "1", destination: `${lat},${lng}` });
    if (origin) p.set("origin", `${origin.lat},${origin.lng}`);
    return "https://www.google.com/maps/dir/?" + p;
}
function campContact(c) {
    if (c.isDemo) return contactButton(c, c.contactPhone);
    if (!c.contactVerified) return "Contact details not verified yet";
    return [c.contactName && escapeHtml(c.contactName), c.contactPhone && `<a href="tel:${escapeHtml(c.contactPhone)}">📞 ${escapeHtml(c.contactPhone)}</a>`,
        c.contactEmail && `<a href="mailto:${escapeHtml(c.contactEmail)}">✉ ${escapeHtml(c.contactEmail)}</a>`].filter(Boolean).join(" · ");
}
const mapOk = () => typeof window.L !== "undefined";
function addTiles(map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
}


// ==========================================================
// DONOR + FINDER: FIND CAMPS (and blood banks for finders)
// ==========================================================
let findMap = null, findLayer = null, findYou = null, findCenter = null, findReady = false;

function initFind() {
    const finder = me.role === "finder";
    document.querySelectorAll(".finder-only").forEach(el => { el.hidden = !finder; });
    $("findTitle").textContent = finder ? "Find blood donation camps, blood banks and hospitals" : "Blood donation camps near you";
    if (!findMap && mapOk()) {
        findMap = L.map("findMap").setView([22.5, 79], 5);
        addTiles(findMap);
        findLayer = L.layerGroup().addTo(findMap);
        findMap.on("click", e => { setFindCenter(e.latlng.lat, e.latlng.lng, "the point you picked", true); loadFind(); });
    }
    setTimeout(() => findMap && findMap.invalidateSize(), 60);
    if (findReady) return;
    findReady = true;
    // Start from the PIN code in the user's profile
    $("findQuery").value = me.pincode;
    searchFind(me.pincode);
}

function setFindStatus(text, type = "") { $("findStatus").textContent = text; $("findStatus").className = "location-status " + type; }
function setFindCenter(lat, lng, label, exact) {
    findCenter = { lat, lng, label, exact };
    setFindStatus(`📍 Showing results near ${label}`, "ok");
    if (!findMap) return;
    const icon = L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    if (findYou) findYou.setLatLng([lat, lng]); else findYou = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(findMap);
}

async function searchFind(text) {
    const q = String(text || "").trim();
    if (!q) { setFindStatus("Please type a PIN code, city or locality.", "error"); return; }
    const button = $("findBtn");
    button.disabled = true; button.textContent = "Searching…";
    try {
        if (/^\d+$/.test(q)) {
            if (!/^[1-9]\d{5}$/.test(q)) throw new Error("Please enter a valid 6-digit PIN code (it cannot start with 0).");
            const pin = await api(`/pincode/${q}`);
            setFindCenter(pin.lat, pin.lng, `PIN code ${q} — ${pin.label}${pin.exact ? "" : " (approximate)"}`, false);
        } else {
            if (q.length < 2) throw new Error("Type at least 2 letters.");
            const data = await api("/places?" + new URLSearchParams({ q }));
            const place = data.places[0] || data.bloodBanks[0];
            if (!place) throw new Error(data.placesError || `No place found for "${q}". Try a PIN code or add the city name.`);
            setFindCenter(place.lat, place.lng, place.displayName ? place.displayName.split(",").slice(0, 3).join(",") : place.name, false);
        }
        loadFind();
    } catch (error) {
        setFindStatus(error.message, "error");
        if (!findCenter) loadFind(); // still show camps across India
    } finally {
        button.disabled = false; button.textContent = "Search";
    }
}
$("findForm").addEventListener("submit", e => { e.preventDefault(); searchFind($("findQuery").value); });
$("findGps").addEventListener("click", async () => {
    const button = $("findGps");
    button.disabled = true;
    try { const p = await getCurrentPosition(); setFindCenter(p.lat, p.lng, "your current location", true); loadFind(); }
    catch (error) { setFindStatus(error.message + " Please search with your PIN code instead.", "error"); $("findQuery").focus(); }
    finally { button.disabled = false; }
});
["fUpcoming", "fOngoing", "fBanks", "fHospitals", "fDistance"].forEach(id => $(id).addEventListener("change", loadFind));

let findCounter = 0;
async function loadFind() {
    const statuses = [["fUpcoming", "upcoming"], ["fOngoing", "ongoing"]].filter(([id]) => $(id).checked).map(x => x[1]);
    const kinds = me.role === "finder" ? [["fBanks", "bank"], ["fHospitals", "hospital"]].filter(([id]) => $(id).checked).map(x => x[1]) : [];
    const maxKm = $("fDistance").value;
    const params = new URLSearchParams();
    if (findCenter) { params.set("lat", findCenter.lat); params.set("lng", findCenter.lng); params.set("maxKm", maxKm); }
    const run = ++findCounter;
    $("findCount").textContent = "Loading…";
    try {
        const [campData, placeData] = await Promise.all([
            statuses.length ? api(`/camps?${params}&` + new URLSearchParams({ status: statuses.join(","), sort: findCenter ? "distance" : "date" })) : { camps: [] },
            kinds.length && findCenter ? api(`/map-places?${params}&` + new URLSearchParams({ kinds: kinds.join(","), limit: 40 })) : { places: [] }
        ]);
        if (run !== findCounter) return;
        const items = [...campData.camps.map(c => ({ ...c, type: "camp" })), ...placeData.places.map(p => ({ ...p, type: "place" }))];
        if (findCenter) items.sort((a, b) => a.distanceKm - b.distanceKm);
        renderFind(items, campData, kinds);
    } catch (error) {
        $("findCount").textContent = "Error";
        $("findList").innerHTML = `<div class="empty-state"><strong>Cannot load results</strong>${escapeHtml(error.message)}</div>`;
    }
}

function renderFind(items, campData, kinds) {
    const camps = items.filter(i => i.type === "camp").length;
    $("findResultsTitle").textContent = findCenter ? `Nearest first (${$("fDistance").value === "any" ? "any distance" : "within " + $("fDistance").value + " km"})` : "Camps across India";
    $("findCount").textContent = `${camps} camp${camps === 1 ? "" : "s"}` + (kinds.length ? ` · ${items.length - camps} blood bank${items.length - camps === 1 ? "" : "s"}/hospital${items.length - camps === 1 ? "" : "s"}` : "");
    const origin = findCenter && findCenter.exact ? findCenter : null;

    const html = items.map(x => {
        if (x.type === "camp") {
            return `<article class="donor-card camp-card ${x.isDemo ? "is-demo" : ""}">
                <div class="camp-date-badge"><span>${escapeHtml(new Date(x.date + "T00:00:00+05:30").toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" }))}</span><b>${escapeHtml(x.date.slice(8))}</b></div>
                <div>
                    <div class="donor-top"><h3>${escapeHtml(x.name)}</h3>${x.distanceKm !== undefined ? `<span class="distance">${x.distanceKm} km</span>` : ""}</div>
                    <div class="card-pills"><span class="pill camp-status ${x.status}">${STATUS_TEXT[x.status]}</span>${x.isDemo ? `<span class="pill pill-demo">${escapeHtml(x.demoLabel)}</span>` : '<span class="pill pill-green">Verified</span>'}</div>
                    <p class="donor-meta"><b>${escapeHtml(formatDate(x.date))}</b> · ${formatTime(x.startTime)} – ${formatTime(x.endTime)} (IST)</p>
                    <p class="bank-address">${escapeHtml(x.organiser)}<br>${escapeHtml(`${x.venue}, ${x.city}, ${x.state}${x.pincode ? " - " + x.pincode : ""}`)}</p>
                    <div class="bank-contacts"><span>${campContact(x)}</span></div>
                    <div class="donor-actions"><a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="${directions(x.latitude, x.longitude, origin)}">Get directions ↗</a></div>
                </div></article>`;
        }
        const phones = [...(x.phones || []), ...(x.helpline || [])];
        const hospital = x.kind === "hospital";
        return `<article class="donor-card bank-card">
            <div class="bank-badge text-badge ${hospital ? "hospital-badge" : ""}">${hospital ? "H" : "+"}</div>
            <div>
                <div class="donor-top"><h3>${escapeHtml(x.name)}</h3><span class="distance">${x.distanceKm} km</span></div>
                <div class="card-pills"><span class="pill ${hospital ? "pill-hospital" : "pill-red"}">${hospital ? "Hospital blood bank" : "Blood bank"}</span>${x.category ? `<span class="pill pill-gray">${escapeHtml(x.category)}</span>` : ""}</div>
                <p class="bank-address">${escapeHtml([x.address, x.city, x.state].filter(Boolean).join(", ") + (x.pincode ? " - " + x.pincode : ""))}</p>
                <div class="bank-contacts"><span>${phones.length ? phones.slice(0, 2).map(n => `<a href="tel:${escapeHtml(n)}">📞 ${escapeHtml(n)}</a>`).join(" · ") : "No phone number listed"}${x.serviceTime ? " · " + escapeHtml(x.serviceTime) : ""}</span></div>
                <div class="donor-actions"><a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="${directions(x.lat, x.lng, origin)}">Get directions ↗</a></div>
            </div></article>`;
    }).join("");

    let empty = "";
    if (!items.length) {
        empty = findCenter
            ? '<div class="empty-state"><strong>No verified blood donation camps found nearby. Try expanding your search or selecting another city.</strong>Choose a bigger distance above.</div>'
            : '<div class="empty-state"><strong>Nothing to show</strong>Tick at least one filter.</div>';
    }
    $("findList").innerHTML = html || empty;

    if (!findMap) return;
    findLayer.clearLayers();
    const points = [];
    items.forEach(x => {
        const ll = x.type === "camp" ? [x.latitude, x.longitude] : [x.lat, x.lng];
        const icon = x.type === "camp"
            ? L.divIcon({ className: "", html: `<div class="camp-pin ${x.status}"><span>🩸</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] })
            : L.divIcon({ className: "", html: `<div class="bank-pin ${x.kind === "hospital" ? "hospital-pin" : ""}">${x.kind === "hospital" ? "H" : "+"}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
        const popup = x.type === "camp"
            ? `<b>${escapeHtml(x.name)}</b>${x.isDemo ? `<br><b class="popup-demo">${escapeHtml(x.demoLabel)}</b>` : ""}<br>${STATUS_TEXT[x.status]} · ${escapeHtml(formatDate(x.date))}, ${formatTime(x.startTime)} – ${formatTime(x.endTime)}<br>${escapeHtml(x.venue)}, ${escapeHtml(x.city)}${x.pincode ? " - " + escapeHtml(x.pincode) : ""}<br><a href="${directions(x.latitude, x.longitude, origin)}" target="_blank" rel="noopener">Get directions ↗</a>`
            : `<b>${escapeHtml(x.name)}</b><br>${x.kind === "hospital" ? "Hospital blood bank" : "Blood bank"}<br>${escapeHtml(x.address || "")}, ${escapeHtml(x.city)}${x.pincode ? " - " + escapeHtml(x.pincode) : ""}<br><a href="${directions(x.lat, x.lng, origin)}" target="_blank" rel="noopener">Get directions ↗</a>`;
        L.marker(ll, { icon, zIndexOffset: x.type === "camp" ? 500 : 0 }).bindPopup(popup).addTo(findLayer);
        points.push(ll);
    });
    if (findCenter) points.push([findCenter.lat, findCenter.lng]);
    if (points.length > 1) findMap.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
    else if (points.length === 1) findMap.setView(points[0], 12);
}


// ==========================================================
// ORGANIZER: MY CAMPS (add / edit / delete)
// ==========================================================
let orgCamps = [], editingId = null;
let orgMap = null, orgPin = null;
const orgPicker = setupLocationPicker({ stateId: "ofState", cityId: "ofCity", searchId: "ofCitySearch" });

async function loadOrgCamps() {
    try {
        const data = await api("/organizer/camps");
        orgCamps = data.camps;
        $("statTotal").textContent = orgCamps.length;
        $("statPending").textContent = orgCamps.filter(c => c.reviewStatus === "pending").length;
        $("statApproved").textContent = orgCamps.filter(c => c.reviewStatus === "approved").length;
        $("orgList").innerHTML = orgCamps.length ? orgCamps.map(c => `
            <div class="org-camp" data-id="${c.id}">
                <div class="card-pills">
                    <span class="pill review-pill ${c.reviewStatus}">${REVIEW_TEXT[c.reviewStatus] || c.reviewStatus}</span>
                    <span class="pill camp-status ${c.status}">${STATUS_TEXT[c.status] || c.status}</span>
                </div>
                <h3>${escapeHtml(c.name)}</h3>
                <p class="donor-meta"><b>${escapeHtml(formatDate(c.date))}</b> · ${formatTime(c.startTime)} – ${formatTime(c.endTime)}<br>
                   ${escapeHtml(`${c.venue}, ${c.city}, ${c.state} - ${c.pincode}`)}<br>
                   Contact: ${escapeHtml([c.contactName, c.contactPhone, c.contactEmail].filter(Boolean).join(" · "))}
                   ${c.reviewNote ? `<br>Note from the administrator: ${escapeHtml(c.reviewNote)}` : ""}</p>
                <div class="donor-actions">
                    <button type="button" class="btn btn-light btn-sm" data-edit="${c.id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" data-delete="${c.id}">Delete</button>
                </div>
            </div>`).join("")
            : '<div class="empty-state"><strong>No camps yet</strong>Click "Add a new camp" to create your first blood donation camp.</div>';
    } catch (error) {
        $("orgList").innerHTML = `<div class="empty-state"><strong>Cannot load your camps</strong>${escapeHtml(error.message)}</div>`;
    }
}

$("addCampBtn").addEventListener("click", () => { editingId = null; showTab("campform"); });
$("orgList").addEventListener("click", async e => {
    const edit = e.target.closest("[data-edit]");
    if (edit) { startEdit(orgCamps.find(c => String(c.id) === edit.dataset.edit)); return; }
    const del = e.target.closest("[data-delete]");
    if (!del) return;
    // Two clicks to delete (no accidental deletes)
    if (!del.classList.contains("armed")) {
        del.classList.add("armed"); del.textContent = "Click again to delete";
        setTimeout(() => { del.classList.remove("armed"); del.textContent = "Delete"; }, 3500);
        return;
    }
    try { const data = await api(`/organizer/camps/${del.dataset.delete}`, { method: "DELETE", body: {} }); showToast(resultMessage(data), "success"); loadOrgCamps(); }
    catch (error) { showToast(error.message, "error"); }
});

function initOrgMap() {
    if (orgMap || !mapOk()) { setTimeout(() => orgMap && orgMap.invalidateSize(), 60); return; }
    orgMap = L.map("ofMap").setView([22.5, 79], 5);
    addTiles(orgMap);
    orgMap.on("click", e => placeOrgPin(e.latlng.lat, e.latlng.lng, "Pin placed where you clicked. Drag it to adjust."));
    setTimeout(() => orgMap.invalidateSize(), 60);
}
function placeOrgPin(lat, lng, hint, zoom) {
    $("ofLat").value = Number(lat).toFixed(6);
    $("ofLng").value = Number(lng).toFixed(6);
    $("ofMapHint").textContent = hint || "";
    if (!orgMap) return;
    const icon = L.divIcon({ className: "", html: '<div class="camp-pin upcoming"><span>🩸</span></div>', iconSize: [34, 34], iconAnchor: [17, 17] });
    if (orgPin) orgPin.setLatLng([lat, lng]);
    else {
        orgPin = L.marker([lat, lng], { icon, draggable: true }).addTo(orgMap);
        orgPin.on("dragend", () => { const p = orgPin.getLatLng(); $("ofLat").value = p.lat.toFixed(6); $("ofLng").value = p.lng.toFixed(6); $("ofMapHint").textContent = "Pin moved."; });
    }
    if (zoom) orgMap.setView([lat, lng], zoom);
}
["ofLat", "ofLng"].forEach(id => $(id).addEventListener("change", () => {
    const lat = Number($("ofLat").value), lng = Number($("ofLng").value);
    if ($("ofLat").value && $("ofLng").value && !isNaN(lat) && !isNaN(lng)) placeOrgPin(lat, lng, "Pin moved to the coordinates you typed.", 15);
}));

// Find the venue on the map: full address first, then the PIN code
$("ofFindBtn").addEventListener("click", async () => {
    const button = $("ofFindBtn");
    const venue = $("ofVenue").value.trim(), city = orgPicker.getCity(), state = orgPicker.getState(), pin = $("ofPincode").value.trim();
    if (!venue && !/^[1-9]\d{5}$/.test(pin)) { $("ofMapHint").textContent = "Enter the venue address or a 6-digit PIN code first."; return; }
    button.disabled = true; $("ofMapHint").textContent = "Searching…";
    try {
        const data = await api("/places?" + new URLSearchParams({ q: [venue, city, state, pin].filter(Boolean).join(", ") }));
        if (data.places[0]) { placeOrgPin(data.places[0].lat, data.places[0].lng, `Found: ${data.places[0].displayName}. Please check and drag the pin if needed.`, 16); return; }
        if (/^[1-9]\d{5}$/.test(pin)) {
            const p = await api(`/pincode/${pin}`);
            placeOrgPin(p.lat, p.lng, `Address not found, so the pin is at the PIN code area (${p.label}). Please move it to the venue.`, 14);
            return;
        }
        $("ofMapHint").textContent = data.placesError || "Not found. Please click the venue on the map.";
    } catch (error) {
        $("ofMapHint").textContent = error.message + " Please click the venue on the map.";
    } finally { button.disabled = false; }
});

function resetOrgForm() {
    editingId = null;
    $("orgForm").reset();
    clearFieldErrors($("orgForm"));
    showFormAlert($("ofAlert"), "");
    orgPicker.reset();
    if (orgPin && orgMap) { orgMap.removeLayer(orgPin); orgPin = null; }
    $("ofMapHint").textContent = "";
    $("ofTitle").textContent = "Add a blood donation camp";
    $("ofSubmit").textContent = "Save camp";
    $("ofOrganiser").value = "";
    $("ofContactName").value = me.fullName;
    $("ofDate").min = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    if (orgMap) orgMap.setView([22.5, 79], 5);
}

function startEdit(c) {
    if (!c) return;
    showTab("campform");
    editingId = c.id;
    $("ofTitle").textContent = "Edit camp";
    $("ofSubmit").textContent = "Save changes";
    $("ofName").value = c.name; $("ofOrganiser").value = c.organiser; $("ofOrganiserType").value = c.organiserType;
    $("ofVenue").value = c.venue; orgPicker.setValue(c.state, c.city, c.district); $("ofPincode").value = c.pincode;
    $("ofDate").value = c.date; $("ofStart").value = c.startTime; $("ofEnd").value = c.endTime;
    $("ofContactName").value = c.contactName; $("ofPhone").value = c.contactPhone; $("ofEmail").value = c.contactEmail; $("ofLink").value = c.registrationLink;
    $("ofAuthorised").checked = false;
    showFormAlert($("ofAlert"), "Saving changes sends the camp for verification again.", "info");
    if (typeof c.latitude === "number") placeOrgPin(c.latitude, c.longitude, "", 15);
}
$("ofCancel").addEventListener("click", () => { resetOrgForm(); showTab("camps"); });
$("ofPincode").addEventListener("input", () => { $("ofPincode").value = $("ofPincode").value.replace(/\D/g, "").slice(0, 6); });

function checkOrgForm() {
    clearFieldErrors($("orgForm"));
    const bad = (id, msg) => { setFieldError($(id), msg); return msg; };
    const v = id => $(id).value.trim();
    const errors = [];
    if (!v("ofName")) errors.push(bad("ofName", "Please enter the camp name."));
    if (!v("ofOrganiser")) errors.push(bad("ofOrganiser", "Please enter the organiser or hospital name."));
    if (!v("ofOrganiserType")) errors.push(bad("ofOrganiserType", "Please choose the organiser type."));
    if (!v("ofVenue")) errors.push(bad("ofVenue", "Please enter the venue address."));
    if (!orgPicker.getState()) errors.push(bad("ofState", "Please select the state."));
    if (!orgPicker.getCity()) errors.push(bad("ofCity", "Please select the city."));
    if (RULES.pincode(v("ofPincode"))) errors.push(bad("ofPincode", RULES.pincode(v("ofPincode"))));
    if (!v("ofDate")) errors.push(bad("ofDate", "Please choose the date."));
    if (!v("ofStart")) errors.push(bad("ofStart", "Please choose the start time."));
    if (!v("ofEnd")) errors.push(bad("ofEnd", "Please choose the end time."));
    else if (v("ofStart") && v("ofEnd") <= v("ofStart")) errors.push(bad("ofEnd", "The end time must be after the start time."));
    if (!v("ofContactName")) errors.push(bad("ofContactName", "Please enter the contact person."));
    if (!v("ofPhone") && !v("ofEmail")) errors.push(bad("ofPhone", "Give a contact phone number or email."));
    if (v("ofPhone") && !/^[0-9]{10}$/.test(v("ofPhone"))) errors.push(bad("ofPhone", "Phone must be 10 digits."));
    if (v("ofEmail") && RULES.email(v("ofEmail"))) errors.push(bad("ofEmail", RULES.email(v("ofEmail"))));
    if (v("ofLink") && !/^https?:\/\//.test(v("ofLink"))) errors.push(bad("ofLink", "The link must start with http:// or https://"));
    const lat = Number(v("ofLat")), lng = Number(v("ofLng"));
    if (!v("ofLat") || !v("ofLng") || isNaN(lat) || isNaN(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) errors.push(bad("ofLat", "Please set the camp location on the map (inside India)."));
    if (!$("ofAuthorised").checked) errors.push(bad("ofAuthorised", "Please confirm you are authorised to publish this camp."));
    return errors;
}

$("orgForm").addEventListener("submit", async e => {
    e.preventDefault();
    showFormAlert($("ofAlert"), "");
    const errors = checkOrgForm();
    if (errors.length) { showFormAlert($("ofAlert"), "Please correct the highlighted fields."); return; }
    const v = id => $(id).value.trim();
    const body = {
        name: v("ofName"), organiser: v("ofOrganiser"), organiserType: v("ofOrganiserType"), venue: v("ofVenue"),
        state: orgPicker.getState(), city: orgPicker.getCity(), district: orgPicker.getDistrict(), pincode: v("ofPincode"),
        date: v("ofDate"), startTime: v("ofStart"), endTime: v("ofEnd"), contactName: v("ofContactName"),
        contactPhone: v("ofPhone"), contactEmail: v("ofEmail"), registrationLink: v("ofLink"), latitude: v("ofLat"), longitude: v("ofLng")
    };
    const button = $("ofSubmit");
    button.disabled = true;
    try {
        const headers = idempotencyHeaders($("orgForm"));   // no double submissions
        const data = editingId
            ? await api(`/organizer/camps/${editingId}`, { method: "PUT", body, headers })
            : await api("/organizer/camps", { method: "POST", body, headers });
        submissionDone($("orgForm"));
        showToast(resultMessage(data), "success");
        resetOrgForm();
        showTab("camps");
    } catch (error) {
        showFormAlert($("ofAlert"), escapeHtml(error.message));
    } finally { button.disabled = false; }
});


// ==========================================================
// E-MAIL NOTIFICATIONS (profile tab)
//   essential e-mails: always; optional "camps near me": user's choice
// ==========================================================
const EMAIL_STATUS = { sent: "Sent", failed: "Failed", not_configured: "Not sent (e-mail not set up)", sending: "Sending", pending: "Sending" };
const EMAIL_TYPE = { welcome: "Welcome", form: "Form confirmation", account: "Security notice", "password-reset": "Password reset", "nearby-camp": "Nearby camp (optional)", test: "Test" };

async function loadNotifications() {
    try {
        const data = await api("/auth/notifications");
        $("nNearby").checked = data.notifyNearbyCamps;
        $("nRadius").value = String(data.notifyRadiusKm);
        $("nService").innerHTML = data.emailEnabled
            ? `E-mails are sent to <b>${escapeHtml(me.email)}</b>.`
            : "⚠️ The e-mail service is not set up on this server yet, so no e-mails are sent. (Administrator: see the README, \"E-mail notifications\".)";
        $("nService").className = "location-status " + (data.emailEnabled ? "ok" : "error");
        $("nRecent").innerHTML = data.recent.length ? data.recent.map(e => `
            <div><dt>${escapeHtml(EMAIL_TYPE[e.type] || e.type)}<small style="display:block;font-weight:500;">${escapeHtml(e.subject)}</small></dt>
            <dd>${escapeHtml(EMAIL_STATUS[e.status] || e.status)}<small style="display:block;font-weight:500;color:var(--muted);">${escapeHtml(new Date(e.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</small></dd></div>`).join("")
            : '<p class="hint">No e-mails yet.</p>';
    } catch (error) { $("nService").textContent = error.message; }
}
$("notifyForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const data = await api("/auth/notifications", { method: "PUT", body: { notifyNearbyCamps: $("nNearby").checked, notifyRadiusKm: Number($("nRadius").value) } });
        showFormAlert($("nAlert"), escapeHtml(data.message), "success");
    } catch (error) { showFormAlert($("nAlert"), escapeHtml(error.message)); }
});


// ==========================================================
// PROFILE (all roles)
// ==========================================================
const profilePicker = setupLocationPicker({ stateId: "pfState", cityId: "pfCity", searchId: "pfCitySearch" });
setupPasswordToggles();
$("pfPin").addEventListener("input", () => { $("pfPin").value = $("pfPin").value.replace(/\D/g, "").slice(0, 6); });

function renderProfile() {
    $("pAvatar").textContent = me.fullName.trim()[0].toUpperCase();
    $("pName").textContent = me.fullName;
    $("pRole").textContent = me.roleName;
    const gender = { female: "Female", male: "Male", other: "Other" }[me.gender] || "Not given";
    const row = (k, v) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`;
    $("pFacts").innerHTML = row("Age", `${me.age} years`) + row("Date of birth", formatDate(me.dob).replace(/^\w+, /, "")) + row("Gender", gender) +
        row("Email 🔒", me.email) + row("Mobile 🔒", "+91 " + me.mobile.slice(0, 5) + " " + me.mobile.slice(5)) +
        row("City", me.city) + row("State", me.state) + row("PIN code", me.pincode) +
        row("Member since", new Date(me.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));
    // Fill the edit form
    $("pfName").value = me.fullName; $("pfDob").value = me.dob; $("pfGender").value = me.gender || "";
    $("pfEmail").value = me.email; $("pfMobile").value = me.mobile; $("pfPin").value = me.pincode;
    profilePicker.setValue(me.state, me.city, me.district);
}

$("profileForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    clearFieldErrors(form);
    showFormAlert($("pAlert"), "");
    const checks = [
        ["pfName", RULES.fullName($("pfName").value)],
        ["pfDob", !$("pfDob").value ? "Please enter your date of birth." : ageFrom($("pfDob").value) < 18 ? "You must be at least 18." : (me.role === "donor" && ageFrom($("pfDob").value) > 65) ? "Blood donors must be between 18 and 65." : ""],
        ["pfEmail", RULES.email($("pfEmail").value)],
        ["pfMobile", RULES.mobile($("pfMobile").value)],
        ["pfState", profilePicker.getState() ? "" : "Please select your state."],
        ["pfCity", profilePicker.getCity() ? "" : "Please select your city."],
        ["pfPin", RULES.pincode($("pfPin").value)]
    ];
    let ok = true;
    checks.forEach(([id, msg]) => { setFieldError($(id), msg); if (msg) ok = false; });
    if (!ok) { showFormAlert($("pAlert"), "Please correct the highlighted fields."); return; }
    $("pfSave").disabled = true;
    try {
        const data = await api("/auth/me", { method: "PUT", body: {
            fullName: $("pfName").value.trim(), dob: $("pfDob").value, gender: $("pfGender").value, email: $("pfEmail").value.trim(),
            mobile: cleanMobile($("pfMobile").value), state: profilePicker.getState(), city: profilePicker.getCity(),
            district: profilePicker.getDistrict(), pincode: $("pfPin").value.trim()
        } });
        me = data.user;
        renderProfile(); renderHeader();
        showFormAlert($("pAlert"), escapeHtml(data.message + (data.emailNote ? " " + data.emailNote : "")), "success");
    } catch (error) {
        if (error.status === 401) { location.replace("login.html?next=dashboard.html"); return; }
        showFormAlert($("pAlert"), escapeHtml(error.message));
    } finally { $("pfSave").disabled = false; }
});

$("passwordForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    clearFieldErrors(form);
    showFormAlert($("cpAlert"), "");
    const m0 = $("cpCurrent").value ? "" : "Please enter your current password.";
    const m1 = $("cpNew").value ? RULES.password($("cpNew").value) : "Please enter a new password.";
    const m2 = $("cpConfirm").value !== $("cpNew").value ? "The two new passwords do not match." : "";
    setFieldError($("cpCurrent"), m0); setFieldError($("cpNew"), m1); setFieldError($("cpConfirm"), m2);
    if (m0 || m1 || m2) return;
    $("cpSave").disabled = true;
    try {
        const data = await api("/auth/change-password", { method: "POST", body: { currentPassword: $("cpCurrent").value, newPassword: $("cpNew").value, confirmPassword: $("cpConfirm").value } });
        form.reset();
        showFormAlert($("cpAlert"), escapeHtml(data.message), "success");
    } catch (error) {
        showFormAlert($("cpAlert"), escapeHtml(error.message));
    } finally { $("cpSave").disabled = false; }
});
