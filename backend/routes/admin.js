// ==========================================================
// ADMIN ANALYTICS DASHBOARD API  (/api/admin/...)
// ----------------------------------------------------------
// Every route except /login needs an admin session (utils/admin-auth.js).
// The checks happen HERE on the server, so hiding a page in the browser
// is never the only protection.
//
//   POST /api/admin/login            { email, password }
//   POST /api/admin/logout
//   GET  /api/admin/me
//   GET  /api/admin/analytics        ?source=real|demo&from&to&year&month&city&bloodGroup
//   GET  /api/admin/export           same filters -> CSV file (aggregated numbers only)
//   GET  /api/admin/donors           ?q&city&bloodGroup&verified   (private: admins only)
//   POST /api/admin/donors/:id/verify            { verified: true|false }
//   GET  /api/admin/requests         ?status&city&bloodGroup&urgency
//   POST /api/admin/requests/:id/status          { action: confirm-help | mark-unfulfilled | reopen }
//   GET  /api/admin/matches          POST /api/admin/matches { requestId, donorId, note }
//   POST /api/admin/matches/:id/reject
//   GET  /api/admin/donations        POST /api/admin/donations { donorId?, bloodGroup, state, city, date, source, campId?, requestId?, units, verified }
//   POST /api/admin/donations/:id/verify         { verified: true|false }
//   GET  /api/admin/feedback         latest written suggestions (answers are in /analytics)
//   GET  /api/admin/camps            POST /api/admin/camps/:id/review  { action: approve | reject, latitude, longitude, contactVerified }
// ==========================================================

const express = require("express");
const { readData, writeData, getNextId } = require("../utils/db");
const A = require("../utils/admin-auth");
const Analytics = require("../../frontend/js/analytics-core.js");

const MATCHES_FILE = "matches.json";
const DONATIONS_FILE = "donations.json";
const GROUPS = Analytics.GROUPS;
const SOURCES = ["camp", "request", "blood-bank"];

