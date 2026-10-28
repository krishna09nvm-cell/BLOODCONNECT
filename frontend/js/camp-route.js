// ==========================================================
// CAMP-ROUTE.JS - road routes, city markers and a quick filter
// for the camp map (camps.html). Works on the existing Leaflet
// map "campMap" from js/camps.js - no second map.
// ----------------------------------------------------------
//  "Show route" (cards, map pop-ups, details window):
//    1. asks the browser for your location (permission prompt)
//    2. asks a ROAD routing service (OSRM, OpenStreetMap roads)
//       for the route: through our server, GET /api/route
//    3. draws the route, highlights the camp, zooms to fit,
//       shows road distance + estimated driving time
//    4. "Get Directions" opens Google Maps from you to the camp
//  If routing fails, NO line is drawn (no fake route): the panel
//  says why and offers Google Maps instead.
//  City markers: click a city to see its camps and blood banks.
//  Styles: section 24 of css/style.css.
// ==========================================================
(function () {
    const cfg = Object.assign({
        // Default: our own server asks OSRM (backend/routes/route.js)
        async fetchRoute(from, to) {
            let res;
            try { res = await fetch(`${API_URL}/route?` + new URLSearchParams({ from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}` })); }
            catch (e) { throw new Error("Cannot reach the server."); }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "The road routing service did not answer.");
            return data;          // { distanceKm, durationMin, coordinates: [[lat, lng], ...], source }
        },
        async loadHubs() {
            const res = await fetch(`${API_URL}/city-hubs`);
            if (!res.ok) throw new Error("hubs");
            return (await res.json()).hubs;
        }
    }, window.CampRouteConfig || {});

    const $r = id => document.getElementById(id);
    let map = null;           // the camp map; set by attach() once it exists
    const ICON_ROUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/></svg>';

    // ---------- Route panel (above the map) ----------
    function ensurePanel() {
        if ($r("routePanel")) return;
        const mapEl = $r("campMap");
        mapEl.insertAdjacentHTML("beforebegin", `
            <div class="route-panel" id="routePanel" hidden aria-live="polite">
                <div class="route-head">
                    <span class="route-icon">${ICON_ROUTE}</span>
                    <div class="route-title"><b id="routeTitle">Route</b><small id="routeSub"></small></div>
                    <button type="button" class="route-x" id="routeX" aria-label="Clear route">×</button>
                </div>
                <div class="route-stats" id="routeStats" hidden>
                    <div><b id="routeKm">–</b><span>by road</span></div>
                    <div><b id="routeTime">–</b><span>by car · estimate, no live traffic</span></div>
                </div>
                <p class="route-note" id="routeNote"></p>
                <div class="route-actions">
                    <a class="btn btn-primary btn-sm" id="routeGmaps" target="_blank" rel="noopener">Get Directions ↗</a>
                    <button type="button" class="btn btn-light btn-sm" id="routeClear">Clear route</button>
                </div>
            </div>`);
        // the panel floats on the map: keep its clicks/scrolls from moving the map
        ["click", "dblclick", "mousedown", "touchstart", "wheel", "pointerdown"].forEach(ev =>
            $r("routePanel").addEventListener(ev, e => e.stopPropagation(), { passive: true }));
        $r("routeX").addEventListener("click", clearRoute);
        $r("routeClear").addEventListener("click", clearRoute);
    }

    let routeLayer = null, lastGps = null, routeRun = 0;
    // leave room at the top of the map for the floating route panel
    function pad(p) { const el = $r("routePanel"), h = el && !el.hidden ? el.offsetHeight + 16 : p; return { paddingTopLeft: [p, Math.max(p, h)], paddingBottomRight: [p, p] }; }
    function layer() { if (!routeLayer) routeLayer = L.layerGroup().addTo(map); return routeLayer; }

    function itemPoint(x) { return x.type === "camp" ? { lat: x.latitude, lng: x.longitude } : { lat: x.lat, lng: x.lng }; }
    function itemPlace(x) {
        return x.type === "camp" ? [x.venue, x.city, x.state].filter(Boolean).join(", ") + (x.pincode ? " - " + x.pincode : "")
            : [x.address, x.city, x.state].filter(Boolean).join(", ") + (x.pincode ? " - " + x.pincode : "");
    }
    function googleUrl(from, to) {
        const p = new URLSearchParams({ api: "1", destination: `${to.lat},${to.lng}`, travelmode: "driving" });
        if (from) p.set("origin", `${from.lat},${from.lng}`);
        return "https://www.google.com/maps/dir/?" + p;
    }
    const km = m => (m < 10 ? m.toFixed(1) : Math.round(m)).toString();
    function duration(min) {
        if (min < 60) return `${Math.max(1, Math.round(min))} min`;
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return m ? `${h} h ${m} min` : `${h} h`;
    }
    function straightKm(a, b) {
        const R = 6371, rad = d => d * Math.PI / 180;
        const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    // Where the route starts: your GPS position (asked now), or the place you searched
    async function getOrigin() {
        if (lastGps && Date.now() - lastGps.t < 2 * 60 * 1000) return { lat: lastGps.lat, lng: lastGps.lng, label: "your current location", gps: true };
        try {
            const p = await getCurrentPosition();
            lastGps = { lat: p.lat, lng: p.lng, t: Date.now() };
            return { lat: p.lat, lng: p.lng, label: "your current location", gps: true };
        } catch (err) {
            if (typeof campCenter !== "undefined" && campCenter) {
                return { lat: campCenter.lat, lng: campCenter.lng, label: campCenter.label, gps: false, gpsError: err.message };
            }
            throw err;
        }
    }

    function showPanel({ title, sub = "", note = "", stats = null, gmaps, loading = false }) {
        ensurePanel();
        const p = $r("routePanel");
        p.hidden = false;
        p.classList.toggle("is-loading", loading);
        $r("routeTitle").textContent = title;
        $r("routeSub").textContent = sub;
        $r("routeNote").textContent = note;
        $r("routeNote").hidden = !note;
        $r("routeStats").hidden = !stats;
        if (stats) { $r("routeKm").textContent = stats.km; $r("routeTime").textContent = stats.time; }
        $r("routeGmaps").hidden = !gmaps;
        if (gmaps) $r("routeGmaps").href = gmaps;
    }

    function clearRoute() {
        routeRun++;
        if (routeLayer) routeLayer.clearLayers();
        if ($r("routePanel")) $r("routePanel").hidden = true;
        document.querySelectorAll("[data-route].is-active").forEach(b => b.classList.remove("is-active"));
    }

    async function showRoute(key) {
        const x = (typeof campShown !== "undefined" ? campShown : {})[key];
        if (!x || !map) return;
        const run = ++routeRun;
        const to = itemPoint(x);
        document.querySelectorAll("[data-route]").forEach(b => b.classList.toggle("is-active", b.dataset.route === key));
        $r("campMap").scrollIntoView({ behavior: "smooth", block: "center" });
        showPanel({ title: `Route to ${x.name}`, sub: itemPlace(x), note: "Getting your location… Please allow location access if your browser asks.", gmaps: googleUrl(null, to), loading: true });

        let from;
        try { from = await getOrigin(); }
        catch (err) {
            if (run !== routeRun) return;
            showPanel({ title: `Route to ${x.name}`, sub: itemPlace(x),
                note: `${err.message} Allow location access and press "Show route" again, or use Google Maps (it can use your phone's location).`, gmaps: googleUrl(null, to) });
            highlightOnly(to, null);
            return;
        }
        if (run !== routeRun) return;
        showPanel({ title: `Route to ${x.name}`, sub: `From ${from.label}`, note: "Finding the road route…", gmaps: googleUrl(from, to), loading: true });

        try {
            const route = await cfg.fetchRoute(from, to);
            if (run !== routeRun) return;
            drawRoute(route.coordinates, from, to);
            showPanel({
                title: `Route to ${x.name}`,
                sub: `From ${from.label}${from.gps ? "" : " (your GPS location was not available)"}`,
                stats: { km: `${km(route.distanceKm)} km`, time: duration(route.durationMin) },
                note: `Road route: ${route.source || "OSRM, OpenStreetMap roads"}. Times are estimates; check traffic in Google Maps.`,
                gmaps: googleUrl(from, to)
            });
        } catch (err) {
            if (run !== routeRun) return;
            highlightOnly(to, from);
            showPanel({
                title: `Route to ${x.name}`, sub: `From ${from.label}`,
                note: `The road route could not be loaded (${err.message}). No route is drawn. Straight-line distance: ${km(straightKm(from, to))} km (not a road distance). Use "Get Directions" for turn-by-turn navigation in Google Maps.`,
                gmaps: googleUrl(from, to)
            });
        }
    }

    function markers(to, from) {
        const g = layer();
        g.clearLayers();
        L.marker([to.lat, to.lng], { icon: L.divIcon({ className: "", html: '<div class="route-dest"><span></span></div>', iconSize: [56, 56], iconAnchor: [28, 28] }), interactive: false, zIndexOffset: -10 }).addTo(g);
        if (from) L.marker([from.lat, from.lng], { icon: L.divIcon({ className: "", html: '<div class="route-start"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1200, title: "Start" }).addTo(g);
        return g;
    }
    function highlightOnly(to, from) {
        markers(to, from);
        if (from) map.fitBounds(L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]), { ...pad(50), maxZoom: 14 });
        else map.setView([to.lat, to.lng], 14);
    }
    function drawRoute(coords, from, to) {
        const g = markers(to, from);
        L.polyline(coords, { color: "#ffffff", weight: 10, opacity: .95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(g);
        const line = L.polyline(coords, { color: "#c8102e", weight: 5.5, opacity: .95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(g);
        map.fitBounds(line.getBounds(), { ...pad(40), maxZoom: 16 });
    }

    // "Show route" buttons anywhere (cards, pop-ups, details window)
    document.addEventListener("click", e => {
        const b = e.target.closest && e.target.closest("[data-route]");
        if (!b) return;
        e.preventDefault();
        const modal = document.getElementById("detailModal");
        if (modal && !modal.hidden && typeof closeDetails === "function") closeDetails();
        showRoute(b.dataset.route);
    });

    // ---------- City markers ----------
    let hubLayer = null;
    function setHubs(hubs) {
        if (!map || !hubs) return;
        hubLayer = hubLayer || L.layerGroup();
        hubLayer.clearLayers();
        hubs.forEach(h => {
            const n = h.camps + h.banks;
            const size = n >= 40 ? 40 : n >= 15 ? 34 : 28;
            const m = L.marker([h.lat, h.lng], {
                icon: L.divIcon({ className: "", html: `<div class="city-hub ${h.camps ? "has-camps" : ""}" style="width:${size}px;height:${size}px"><b>${n}</b></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
                title: h.city, keyboard: true, zIndexOffset: -100
            });
            if (m.bindTooltip) m.bindTooltip(`<b>${escapeHtml(h.city)}</b>, ${escapeHtml(h.state)}<br>${h.camps} camp${h.camps === 1 ? "" : "s"}${h.demoCamps ? " (sample)" : ""} · ${h.banks} blood bank${h.banks === 1 ? "" : "s"}/hospital${h.banks === 1 ? "" : "s"}<br><i>Click to see them</i>`, { direction: "top", offset: [0, -size / 2] });
            m.on("click", () => openCity(h));
            m.addTo(hubLayer);
        });
        toggleHubs();
    }
    function openCity(h) {
        if (typeof setCampRange === "function") setCampRange("0-25");
        ["stUpcoming", "stOngoing", "stBanks", "stHospitals"].forEach(id => { const el = $r(id); if (el) el.checked = true; });
        setCampCenter(h.lat, h.lng, `${h.city}, ${h.state} (city centre)`, "city");
        loadCamps();
    }
    function toggleHubs() {
        if (!hubLayer || !map) return;
        const show = map.getZoom() <= 8;
        if (show && !map.hasLayer(hubLayer)) hubLayer.addTo(map);
        if (!show && map.hasLayer(hubLayer)) map.removeLayer(hubLayer);
    }


    // ---------- Quick filter: camp name, city, state or PIN ----------
    function filterItems(items) {
        const box = $r("campFilterText");
        const q = box ? box.value.trim().toLowerCase() : "";
        if (!q) return items;
        const words = q.split(/[\s,]+/).filter(Boolean);
        return items.filter(x => {
            const text = [x.name, x.organiser, x.venue, x.address, x.city, x.district, x.state, x.pincode].filter(Boolean).join(" ").toLowerCase();
            return words.every(w => text.includes(w));
        });
    }
    let filterTimer;
    document.addEventListener("input", e => {
        if (e.target.id !== "campFilterText") return;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => loadCamps({ keepView: true }), 250);
    });

    // Button HTML for cards / pop-ups
    const button = (key, cls = "btn btn-light btn-sm") => `<button type="button" class="${cls} route-btn" data-route="${escapeHtml(key)}">${ICON_ROUTE}<span>Show route</span></button>`;

    // Connect to the camp map (called again safely; the map may be created later)
    function attach(m) {
        if (!m || map === m) return;
        map = m;
        if (map.on) map.on("zoomend", toggleHubs);
        // City markers need their data (camps + blood banks per city)
        Promise.resolve().then(() => cfg.loadHubs()).then(setHubs).catch(() => { /* city markers are optional */ });
    }

    window.CampRoute = { attach, showRoute, clearRoute, setHubs, filterItems, button, googleUrl };
    if (typeof campMap !== "undefined" && campMap) attach(campMap);
})();
