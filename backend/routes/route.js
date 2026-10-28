// ==========================================================
// ROUTES/ROUTE.JS - road route between two points (GET /api/route)
// ----------------------------------------------------------
// Asks OSRM (Open Source Routing Machine) for a DRIVING route on
// OpenStreetMap roads: real road geometry, distance and an
// estimated travel time (no live traffic).
//   OSRM_URL  default https://router.project-osrm.org (free demo
//             server: light use only, max 1 request/second).
//             For a busy site run your own OSRM server and set OSRM_URL.
// Example: /api/route?from=12.87,74.84&to=12.91,74.85
// Answer:  { distanceKm, durationMin, coordinates: [[lat, lng], ...], source }
// ==========================================================

const express = require("express");

const OSRM_URL = () => (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
const USER_AGENT = "LifeDrop-BloodDonationFinder/1.0 (BCA college project)";
const cache = new Map();                 // same request -> same answer (max 300 kept)
const hits = new Map();                  // per visitor: max 30 routes per 10 minutes
let lastCall = 0;

function readPoint(text) {
    const [lat, lng] = String(text || "").split(",").map(Number);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    // India and its neighbourhood only
    if (lat < 5 || lat > 38 || lng < 66 || lng > 99) return null;
    return { lat, lng };
}

module.exports = function createRouteRouter() {
    const router = express.Router();

    router.get("/", async (req, res) => {
        const from = readPoint(req.query.from), to = readPoint(req.query.to);
        if (!from || !to) return res.status(400).json({ message: "Start and destination must be valid points in India." });

        const now = Date.now();
        const list = (hits.get(req.ip) || []).filter(t => t > now - 600e3);
        if (list.length >= 30) return res.status(429).json({ message: "Too many route requests. Please wait a few minutes." });
        list.push(now); hits.set(req.ip, list);

        const key = [from.lat, from.lng, to.lat, to.lng].map(n => n.toFixed(5)).join(",");
        if (cache.has(key)) return res.json(cache.get(key));

        // be polite to the free server: at most 1 request per second
        const wait = lastCall + 1100 - Date.now();
        lastCall = Math.max(Date.now(), lastCall + 1100);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));

        try {
            const url = `${OSRM_URL()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
            const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12000) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.code !== "Ok" || !data.routes || !data.routes.length) {
                const reason = data.code === "NoRoute" ? "no road route was found between these points" : "the routing service did not return a route";
                return res.status(502).json({ message: reason });
            }
            const r = data.routes[0];
            const answer = {
                distanceKm: Number((r.distance / 1000).toFixed(2)),
                durationMin: Number((r.duration / 60).toFixed(1)),
                coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                source: "OSRM, © OpenStreetMap contributors"
            };
            cache.set(key, answer);
            if (cache.size > 300) cache.delete(cache.keys().next().value);
            res.json(answer);
        } catch (error) {
            console.error("[route] OSRM request failed:", error.name);
            res.status(502).json({ message: error.name === "TimeoutError" ? "the routing service took too long" : "the routing service could not be reached" });
        }
    });

    return router;
};