module.exports = function createAdminRouter(deps) {
    const { DONORS_FILE, REQUESTS_FILE, readCamps, reviewCamp, findLocation, canReceiveFrom, campStatus } = deps;
    const router = express.Router();

    // ---------------- login / logout / me ----------------
    router.post("/login", A.login);
    router.post("/logout", (req, res) => { A.endSession(req, res); res.json({ message: "Logged out." }); });
    router.use(A.requireAdmin);                           // everything below: admins only
    router.get("/me", (req, res) => res.json({ admin: { name: req.admin.name, email: req.admin.email } }));

    // ---------------- the real dataset (sample/demo records are left out) ----------------
    function realDataset() {
        const pickPlace = r => ({ city: r.city, state: r.state });
        return {
            donors: readData(DONORS_FILE).filter(d => !d.isDemo).map(d => ({ id: d.id, bloodGroup: d.bloodGroup, ...pickPlace(d), availability: d.availability, verified: Boolean(d.verified), createdAt: d.createdAt })),
            requests: readData(REQUESTS_FILE).filter(r => !r.isDemo).map(r => ({ id: r.id, bloodGroup: r.bloodGroup, ...pickPlace(r), urgency: r.urgency, status: r.status, createdAt: r.createdAt, fulfilledAt: r.fulfilledAt, closedAt: r.closedAt, fulfilmentConfirmed: Boolean(r.fulfilmentConfirmed), confirmedAt: r.confirmedAt })),
            matches: readData(MATCHES_FILE),
            donations: readData(DONATIONS_FILE),
            camps: readCamps().filter(c => !c.isDemo).map(c => ({ id: c.id, ...pickPlace(c), date: c.date, reviewStatus: c.reviewStatus, cancelled: Boolean(c.cancelled) })),
            feedback: readData("feedback.json").map(({ suggestion, ...answers }) => answers)   // answers only
        };
    }
    function dataFor(source) {
        return source === "demo" ? { data: Analytics.makeDemoDataset(), label: "DEMO SAMPLE DATA (not real)" } : { data: realDataset(), label: "Real records" };
    }

    router.get("/analytics", (req, res) => {
        const source = req.query.source === "demo" ? "demo" : "real";
        const { data } = dataFor(source);
        const result = Analytics.compute(data, req.query);
        const realEmpty = source === "real" && !data.donors.length && !data.requests.length && !data.donations.length && !data.camps.length && !data.feedback.length;
        res.json({ source, realEmpty, result });
    });

    router.get("/export", (req, res) => {
        const source = req.query.source === "demo" ? "demo" : "real";
        const { data, label } = dataFor(source);
        const csv = Analytics.toCSV(Analytics.compute(data, req.query), label);
        A.audit(req.admin, "export-csv", source);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="lifedrop-analytics-${source}-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send("﻿" + csv);
    });

    // ---------------- feedback suggestions (free text: admins only, never in charts or CSV) ----------------
    router.get("/feedback", (req, res) => {
        const list = readData("feedback.json").filter(f => f.suggestion);
        res.json({ count: list.length, suggestions: list.slice(-50).reverse().map(f => ({ text: f.suggestion, usedFor: f.usedFor, helped: f.helped, createdAt: f.createdAt })) });
    });

    // ---------------- donors (private details: admins only, never exact location) ----------------
    router.get("/donors", (req, res) => {
        const q = String(req.query.q || "").toLowerCase().trim();
        let list = readData(DONORS_FILE);
        if (req.query.bloodGroup) list = list.filter(d => d.bloodGroup === req.query.bloodGroup);
        if (req.query.city) list = list.filter(d => `${d.city}|${d.state}` === req.query.city);
        if (req.query.verified === "yes") list = list.filter(d => d.verified);
        if (req.query.verified === "no") list = list.filter(d => !d.verified);
        if (q) list = list.filter(d => `${d.name} ${d.phone} ${d.city} ${d.state} ${d.bloodGroup}`.toLowerCase().includes(q));
        const donations = readData(DONATIONS_FILE).filter(n => n.verified);
        list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        res.json({
            count: list.length,
            donors: list.slice(0, 300).map(d => ({
                id: d.id, name: d.name, age: d.age, bloodGroup: d.bloodGroup, phone: d.phone, city: d.city, state: d.state,
                availability: d.availability, verified: Boolean(d.verified), verifiedAt: d.verifiedAt || null, createdAt: d.createdAt || null,
                donations: donations.filter(n => String(n.donorId) === String(d.id)).length,
                isDemo: Boolean(d.isDemo)
            }))
        });
    });

    router.post("/donors/:id/verify", (req, res) => {
        const donors = readData(DONORS_FILE);
        const d = donors.find(x => String(x.id) === req.params.id);
        if (!d) return res.status(404).json({ message: "Donor not found." });
        if (d.isDemo) return res.status(400).json({ message: "Sample (demo) donors can't be verified." });
        d.verified = req.body.verified === true;
        d.verifiedAt = d.verified ? new Date().toISOString() : null;
        writeData(DONORS_FILE, donors);
        A.audit(req.admin, d.verified ? "verify-donor" : "unverify-donor", `donor:${d.id}`);
        res.json({ message: d.verified ? "Donor marked as verified." : "Verification removed.", verified: d.verified });
    });

    // ---------------- requests ----------------
    router.get("/requests", (req, res) => {
        let list = readData(REQUESTS_FILE);
        const st = req.query.status;
        if (st === "Helped") list = list.filter(r => r.status === "Fulfilled" && r.fulfilmentConfirmed);
        else if (st) list = list.filter(r => r.status === st);
        if (req.query.bloodGroup) list = list.filter(r => r.bloodGroup === req.query.bloodGroup);
        if (req.query.city) list = list.filter(r => `${r.city}|${r.state}` === req.query.city);
        if (req.query.urgency) list = list.filter(r => r.urgency === req.query.urgency);
        const matches = readData(MATCHES_FILE).filter(m => m.status === "confirmed");
        list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        res.json({ count: list.length, requests: list.slice(0, 300).map(r => ({ ...r, matches: matches.filter(m => String(m.requestId) === String(r.id)).length })) });
    });

    router.post("/requests/:id/status", (req, res) => {
        const requests = readData(REQUESTS_FILE);
        const r = requests.find(x => String(x.id) === req.params.id);
        if (!r) return res.status(404).json({ message: "Request not found." });
        if (r.isDemo) return res.status(400).json({ message: "Sample (demo) requests can't be changed here." });
        const now = new Date().toISOString(), action = req.body.action;
        if (action === "confirm-help") {
            // The admin checked with the requester or hospital that the patient got blood.
            r.status = "Fulfilled"; r.fulfilledAt = r.fulfilledAt || now; r.fulfilmentConfirmed = true; r.confirmedAt = now;
        } else if (action === "mark-unfulfilled") {
            r.status = "Unfulfilled"; r.closedAt = now; r.fulfilmentConfirmed = false; delete r.confirmedAt;
        } else if (action === "reopen") {
            r.status = "Open"; r.fulfilmentConfirmed = false; delete r.confirmedAt; delete r.closedAt; delete r.fulfilledAt;
        } else return res.status(400).json({ message: "Unknown action." });
        writeData(REQUESTS_FILE, requests);
        A.audit(req.admin, `request-${action}`, `request:${r.id}`);
        res.json({ message: { "confirm-help": "Confirmed: the patient received help.", "mark-unfulfilled": "Request closed as not fulfilled.", reopen: "Request reopened." }[action], request: r });
    });

    // ---------------- donor-recipient matches ----------------
    router.get("/matches", (req, res) => {
        const donors = readData(DONORS_FILE), requests = readData(REQUESTS_FILE);
        const list = readData(MATCHES_FILE).slice().reverse().map(m => {
            const d = donors.find(x => String(x.id) === String(m.donorId)), r = requests.find(x => String(x.id) === String(m.requestId));
            return { ...m, donorName: d ? d.name : "(deleted donor)", donorGroup: d ? d.bloodGroup : "", hospital: r ? r.hospital : "(deleted request)" };
        });
        res.json({ count: list.length, matches: list.slice(0, 300) });
    });

    router.post("/matches", (req, res) => {
        const { requestId, donorId, note } = req.body || {};
        const requests = readData(REQUESTS_FILE), donors = readData(DONORS_FILE);
        const r = requests.find(x => String(x.id) === String(requestId));
        const d = donors.find(x => String(x.id) === String(donorId));
        if (!r) return res.status(400).json({ message: "Choose an existing blood request." });
        if (!d) return res.status(400).json({ message: "Choose an existing donor." });
        if (r.isDemo || d.isDemo) return res.status(400).json({ message: "Sample (demo) records can't be matched." });
        if (!(canReceiveFrom[r.bloodGroup] || []).includes(d.bloodGroup)) return res.status(400).json({ message: `A ${r.bloodGroup} patient can't receive ${d.bloodGroup} red cells. Check the blood groups.` });
        const matches = readData(MATCHES_FILE);
        if (matches.some(m => m.status === "confirmed" && String(m.requestId) === String(r.id) && String(m.donorId) === String(d.id))) return res.status(409).json({ message: "This match is already recorded." });
        const now = new Date().toISOString();
        const m = { id: getNextId(matches), requestId: r.id, donorId: d.id, status: "confirmed", bloodGroup: r.bloodGroup, city: r.city, state: r.state, createdAt: now, confirmedAt: now, confirmedBy: req.admin.id, note: String(note || "").slice(0, 200) };
        matches.push(m);
        writeData(MATCHES_FILE, matches);
        A.audit(req.admin, "confirm-match", `request:${r.id} donor:${d.id}`);
        res.status(201).json({ message: "Match recorded as confirmed. (A match alone does not prove a transfusion took place.)", match: m });
    });

    router.post("/matches/:id/reject", (req, res) => {
        const matches = readData(MATCHES_FILE);
        const m = matches.find(x => String(x.id) === req.params.id);
        if (!m) return res.status(404).json({ message: "Match not found." });
        m.status = "rejected"; m.rejectedAt = new Date().toISOString();
        writeData(MATCHES_FILE, matches);
        A.audit(req.admin, "reject-match", `match:${m.id}`);
        res.json({ message: "Match removed from the confirmed list." });
    });

    // ---------------- donations ----------------
    router.get("/donations", (req, res) => {
        const donors = readData(DONORS_FILE);
        let list = readData(DONATIONS_FILE).slice().reverse();
        if (req.query.verified === "yes") list = list.filter(n => n.verified);
        if (req.query.verified === "no") list = list.filter(n => !n.verified);
        res.json({ count: list.length, donations: list.slice(0, 300).map(n => ({ ...n, donorName: n.donorId != null ? ((donors.find(d => String(d.id) === String(n.donorId)) || {}).name || "(deleted donor)") : "" })) });
    });

    router.post("/donations", (req, res) => {
        const b = req.body || {};
        const today = new Date().toISOString().slice(0, 10);
        if (!GROUPS.includes(b.bloodGroup)) return res.status(400).json({ message: "Choose the blood group." });
        const place = findLocation(b.state, b.city);
        if (!place) return res.status(400).json({ message: "Choose a valid state and city." });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || b.date > today) return res.status(400).json({ message: "Enter the donation date (not in the future)." });
        if (!SOURCES.includes(b.source)) return res.status(400).json({ message: "Choose where the donation happened." });
        const units = Number(b.units || 1);
        if (!(units >= 1 && units <= 4)) return res.status(400).json({ message: "Units must be between 1 and 4." });
        let donorId = null;
        if (b.donorId !== undefined && b.donorId !== "" && b.donorId !== null) {
            const d = readData(DONORS_FILE).find(x => String(x.id) === String(b.donorId));
            if (!d || d.isDemo) return res.status(400).json({ message: "Donor not found (sample donors can't be used)." });
            if (d.bloodGroup !== b.bloodGroup) return res.status(400).json({ message: `That donor's blood group is ${d.bloodGroup}.` });
            donorId = d.id;
        }
        const campId = b.campId ? Number(b.campId) : null;
        if (b.source === "camp" && campId && !readCamps().some(c => c.id === campId && !c.isDemo)) return res.status(400).json({ message: "Camp not found." });
        const list = readData(DONATIONS_FILE);
        const now = new Date().toISOString();
        const n = {
            id: getNextId(list), donorId, bloodGroup: b.bloodGroup, city: place.city, state: place.state, date: b.date, source: b.source,
            campId: b.source === "camp" ? campId : null, requestId: b.source === "request" && b.requestId ? Number(b.requestId) : null, units,
            verified: b.verified === true, verifiedAt: b.verified === true ? now : null, recordedBy: req.admin.id, createdAt: now
        };
        list.push(n);
        writeData(DONATIONS_FILE, list);
        A.audit(req.admin, "record-donation", `donation:${n.id}`);
        res.status(201).json({ message: n.verified ? "Verified donation recorded." : "Donation recorded. It will count after you verify it.", donation: n });
    });

    router.post("/donations/:id/verify", (req, res) => {
        const list = readData(DONATIONS_FILE);
        const n = list.find(x => String(x.id) === req.params.id);
        if (!n) return res.status(404).json({ message: "Donation not found." });
        n.verified = req.body.verified === true; n.verifiedAt = n.verified ? new Date().toISOString() : null;
        writeData(DONATIONS_FILE, list);
        A.audit(req.admin, n.verified ? "verify-donation" : "unverify-donation", `donation:${n.id}`);
        res.json({ message: n.verified ? "Donation verified." : "Verification removed." });
    });

    // ---------------- camps (approve / reject submissions) ----------------
    router.get("/camps", (req, res) => {
        const camps = readCamps().filter(c => !c.isDemo).map(c => ({ ...c, status: campStatus(c) }))
            .sort((a, b) => (a.reviewStatus === "pending" ? 0 : 1) - (b.reviewStatus === "pending" ? 0 : 1) || String(b.date).localeCompare(String(a.date)));
        res.json({ count: camps.length, pending: camps.filter(c => c.reviewStatus === "pending").length, camps });
    });

    router.post("/camps/:id/review", async (req, res) => {
        const action = (req.body || {}).action;
        if (!["approve", "reject"].includes(action)) return res.status(400).json({ message: "Unknown action." });
        const out = await reviewCamp(Number(req.params.id), req.body);
        if (out.status < 300) A.audit(req.admin, `camp-${action}`, `camp:${req.params.id}`);
        res.status(out.status).json(out.body);
    });

    return router;
};
