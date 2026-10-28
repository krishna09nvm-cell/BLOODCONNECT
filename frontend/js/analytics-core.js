// =====================================================================
// LifeDrop ANALYTICS CORE  (shared by the server and the browser)
// ---------------------------------------------------------------------
// One pure function, compute(dataset, filters), turns raw records into
// every number and chart series of the Admin Analytics Dashboard.
//   - Server: routes/admin.js runs it on the real JSON database.
//   - Browser: the online preview runs it on clearly labelled DEMO data.
//
// COUNTING RULES (honest impact numbers):
//   * A request counts as "people helped" ONLY when an admin has confirmed
//     with the requester or hospital that the patient received blood
//     (request.fulfilmentConfirmed = true). Posting a request is not help.
//   * A "successful match" is a donor-recipient match an admin CONFIRMED.
//     A match does not prove that a transfusion happened.
//   * A "completed donation" counts only when verified (donation.verified)
//     against a blood bank or camp record. Registering is not donating.
//   * Charts contain counts only: never names, phone numbers or e-mails.
//
// dataset = {
//   donors:    [{ id, bloodGroup, city, state, availability, verified, createdAt }]
//   requests:  [{ id, bloodGroup, city, state, urgency, status: "Open"|"Fulfilled"|"Unfulfilled",
//                 createdAt, fulfilledAt, closedAt, fulfilmentConfirmed, confirmedAt }]
//   matches:   [{ id, requestId, donorId, status: "confirmed"|"rejected", bloodGroup, city, state, createdAt, confirmedAt }]
//   donations: [{ id, donorId, bloodGroup, city, state, date, source: "camp"|"request"|"blood-bank", campId, verified }]
//   camps:     [{ id, city, state, date, reviewStatus, cancelled }]
//   feedback:  [{ usedFor, helped, ease, recommend, createdAt }]   (no personal data)
// }
// filters = { from, to, year, month, city: "City|State", bloodGroup }
// =====================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.LifeDropAnalytics = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";
    const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    // Feedback form answers (same keys as js/feedback.js)
    const FEEDBACK_OPTIONS = {
        usedFor: ["find-donor", "request-blood", "register-donor", "find-camp-bank"],
        helped: ["yes", "partial", "not-yet"],
        ease: ["very-easy", "easy", "average", "difficult"],
        recommend: ["definitely", "maybe", "no"]
    };
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // ---------- small date helpers (dates are compared as "YYYY-MM-DD") ----------
    const day = v => (v ? String(v).slice(0, 10) : "");
    const monthKey = v => (v ? String(v).slice(0, 7) : "");          // "2026-10"
    const yearOf = v => (v ? Number(String(v).slice(0, 4)) : NaN);
    const cityKey = r => `${r.city || ""}|${r.state || ""}`;
    function addMonths(key, n) {
        let [y, m] = key.split("-").map(Number); m += n;
        while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
        return `${y}-${String(m).padStart(2, "0")}`;
    }
    const monthLabel = key => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

    // ---------- filters ----------
    function cleanFilters(f = {}) {
        const out = {};
        if (/^\d{4}-\d{2}-\d{2}$/.test(f.from || "")) out.from = f.from;
        if (/^\d{4}-\d{2}-\d{2}$/.test(f.to || "")) out.to = f.to;
        if (/^\d{4}$/.test(String(f.year || ""))) out.year = Number(f.year);
        if (Number(f.month) >= 1 && Number(f.month) <= 12) out.month = Number(f.month);
        if (f.city && String(f.city).includes("|")) out.city = String(f.city);
        if (GROUPS.includes(f.bloodGroup)) out.bloodGroup = f.bloodGroup;
        return out;
    }
    function dateOk(d, f) {
        if (!f.from && !f.to && !f.year && !f.month) return true;
        const x = day(d);
        if (!x) return false;
        if (f.from && x < f.from) return false;
        if (f.to && x > f.to) return false;
        if (f.year && yearOf(x) !== f.year) return false;
        if (f.month && Number(x.slice(5, 7)) !== f.month) return false;
        return true;
    }
    const placeOk = (r, f) => !f.city || cityKey(r) === f.city;
    const groupOk = (r, f) => !f.bloodGroup || r.bloodGroup === f.bloodGroup;

    // Request "outcome" in one word
    function outcome(r) {
        if (r.status === "Fulfilled" && r.fulfilmentConfirmed) return "helped";
        if (r.status === "Fulfilled") return "fulfilled-unconfirmed";
        if (r.status === "Unfulfilled") return "unfulfilled";
        return "pending";
    }

    // ---------- the main calculation ----------
    function compute(data, rawFilters, nowDate) {
        const f = cleanFilters(rawFilters);
        const now = nowDate ? new Date(nowDate) : new Date();
        const today = now.toISOString().slice(0, 10);
        const D = {
            donors: data.donors || [], requests: data.requests || [], matches: data.matches || [],
            donations: data.donations || [], camps: data.camps || []
        };
        // records that pass city + blood group (date handled per metric)
        const P = {
            donors: D.donors.filter(r => placeOk(r, f) && groupOk(r, f)),
            requests: D.requests.filter(r => placeOk(r, f) && groupOk(r, f)),
            matches: D.matches.filter(r => r.status === "confirmed" && placeOk(r, f) && groupOk(r, f)),
            donations: D.donations.filter(r => r.verified && placeOk(r, f) && groupOk(r, f)),
            camps: D.camps.filter(c => c.reviewStatus === "approved" && !c.cancelled && placeOk(c, f))
        };
        const helpedDate = r => r.confirmedAt || r.fulfilledAt || r.createdAt;
        const matchDate = m => m.confirmedAt || m.createdAt;
        // ... and the date filter
        const F = {
            donors: P.donors.filter(r => dateOk(r.createdAt, f)),
            requests: P.requests.filter(r => dateOk(r.createdAt, f)),
            matches: P.matches.filter(m => dateOk(matchDate(m), f)),
            donations: P.donations.filter(d => dateOk(d.date, f)),
            camps: P.camps.filter(c => dateOk(c.date, f))
        };
        const helped = F.requests.filter(r => outcome(r) === "helped");
        const fulfilledAll = F.requests.filter(r => r.status === "Fulfilled");
        const pending = F.requests.filter(r => outcome(r) === "pending");
        const unfulfilled = F.requests.filter(r => outcome(r) === "unfulfilled");
        const campsHeld = F.camps.filter(c => day(c.date) && day(c.date) < today);

        // ---------- cards + "this month vs last month" ----------
        const thisMonth = monthKey(f.to && f.to < today ? f.to : today), lastMonth = addMonths(thisMonth, -1);
        const perMonth = (list, dateFn, key) => list.filter(r => monthKey(dateFn(r)) === key).length;
        const trend = (list, dateFn) => {
            const withDates = list.filter(r => dateFn(r)).length;
            if (!withDates) return null;                         // no timestamps -> no comparison
            const cur = perMonth(list, dateFn, thisMonth), prev = perMonth(list, dateFn, lastMonth);
            return { thisMonth: cur, lastMonth: prev, change: cur - prev, label: monthLabel(lastMonth) };
        };
        const cards = {
            totalDonors: { value: F.donors.length, trend: trend(P.donors, r => r.createdAt) },
            totalDonations: { value: F.donations.length, trend: trend(P.donations, d => d.date) },
            peopleHelped: { value: helped.length, trend: trend(P.requests.filter(r => outcome(r) === "helped"), helpedDate) },
            totalRequests: { value: F.requests.length, trend: trend(P.requests, r => r.createdAt) },
            fulfilledRequests: { value: fulfilledAll.length, trend: trend(P.requests.filter(r => r.status === "Fulfilled"), r => r.fulfilledAt || r.createdAt) },
            pendingRequests: { value: pending.length, trend: null },
            registeredCamps: { value: F.camps.length, trend: trend(P.camps, c => c.date) },
            activeDonors: { value: F.donors.filter(d => d.availability === "Available").length, trend: null }
        };

        // ---------- doughnut / pie ----------
        const impact = {
            helped: helped.length,
            fulfilledUnconfirmed: fulfilledAll.length - helped.length,
            pending: pending.length,
            unfulfilled: unfulfilled.length
        };
        const groups = {};
        GROUPS.forEach(g => { groups[g] = 0; });
        let other = 0;
        F.requests.forEach(r => { if (groups[r.bloodGroup] !== undefined) groups[r.bloodGroup]++; else other++; });
        if (other) groups.Other = other;
        const donorIdsWhoDonated = new Set(F.donations.filter(d => d.donorId != null).map(d => String(d.donorId)));
        const donorActivity = {
            registered: F.donors.length,
            available: F.donors.filter(d => d.availability === "Available").length,
            donated: F.donors.filter(d => donorIdsWhoDonated.has(String(d.id))).length
        };

        // ---------- monthly series ----------
        let months = [];
        if (f.year) {
            for (let m = 1; m <= 12; m++) months.push(`${f.year}-${String(m).padStart(2, "0")}`);
            if (f.month) months = [months[f.month - 1]];
        } else if (f.from || f.to) {
            const all = [...F.requests.map(r => r.createdAt), ...F.donations.map(d => d.date), ...F.camps.map(c => c.date)].map(monthKey).filter(Boolean).sort();
            let start = monthKey(f.from) || all[0] || thisMonth, end = monthKey(f.to) || thisMonth;
            if (end < start) end = start;
            for (let k = start; k <= end && months.length < 60; k = addMonths(k, 1)) months.push(k);
        } else {
            for (let i = 11; i >= 0; i--) months.push(addMonths(thisMonth, -i));
        }
        const count = (list, fn, k) => list.filter(r => monthKey(fn(r)) === k).length;
        const reqHelped = P.requests.filter(r => outcome(r) === "helped");
        const monthly = {
            labels: months.map(monthLabel), keys: months,
            donations: months.map(k => count(F.donations, d => d.date, k)),
            helped: months.map(k => count(reqHelped.filter(r => dateOk(helpedDate(r), f)), helpedDate, k)),
            requests: months.map(k => count(F.requests, r => r.createdAt, k)),
            fulfilled: months.map(k => count(fulfilledAll, r => r.createdAt, k)),
            campsHeld: months.map(k => count(campsHeld, c => c.date, k)),
            campDonations: months.map(k => count(F.donations.filter(d => d.source === "camp"), d => d.date, k)),
            matches: months.map(k => count(F.matches, matchDate, k))
        };

        // ---------- yearly (ignores the date filter so every year is listed) ----------
        const yearSet = new Set();
        [...P.requests.map(r => r.createdAt), ...P.donations.map(d => d.date), ...P.matches.map(matchDate), ...P.camps.map(c => c.date), ...P.donors.map(d => d.createdAt)]
            .forEach(v => { const y = yearOf(v); if (y) yearSet.add(y); });
        const citiesBefore = new Set();
        const yearly = [...yearSet].sort().map(y => {
            const inY = v => yearOf(v) === y;
            const yCities = new Set([...P.donors.filter(d => inY(d.createdAt)), ...P.requests.filter(r => inY(r.createdAt)), ...P.camps.filter(c => inY(c.date))].map(cityKey));
            const newCities = [...yCities].filter(c => !citiesBefore.has(c)); newCities.forEach(c => citiesBefore.add(c));
            return {
                year: y,
                donations: P.donations.filter(d => inY(d.date)).length,
                matches: P.matches.filter(m => inY(matchDate(m))).length,
                helped: reqHelped.filter(r => inY(helpedDate(r))).length,
                requests: P.requests.filter(r => inY(r.createdAt)).length,
                fulfilled: P.requests.filter(r => r.status === "Fulfilled" && inY(r.createdAt)).length,
                campsHeld: P.camps.filter(c => inY(c.date) && day(c.date) < today).length,
                newDonors: P.donors.filter(d => inY(d.createdAt)).length,
                newCities: newCities.length
            };
        });

        // ---------- growth: cumulative people helped, month by month ----------
        const helpMonths = reqHelped.map(r => monthKey(helpedDate(r))).filter(Boolean).sort();
        const growth = { labels: [], cumulative: [] };
        if (helpMonths.length) {
            let total = 0;
            for (let k = helpMonths[0]; k <= thisMonth && growth.labels.length < 120; k = addMonths(k, 1)) {
                total += helpMonths.filter(m => m === k).length;
                growth.labels.push(monthLabel(k)); growth.cumulative.push(total);
            }
        }

        // ---------- emergency analytics ----------
        const matchedReqIds = new Set(P.matches.map(m => String(m.requestId)));
        const firstMatch = {};
        P.matches.forEach(m => { const k = String(m.requestId), t = matchDate(m); if (t && (!firstMatch[k] || t < firstMatch[k])) firstMatch[k] = t; });
        const responseHours = F.requests.map(r => {
            const end = firstMatch[String(r.id)] || r.fulfilledAt;
            if (!end || !r.createdAt) return null;
            const h = (new Date(end) - new Date(r.createdAt)) / 36e5;
            return h >= 0 ? h : null;
        }).filter(h => h !== null);
        const resolved = fulfilledAll.length + unfulfilled.length;
        const byUrgency = {};
        ["Critical", "Urgent", "Normal"].forEach(u => {
            const list = F.requests.filter(r => r.urgency === u);
            byUrgency[u] = { pending: list.filter(r => outcome(r) === "pending").length, fulfilled: list.filter(r => r.status === "Fulfilled").length, unfulfilled: list.filter(r => outcome(r) === "unfulfilled").length };
        });
        const emergency = {
            total: F.requests.length,
            matched: F.requests.filter(r => matchedReqIds.has(String(r.id))).length,
            fulfilled: fulfilledAll.length,
            unfulfilled: unfulfilled.length,
            pending: pending.length,
            avgResponseHours: responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null,
            responseSample: responseHours.length,
            successRate: resolved ? fulfilledAll.length / resolved : null,
            byUrgency
        };

        // ---------- impact totals ----------
        const cities = new Set([...F.donors, ...F.requests, ...F.camps, ...F.donations].map(cityKey).filter(k => k !== "|"));
        const impactTotals = {
            peopleHelped: helped.length, matches: F.matches.length, donations: F.donations.length,
            campsConducted: campsHeld.length, cities: cities.size, requestsFulfilled: fulfilledAll.length
        };

        // cities for the filter dropdown (all records, not filtered)
        const cityOptions = [...new Set([...D.donors, ...D.requests, ...D.camps, ...D.donations].map(cityKey).filter(k => k !== "|"))].sort();

        // ---------- feedback form (date filter only: answers have no city or blood group) ----------
        const fb = (data.feedback || []).filter(x => dateOk(x.createdAt, f));
        const share = (n, total) => (total ? n / total : null);
        const tally = key => { const o = {}; FEEDBACK_OPTIONS[key].forEach(v => { o[v] = fb.filter(x => x[key] === v).length; }); return o; };
        const fbCounts = { usedFor: tally("usedFor"), helped: tally("helped"), ease: tally("ease"), recommend: tally("recommend") };
        const feedback = {
            total: fb.length, counts: fbCounts,
            helpedYes: share(fbCounts.helped.yes, fb.length), helpedAny: share(fbCounts.helped.yes + fbCounts.helped.partial, fb.length),
            easy: share(fbCounts.ease["very-easy"] + fbCounts.ease.easy, fb.length),
            recommend: share(fbCounts.recommend.definitely, fb.length),
            monthly: months.map(k => fb.filter(x => monthKey(x.createdAt) === k).length),
            trend: trend((data.feedback || []), x => x.createdAt)
        };

        return { filters: f, generatedAt: now.toISOString(), feedback, cards, impact, groups, donorActivity, monthly, yearly, growth, emergency, impactTotals, cityOptions, years: [...yearSet].sort() };
    }

    // ---------- CSV report (aggregated numbers only, no personal data) ----------
    function csvCell(v) {
        let s = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;             // stop spreadsheet formula injection
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }
    function toCSV(result, sourceLabel) {
        const rows = [["LifeDrop analytics report"], ["Data source", sourceLabel], ["Generated", result.generatedAt],
            ["Filters", JSON.stringify(result.filters)], [],
            ["Summary", "Value"]];
        const c = result.cards;
        [["Registered donors", c.totalDonors.value], ["Verified donations", c.totalDonations.value], ["People helped (confirmed)", c.peopleHelped.value],
         ["Blood requests", c.totalRequests.value], ["Fulfilled requests", c.fulfilledRequests.value], ["Pending requests", c.pendingRequests.value],
         ["Approved blood camps", c.registeredCamps.value], ["Available donors", c.activeDonors.value],
         ["Confirmed donor-recipient matches", result.impactTotals.matches], ["Camps held", result.impactTotals.campsConducted], ["Cities covered", result.impactTotals.cities],
         ["Emergency success rate (fulfilled / resolved)", result.emergency.successRate === null ? "n/a" : (result.emergency.successRate * 100).toFixed(1) + "%"],
         ["Average response time (hours)", result.emergency.avgResponseHours === null ? "n/a" : result.emergency.avgResponseHours.toFixed(1)]].forEach(r => rows.push(r));
        rows.push([], ["Month", "Verified donations", "People helped", "Requests", "Fulfilled", "Confirmed matches", "Camps held", "Camp donations"]);
        result.monthly.labels.forEach((l, i) => rows.push([l, result.monthly.donations[i], result.monthly.helped[i], result.monthly.requests[i], result.monthly.fulfilled[i], result.monthly.matches[i], result.monthly.campsHeld[i], result.monthly.campDonations[i]]));
        rows.push([], ["Blood group requested", "Requests"]);
        Object.entries(result.groups).forEach(([g, n]) => rows.push([g, n]));
        rows.push([], ["Year", "Verified donations", "Confirmed matches", "People helped", "Requests", "Fulfilled", "Camps held", "New donors", "New cities"]);
        result.yearly.forEach(y => rows.push([y.year, y.donations, y.matches, y.helped, y.requests, y.fulfilled, y.campsHeld, y.newDonors, y.newCities]));
        const fbk = result.feedback;
        if (fbk) {
            const p2 = x => (x === null ? "n/a" : (x * 100).toFixed(1) + "%");
            rows.push([], ["Feedback form", "Value"], ["Responses", fbk.total], ["Website helped (yes)", p2(fbk.helpedYes)], ["Helped fully or partly", p2(fbk.helpedAny)],
                ["Easy or very easy to use", p2(fbk.easy)], ["Would definitely recommend", p2(fbk.recommend)]);
            Object.entries(fbk.counts).forEach(([q, o]) => Object.entries(o).forEach(([k, n]) => rows.push([`${q}: ${k}`, n])));
        }
        rows.push([], ["Note", "A confirmed match does not prove a transfusion took place. Donations count only when verified."]);
        return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    }

    // ---------- DEMO data (sample, NOT real) ----------
    // Generated the same way every time (seeded), relative to today, so the
    // demo dashboard always shows the last two years. Contains no names.
    function makeDemoDataset(nowDate) {
        let seed = 20260611;
        const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        const pick = list => list[Math.floor(rnd() * list.length)];
        const weighted = pairs => { let x = rnd() * pairs.reduce((a, p) => a + p[1], 0); for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[0][0]; };
        // approximate Indian blood group mix
        const GROUP_MIX = [["O+", 35], ["B+", 31], ["A+", 21], ["AB+", 7], ["O-", 2], ["B-", 2], ["A-", 1], ["AB-", 1]];
        const CITIES = [["Mangaluru", "Karnataka"], ["Udupi", "Karnataka"], ["Bengaluru", "Karnataka"], ["Mysuru", "Karnataka"], ["Kochi", "Kerala"],
            ["Chennai", "Tamil Nadu"], ["Pune", "Maharashtra"], ["Hyderabad", "Telangana"], ["Jaipur", "Rajasthan"], ["Lucknow", "Uttar Pradesh"]];
        const now = nowDate ? new Date(nowDate) : new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1));
        const span = now - start;
        const at = frac => new Date(start.getTime() + frac * span);
        const grow = () => Math.sqrt(rnd());                     // more activity in recent months
        const iso = d => d.toISOString();
        const out = { donors: [], requests: [], matches: [], donations: [], camps: [], feedback: [] };
        // cities "join" over time
        const cityStart = CITIES.map((c, i) => i < 3 ? 0 : Math.min(.85, i * 0.09));
        const cityAt = frac => { const ok = CITIES.filter((c, i) => cityStart[i] <= frac); return pick(ok); };

        for (let i = 1; i <= 420; i++) {
            const fr = grow(), [city, state] = cityAt(fr);
            out.donors.push({ id: "demo-d" + i, bloodGroup: weighted(GROUP_MIX), city, state, availability: rnd() < .62 ? "Available" : "Not Available", verified: rnd() < .7, createdAt: iso(at(fr)), isDemo: true });
        }
        for (let i = 1; i <= 26; i++) {
            const fr = Math.min(.999, grow()), [city, state] = cityAt(fr), d = at(fr);
            out.camps.push({ id: "demo-c" + i, city, state, date: iso(d).slice(0, 10), reviewStatus: "approved", cancelled: rnd() < .05, isDemo: true });
        }
        out.camps.forEach(c => {
            if (c.cancelled || c.date >= iso(now).slice(0, 10)) return;
            const n = 14 + Math.floor(rnd() * 30);
            for (let k = 0; k < n; k++) {
                const donor = rnd() < .55 ? pick(out.donors.filter(d => d.city === c.city).concat(out.donors[0])) : null;
                out.donations.push({ id: "demo-n" + (out.donations.length + 1), donorId: donor ? donor.id : null, bloodGroup: donor ? donor.bloodGroup : weighted(GROUP_MIX), city: c.city, state: c.state, date: c.date, source: "camp", campId: c.id, verified: rnd() < .93, isDemo: true });
            }
        });
        for (let i = 1; i <= 260; i++) {
            const fr = grow(), [city, state] = cityAt(fr), created = at(fr);
            const age = (now - created) / 864e5;
            const urgency = weighted([["Critical", 3], ["Urgent", 5], ["Normal", 4]]);
            const r = { id: "demo-r" + i, bloodGroup: weighted(GROUP_MIX), city, state, urgency, status: "Open", createdAt: iso(created), isDemo: true };
            if (age > 3 || rnd() < .4) {
                const x = rnd();
                if (x < .74) {
                    const hours = urgency === "Critical" ? 1 + rnd() * 8 : urgency === "Urgent" ? 3 + rnd() * 20 : 8 + rnd() * 50;
                    const done = new Date(created.getTime() + hours * 36e5);
                    if (done < now) {
                        r.status = "Fulfilled"; r.fulfilledAt = iso(done);
                        if (rnd() < .8) { r.fulfilmentConfirmed = true; r.confirmedAt = iso(new Date(Math.min(now.getTime(), done.getTime() + (2 + rnd() * 30) * 36e5))); }
                        if (rnd() < .7) {
                            const donor = pick(out.donors.filter(d => d.city === city).concat(out.donors[0]));
                            out.matches.push({ id: "demo-m" + (out.matches.length + 1), requestId: r.id, donorId: donor.id, status: "confirmed", bloodGroup: r.bloodGroup, city, state, createdAt: r.fulfilledAt, confirmedAt: r.fulfilledAt, isDemo: true });
                            if (rnd() < .85) out.donations.push({ id: "demo-n" + (out.donations.length + 1), donorId: donor.id, bloodGroup: r.bloodGroup, city, state, date: r.fulfilledAt.slice(0, 10), source: "request", requestId: r.id, verified: true, isDemo: true });
                        }
                    }
                } else if (x < .9 && age > 2) { r.status = "Unfulfilled"; r.closedAt = iso(new Date(created.getTime() + 48 * 36e5)); }
            }
            out.requests.push(r);
        }
        for (let i = 0; i < 140; i++) {
            const fr = grow(), [city, state] = cityAt(fr), donor = pick(out.donors);
            out.donations.push({ id: "demo-n" + (out.donations.length + 1), donorId: donor.id, bloodGroup: donor.bloodGroup, city, state, date: iso(at(fr)).slice(0, 10), source: "blood-bank", verified: rnd() < .9, isDemo: true });
        }
        // sample feedback answers (no text, no names)
        for (let i = 0; i < 186; i++) {
            const helped = weighted([["yes", 58], ["partial", 27], ["not-yet", 15]]);
            out.feedback.push({
                id: "demo-f" + i, usedFor: weighted([["find-donor", 38], ["request-blood", 17], ["register-donor", 26], ["find-camp-bank", 19]]), helped,
                ease: weighted(helped === "not-yet" ? [["very-easy", 10], ["easy", 30], ["average", 40], ["difficult", 20]] : [["very-easy", 42], ["easy", 38], ["average", 15], ["difficult", 5]]),
                recommend: weighted(helped === "not-yet" ? [["definitely", 25], ["maybe", 50], ["no", 25]] : [["definitely", 70], ["maybe", 25], ["no", 5]]),
                createdAt: iso(at(grow())), isDemo: true
            });
        }
        // a few upcoming sample camps (dates after today) and sample user accounts
        for (let i = 1; i <= 5; i++) {
            const [city, state] = pick(CITIES), d = new Date(now.getTime() + (3 + Math.floor(rnd() * 50)) * 864e5);
            out.camps.push({ id: "demo-cu" + i, city, state, date: iso(d).slice(0, 10), reviewStatus: "approved", cancelled: false, isDemo: true });
        }
        out.users = [];
        for (let i = 1; i <= 640; i++) out.users.push({ key: "demo-u" + i, createdAt: iso(at(grow())), isDemo: true });
        return out;
    }

    // =================================================================
    // PUBLIC DASHBOARD numbers (statistics.html / #stats)
    // Counts only: no names, phone numbers, e-mails or exact locations.
    //  - duplicates are removed by "key" (e.g. the same phone number
    //    registered twice counts as one donor)
    //  - a donation counts only when marked completed/verified
    //  - fulfilled requests are counted separately from all requests
    // data = { donors:[{key,bloodGroup,city,state,createdAt}],
    //          requests:[{key,bloodGroup,city,state,status,createdAt,fulfilledAt,fulfilmentConfirmed}],
    //          donations:[{key,verified,date,city,state}],
    //          camps:[{date,reviewStatus,cancelled,city,state}], users:[{key,createdAt}] }
    // =================================================================
    function unique(list) {
        const seen = new Set(), out = [];
        let dup = 0;
        (list || []).forEach(r => {
            const k = String(r.key ?? r.id ?? JSON.stringify(r));
            if (seen.has(k)) { dup++; return; }
            seen.add(k); out.push(r);
        });
        return { list: out, dup };
    }
    function computePublic(data, opts, nowDate) {
        const o = opts || {};
        const now = nowDate ? new Date(nowDate) : new Date(), today = now.toISOString().slice(0, 10);
        const D = unique(data.donors), R = unique(data.requests), U = unique(data.users), N = unique((data.donations || []).filter(n => n.verified));
        const donors = D.list, requests = R.list, users = U.list, donations = N.list;
        const fulfilled = requests.filter(r => r.status === "Fulfilled");
        const upcoming = (data.camps || []).filter(c => c.reviewStatus === "approved" && !c.cancelled && day(c.date) >= today);
        const thisMonth = monthKey(today), inMonth = (v, k) => monthKey(v) === k;
        const newThisMonth = (list, fn) => list.filter(r => inMonth(fn(r), thisMonth)).length;
        const fulDate = r => r.fulfilledAt || r.createdAt;
        const cards = {
            donors: { value: donors.length, month: newThisMonth(donors, r => r.createdAt) },
            requests: { value: requests.length, month: newThisMonth(requests, r => r.createdAt) },
            donations: { value: donations.length, month: newThisMonth(donations, n => n.date) },
            fulfilled: { value: fulfilled.length, month: newThisMonth(fulfilled, fulDate), confirmed: fulfilled.filter(r => r.fulfilmentConfirmed).length },
            camps: { value: upcoming.length },
            users: { value: users.length, month: newThisMonth(users, u => u.createdAt) }
        };
        const overview = {
            labels: ["Registered donors", "Blood requests (not fulfilled yet)", "Fulfilled requests", "Successful donations"],
            values: [donors.length, requests.length - fulfilled.length, fulfilled.length, donations.length]
        };
        // activity: last 6 months, or every year in the data
        let keys, labelOf, keyOf;
        if (o.view === "yearly") {
            const years = new Set([now.getFullYear()]);
            [...donors.map(d => d.createdAt), ...requests.map(r => r.createdAt), ...donations.map(n => n.date)].forEach(v => { const y = yearOf(v); if (y) years.add(y); });
            keys = [...years].sort().slice(-6).map(String); labelOf = k => k; keyOf = v => (v ? String(v).slice(0, 4) : "");
        } else {
            keys = []; for (let i = 5; i >= 0; i--) keys.push(addMonths(thisMonth, -i));
            labelOf = monthLabel; keyOf = monthKey;
        }
        const per = (list, fn) => keys.map(k => list.filter(r => keyOf(fn(r)) === k).length);
        const activity = {
            labels: keys.map(labelOf),
            donors: per(donors, d => d.createdAt), requests: per(requests, r => r.createdAt),
            donations: per(donations, n => n.date), fulfilled: per(fulfilled, fulDate)
        };
        // blood groups of registered donors
        const groups = {}; GROUPS.forEach(g => { groups[g] = donors.filter(d => d.bloodGroup === g).length; });
        const top = Math.max(0, ...Object.values(groups));
        const mostCommon = top > 0 ? GROUPS.filter(g => groups[g] === top) : [];
        // places
        const placeTable = by => {
            const m = new Map();
            const add = (r, field) => {
                const name = by === "state" ? r.state : r.city;
                if (!name) return;
                const k = by === "state" ? name : `${name}|${r.state || ""}`;
                if (!m.has(k)) m.set(k, { name, state: by === "state" ? "" : (r.state || ""), donors: 0, requests: 0, fulfilled: 0 });
                m.get(k)[field]++;
            };
            donors.forEach(d => add(d, "donors")); requests.forEach(r => add(r, "requests")); fulfilled.forEach(r => add(r, "fulfilled"));
            return [...m.values()].sort((a, b) => b.donors - a.donors || b.requests - a.requests || a.name.localeCompare(b.name));
        };
        const cities = placeTable("city"), states = placeTable("state");
        const best = (list, f) => list.slice().sort((a, b) => b[f] - a[f])[0];
        return {
            generatedAt: now.toISOString(), view: o.view === "yearly" ? "yearly" : "monthly",
            cards, overview, activity, groups, mostCommon, cities: cities.slice(0, 8), states: states.slice(0, 8),
            leaders: { donorsCity: best(cities, "donors"), fulfilledCity: best(cities, "fulfilled") },
            duplicatesIgnored: { donors: D.dup, requests: R.dup, users: U.dup, donations: N.dup },
            empty: !donors.length && !requests.length && !donations.length && !users.length && !upcoming.length
        };
    }

    return { GROUPS, FEEDBACK_OPTIONS, computePublic, compute, toCSV, makeDemoDataset, outcome, cleanFilters };
});
