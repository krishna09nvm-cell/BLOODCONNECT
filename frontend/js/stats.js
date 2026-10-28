// =====================================================================
// LifeDrop PUBLIC DASHBOARD  ("Dashboard" in the main menu)
// ---------------------------------------------------------------------
// LifeDropStats.mount(rootElement, adapter?)
//   adapter.load({ view, source }) -> { source: "real"|"demo", result }
//   adapter.subscribe(fn)          -> call fn when records change (optional)
// Default adapter: GET /api/public-stats (Node server).
// Numbers come from js/analytics-core.js -> computePublic():
// aggregated counts only, duplicates removed, donations counted only
// when marked completed, fulfilled requests counted separately.
// Charts: Chart.js (cdnjs). No names, phones or e-mails are shown.
// =====================================================================
(function () {
    "use strict";
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = n => Number(n || 0).toLocaleString("en-IN");
    const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ico = n => (window.LifeDropDecor ? LifeDropDecor.icon(n) : "");
    const COL = { red: "#c8102e", green: "#187a4e", teal: "#0f8b8d", orange: "#f28c28", dark: "#8f0b21", pink: "#f2bcc8" };
    const GROUP_COL = ["#c8102e", "#f2bcc8", "#f28c28", "#fbd1a6", "#8f0b21", "#d8a3b0", "#187a4e", "#0f8b8d"];
    const API = (typeof API_URL !== "undefined" ? API_URL : (location.protocol.startsWith("http") ? location.origin + "/api" : "http://localhost:5000/api"));

    const serverAdapter = {
        async load(p) {
            const res = await fetch(`${API}/public-stats?view=${encodeURIComponent(p.view)}&source=${encodeURIComponent(p.source)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "The dashboard could not load.");
            return data;
        },
        realLabel: "Website records",
        subscribe(fn) {   // refresh when the visitor comes back to this tab, and every minute
            document.addEventListener("visibilitychange", () => { if (!document.hidden) fn(); });
            setInterval(() => { if (!document.hidden) fn(); }, 60000);
        }
    };

    const CARDS = [
        ["donors", "drop", "red", "🩸", "Total Registered Donors", "Unique donor registrations (the same phone number counts once)"],
        ["requests", "siren", "orange", "🆘", "Total Blood Requests", "Every emergency blood request posted"],
        ["donations", "heart", "green", "❤️", "Successful Blood Donations", "Only donations marked as completed"],
        ["fulfilled", "heartHand", "teal", "🤝", "People Helped / Requests Fulfilled", "Requests marked as fulfilled"],
        ["camps", "tent", "red", "🏕️", "Upcoming Blood Donation Camps", "Approved camps from today onwards"],
        ["users", "user", "teal", "👥", "Registered Users", "Accounts created on the website"]
    ];

    function skeleton(root, realLabel) {
        root.innerHTML = `
        <div class="st-bar">
            <div class="st-switch" role="radiogroup" aria-label="Data shown">
                <button type="button" role="radio" data-src="real" aria-checked="true">${esc(realLabel)}</button>
                <button type="button" role="radio" data-src="demo" aria-checked="false">Demo data</button>
            </div>
            <span class="st-updated" aria-live="polite"></span>
            <button type="button" class="btn btn-light btn-sm st-refresh">↻ Refresh</button>
        </div>
        <div class="st-banner" hidden></div>
        <div class="st-error" role="alert" hidden></div>
        <section class="st-cards" aria-label="Key statistics">
            ${CARDS.map(([k, i, tone, em, title, desc]) => `<article class="st-card tone-${tone}" data-card="${k}">
                <div class="st-card-top"><span class="st-ico" aria-hidden="true">${ico(i)}</span><span class="st-emoji" aria-hidden="true">${em}</span></div>
                <b class="st-num" data-num>–</b><h3>${title}</h3><p>${desc}</p><span class="st-month" data-month></span></article>`).join("")}
        </section>
        <div class="st-grid two">
            <figure class="st-box">
                <figcaption><h2>Blood Donation Overview</h2><p>How the website's records add up. Tap or hover a slice for the exact number.</p></figcaption>
                <div class="st-pie-wrap"><div class="st-canvas pie"><canvas id="stPie" role="img"></canvas><div class="st-empty" hidden>No records yet.</div></div><ul class="st-legend" id="stLegend"></ul></div>
                <p class="st-note">Slices are counts of <b>records</b>, not separate people: one person can register as a donor and also make a request. Requests are split into "not fulfilled yet" and "fulfilled", so no request is counted twice.</p>
            </figure>
            <figure class="st-box">
                <figcaption><h2>Blood group analysis</h2><p>Registered donors by blood group.</p></figcaption>
                <div class="st-common" id="stCommon"></div>
                <div class="st-canvas"><canvas id="stGroups" role="img"></canvas><div class="st-empty" hidden>No donors registered yet.</div></div>
            </figure>
        </div>
        <figure class="st-box">
            <figcaption class="st-head-row"><div><h2>Monthly Blood Donation Activity</h2><p>New donors, requests received, successful donations and requests fulfilled.</p></div>
                <div class="st-switch small" role="radiogroup" aria-label="Time period"><button type="button" role="radio" data-view="monthly" aria-checked="true">Last 6 months</button><button type="button" role="radio" data-view="yearly" aria-checked="false">By year</button></div></figcaption>
            <div class="st-canvas tall"><canvas id="stActivity" role="img"></canvas><div class="st-empty" hidden>No activity in this period yet.</div></div>
        </figure>
        <figure class="st-box">
            <figcaption class="st-head-row"><div><h2>Donors and requests by location</h2><p>Top places by registered donors. Exact addresses are never shown.</p></div>
                <div class="st-switch small" role="radiogroup" aria-label="Group by"><button type="button" role="radio" data-by="city" aria-checked="true">City</button><button type="button" role="radio" data-by="state" aria-checked="false">State</button></div></figcaption>
            <div class="st-leaders" id="stLeaders"></div>
            <div class="st-canvas tall"><canvas id="stPlaces" role="img"></canvas><div class="st-empty" hidden>No location data yet.</div></div>
        </figure>
        <details class="st-rules"><summary>How these numbers are counted</summary><ul>
            <li>Duplicates are removed: the same phone number registered twice counts as one donor, and the same request posted twice on one day counts once.</li>
            <li>A donation counts as <b>successful</b> only when it is marked as completed (checked by the LifeDrop team).</li>
            <li><b>Fulfilled requests</b> are counted separately from all requests. A fulfilled request does not prove that a transfusion took place.</li>
            <li>Sample (demo) records are never counted as real. "Demo data" is generated for demonstrations and is not a real achievement.</li>
            <li>Only totals are shown: no names, phone numbers, e-mail addresses or exact locations.</li></ul></details>`;
    }

    let firstLoad = true, autoDemo = false;
    let charts = {}, state = { view: "monthly", source: "real", by: "city" }, last = null, run = 0, A = serverAdapter, root = null;
    const chartOpts = extra => Object.assign({
        responsive: true, maintainAspectRatio: false, animation: reduce() ? false : { duration: 600 },
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { weight: "600" } } },
            tooltip: { backgroundColor: "#5e0a1b", padding: 10, cornerRadius: 10 } }
    }, extra || {});
    function draw(id, cfg, has, label) {
        const canvas = document.getElementById(id), empty = canvas.parentElement.querySelector(".st-empty");
        canvas.setAttribute("aria-label", label);
        empty.hidden = has; canvas.style.visibility = has ? "visible" : "hidden";
        if (!window.Chart) { empty.hidden = false; empty.textContent = "Charts could not load (no internet?). The numbers above are still correct."; return; }
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(canvas, cfg);
    }
    // writes the percentage on each pie slice
    const pctPlugin = {
        id: "stPct",
        afterDatasetsDraw(chart) {
            const ds = chart.data.datasets[0], total = ds.data.reduce((a, b) => a + b, 0);
            if (!total) return;
            const ctx = chart.ctx; ctx.save();
            chart.getDatasetMeta(0).data.forEach((arc, i) => {
                const v = ds.data[i]; if (!v || v / total < 0.05) return;
                const p = arc.tooltipPosition();
                ctx.font = "800 12px Plus Jakarta Sans, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(Math.round(v / total * 100) + "%", p.x, p.y);
            });
            ctx.restore();
        }
    };

    function render(res) {
        const r = res.result; last = res;
        const banner = $(".st-banner", root);
        if (res.source === "demo") {
            banner.className = "st-banner demo"; banner.hidden = false;
            banner.innerHTML = "<b>DEMO DATA: sample numbers for demonstration only.</b> These are not real website records or achievements." +
                (autoDemo ? ` There are no real records yet, so the demo is shown. <button type="button" class="btn btn-light btn-sm" data-src="real">Show ${esc(A.realLabel || "website records")}</button>` : "");
        } else if (r.empty) {
            banner.className = "st-banner empty"; banner.hidden = false;
            banner.innerHTML = `<b>No records yet.</b> The numbers fill in as people register as donors, post requests and create accounts. ${A.realNote ? esc(A.realNote) + " " : ""}<button type="button" class="btn btn-light btn-sm" data-src="demo">See the dashboard with demo data</button>`;
        } else { banner.hidden = !A.realNote; banner.className = "st-banner"; banner.textContent = A.realNote || ""; }
        // cards
        CARDS.forEach(([k]) => {
            const c = r.cards[k], el = $(`[data-card="${k}"]`, root);
            $("[data-num]", el).textContent = fmt(c.value);
            const m = $("[data-month]", el);
            if (k === "fulfilled") m.textContent = `${fmt(c.confirmed)} confirmed by our team`;
            else if (k === "camps") m.textContent = c.value ? "See them on the Camps page" : "No upcoming camps right now";
            else m.textContent = `+${fmt(c.month)} this month`;
            el.classList.toggle("is-demo", res.source === "demo");
        });
        // pie
        const ov = r.overview, total = ov.values.reduce((a, b) => a + b, 0), cols = [COL.red, COL.orange, COL.teal, COL.green];
        draw("stPie", { type: "pie", data: { labels: ov.labels, datasets: [{ data: ov.values, backgroundColor: cols, borderColor: "#fff", borderWidth: 3, hoverOffset: 12 }] },
            options: chartOpts({ plugins: { legend: { display: false }, tooltip: { backgroundColor: "#5e0a1b", padding: 10, cornerRadius: 10, callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${total ? Math.round(c.raw / total * 100) : 0}%)` } } } }),
            plugins: [pctPlugin] }, total > 0, "Blood Donation Overview. " + ov.labels.map((l, i) => `${l}: ${ov.values[i]}`).join(", "));
        $("#stLegend", root).innerHTML = ov.labels.map((l, i) => `<li><span class="st-dot" style="background:${cols[i]}"></span><span>${esc(l)}</span><b>${fmt(ov.values[i])}</b><small>${total ? Math.round(ov.values[i] / total * 100) : 0}%</small></li>`).join("")
            + `<li class="st-legend-total"><span></span><span>All blood requests</span><b>${fmt(r.cards.requests.value)}</b><small></small></li>`;
        // blood groups
        const gl = Object.keys(r.groups), gv = gl.map(g => r.groups[g]), donorsTotal = gv.reduce((a, b) => a + b, 0);
        $("#stCommon", root).innerHTML = r.mostCommon.length
            ? `<span class="st-drop" aria-hidden="true"><i>${esc(r.mostCommon[0])}</i></span><div><b>Most common: ${r.mostCommon.map(esc).join(" and ")}</b><small>${fmt(r.groups[r.mostCommon[0]])} donor${r.groups[r.mostCommon[0]] === 1 ? "" : "s"} (${Math.round(r.groups[r.mostCommon[0]] / donorsTotal * 100)}% of registered donors${res.source === "demo" ? ", demo data" : ""})</small></div>`
            : '<div><b>Most common blood group</b><small>Appears once donors register.</small></div>';
        draw("stGroups", { type: "bar", data: { labels: gl, datasets: [{ label: "Registered donors", data: gv, backgroundColor: GROUP_COL, borderRadius: 8, maxBarThickness: 40 }] },
            options: chartOpts({ plugins: { legend: { display: false }, tooltip: { backgroundColor: "#5e0a1b", padding: 10, cornerRadius: 10, callbacks: { label: c => ` ${fmt(c.raw)} donor${c.raw === 1 ? "" : "s"} (${donorsTotal ? Math.round(c.raw / donorsTotal * 100) : 0}%)` } } },
                scales: { x: { grid: { display: false }, title: { display: true, text: "Blood group" } }, y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Donors" } } } }) },
            donorsTotal > 0, "Donors by blood group. " + gl.map((g, i) => `${g}: ${gv[i]}`).join(", "));
        // activity
        const a = r.activity, sumA = [...a.donors, ...a.requests, ...a.donations, ...a.fulfilled].reduce((x, y) => x + y, 0);
        draw("stActivity", { type: "bar", data: { labels: a.labels, datasets: [
                { label: "New donor registrations", data: a.donors, backgroundColor: COL.red, borderRadius: 6, maxBarThickness: 26 },
                { label: "Blood requests received", data: a.requests, backgroundColor: COL.orange, borderRadius: 6, maxBarThickness: 26 },
                { label: "Successful donations", data: a.donations, backgroundColor: COL.green, borderRadius: 6, maxBarThickness: 26 },
                { label: "Requests fulfilled", data: a.fulfilled, backgroundColor: COL.teal, borderRadius: 6, maxBarThickness: 26 }] },
            options: chartOpts({ interaction: { mode: "index", intersect: false },
                scales: { x: { grid: { display: false }, title: { display: true, text: r.view === "yearly" ? "Year" : "Month" } }, y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Number of records" } } } }) },
            sumA > 0, `Activity by ${r.view === "yearly" ? "year" : "month"}: ` + a.labels.map((l, i) => `${l}: ${a.donors[i]} donors, ${a.requests[i]} requests, ${a.donations[i]} donations, ${a.fulfilled[i]} fulfilled`).join("; "));
        drawPlaces();
        $(".st-updated", root).textContent = "Updated " + new Date(r.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    }
    function drawPlaces() {
        const r = last.result, list = state.by === "state" ? r.states : r.cities;
        const name = p => (state.by === "state" || !p.state ? p.name : `${p.name}, ${p.state}`);
        const L = r.leaders;
        $("#stLeaders", root).innerHTML = L.donorsCity && L.donorsCity.donors ? `<span>📍 Most donors: <b>${esc(name(L.donorsCity))}</b> (${fmt(L.donorsCity.donors)})</span>${L.fulfilledCity && L.fulfilledCity.fulfilled ? `<span>✅ Most fulfilled requests: <b>${esc(name(L.fulfilledCity))}</b> (${fmt(L.fulfilledCity.fulfilled)})</span>` : ""}` : "";
        draw("stPlaces", { type: "bar", data: { labels: list.map(p => p.name), datasets: [
                { label: "Registered donors", data: list.map(p => p.donors), backgroundColor: COL.red, borderRadius: 5, maxBarThickness: 16 },
                { label: "Blood requests", data: list.map(p => p.requests), backgroundColor: COL.orange, borderRadius: 5, maxBarThickness: 16 },
                { label: "Requests fulfilled", data: list.map(p => p.fulfilled), backgroundColor: COL.teal, borderRadius: 5, maxBarThickness: 16 }] },
            options: chartOpts({ indexAxis: "y", interaction: { mode: "index", intersect: false },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Number of records" } }, y: { grid: { display: false } } } }) },
            list.length > 0, "By " + state.by + ": " + list.map(p => `${p.name}: ${p.donors} donors, ${p.requests} requests, ${p.fulfilled} fulfilled`).join("; "));
    }

    async function load() {
        const my = ++run;
        root.classList.add("is-loading");
        $(".st-error", root).hidden = true;
        try {
            const res = await A.load({ view: state.view, source: state.source });
            if (my !== run) return;
            // No real records yet on the first visit: show the labelled demo instead of an empty page
            if (firstLoad && res.source === "real" && res.result.empty) {
                firstLoad = false; autoDemo = true; state.source = "demo"; setRadio("src", "demo");
                return load();
            }
            firstLoad = false;
            render(res);
        } catch (e) {
            if (my !== run) return;
            const box = $(".st-error", root);
            box.innerHTML = `${esc(e.message === "Failed to fetch" ? "Can't reach the server. Is it running?" : e.message)} <button type="button" class="btn btn-light btn-sm st-retry">Try again</button>`;
            box.hidden = false;
        } finally { if (my === run) root.classList.remove("is-loading"); }
    }
    function setRadio(attr, value) { $$(`[data-${attr}]`, root).forEach(b => { if (b.getAttribute("role") === "radio") b.setAttribute("aria-checked", String(b.dataset[attr] === value)); }); }

    function mount(el, adapter) {
        if (!el || el.dataset.stReady) return;
        el.dataset.stReady = "1"; root = el; A = adapter || serverAdapter;
        if (window.Chart) { Chart.defaults.font.family = "Plus Jakarta Sans, system-ui, sans-serif"; Chart.defaults.color = "#6b5d61"; }
        skeleton(root, A.realLabel || "Website records");
        if (A.defaultSource) { state.source = A.defaultSource; setRadio("src", state.source); }
        root.addEventListener("click", e => {
            const t = e.target.closest("button"); if (!t) return;
            if (t.dataset.src) { state.source = t.dataset.src; setRadio("src", state.source); load(); }
            else if (t.dataset.view) { state.view = t.dataset.view; setRadio("view", state.view); load(); }
            else if (t.dataset.by) { state.by = t.dataset.by; setRadio("by", state.by); if (last) drawPlaces(); }
            else if (t.classList.contains("st-refresh") || t.classList.contains("st-retry")) load();
        });
        if (A.subscribe) A.subscribe(() => { if (state.source === "real") load(); });
        load();
    }
    window.LifeDropStats = { mount, reload: () => root && load() };
    const auto = document.querySelector("[data-public-stats]");
    if (auto && !window.LifeDropStatsAdapter) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount(auto)); else mount(auto);
    }
})();
