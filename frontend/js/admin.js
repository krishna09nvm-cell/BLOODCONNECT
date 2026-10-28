// =====================================================================
// LifeDrop ADMIN ANALYTICS DASHBOARD (browser side)
// ---------------------------------------------------------------------
// Draws the whole dashboard inside <div id="adminApp"></div>.
// Data comes from an "adapter":
//   - default: the Node server  (/api/admin/... with the admin cookie)
//   - online preview: window.LifeDropAdminAPI (demo data, see lifedrop.html)
// Charts: Chart.js (loaded from cdnjs before this file).
// Numbers: js/analytics-core.js (same code the server uses).
// This file never contains passwords, keys or private records:
// everything private is fetched only after the server checked the admin.
// =====================================================================
(function () {
    "use strict";
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = n => (n === null || n === undefined || isNaN(n) ? "–" : Number(n).toLocaleString("en-IN"));
    const pct = x => (x === null || x === undefined ? "–" : (x * 100).toFixed(1) + "%");
    const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ico = name => (window.LifeDropDecor ? LifeDropDecor.icon(name) : "");
    const LOCS = () => (typeof INDIA_LOCATIONS !== "undefined" ? INDIA_LOCATIONS : []);
    const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    const C = { red: "#c8102e", dark: "#8f0b21", deep: "#5e0a1b", coral: "#f4846f", coralSoft: "#fbd3c9", green: "#187a4e", greenL: "#34b27b", greenSoft: "#bfe6d1", pink: "#f2bcc8", rose: "#d8a3b0", grey: "#b6a7ab", cream: "#fde9dc" };
    const GROUP_COLORS = { "A+": C.red, "A-": C.pink, "B+": C.coral, "B-": C.coralSoft, "AB+": C.dark, "AB-": C.rose, "O+": C.green, "O-": C.greenL, Other: C.grey };

    // ---------------------------------------------------------------
    // Server adapter (Node project)
    // ---------------------------------------------------------------
    const BASE = (window.API_URL || "/api") + "/admin";
    async function call(path, opts = {}) {
        const res = await fetch(BASE + path, { credentials: "same-origin", headers: opts.body ? { "Content-Type": "application/json" } : {}, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = "admin-login.html"; throw new Error("Please log in again."); }
        if (!res.ok) throw new Error(data.message || "Something went wrong (" + res.status + ").");
        return data;
    }
    const qs = p => { const u = new URLSearchParams(); Object.entries(p || {}).forEach(([k, v]) => { if (v !== "" && v !== undefined && v !== null) u.set(k, v); }); const s = u.toString(); return s ? "?" + s : ""; };
    const serverAPI = {
        mode: "server",
        me: () => call("/me").then(d => d.admin),
        logout: () => call("/logout", { method: "POST", body: {} }).then(() => { location.href = "admin-login.html"; }),
        analytics: p => call("/analytics" + qs(p)),
        exportCSV: p => { location.href = BASE + "/export" + qs(p); },
        donors: p => call("/donors" + qs(p)),
        verifyDonor: (id, verified) => call(`/donors/${encodeURIComponent(id)}/verify`, { method: "POST", body: { verified } }),
        requests: p => call("/requests" + qs(p)),
        requestAction: (id, action) => call(`/requests/${encodeURIComponent(id)}/status`, { method: "POST", body: { action } }),
        matches: () => call("/matches"),
        createMatch: b => call("/matches", { method: "POST", body: b }),
        rejectMatch: id => call(`/matches/${encodeURIComponent(id)}/reject`, { method: "POST", body: {} }),
        donations: p => call("/donations" + qs(p)),
        createDonation: b => call("/donations", { method: "POST", body: b }),
        verifyDonation: (id, verified) => call(`/donations/${encodeURIComponent(id)}/verify`, { method: "POST", body: { verified } }),
        camps: () => call("/camps"),
        feedbackList: () => call("/feedback"),
        reviewCamp: (id, b) => call(`/camps/${encodeURIComponent(id)}/review`, { method: "POST", body: b })
    };

    // ---------------------------------------------------------------
    // Page skeleton
    // ---------------------------------------------------------------
    const NAV = [["overview", "Overview", "dashboard"], ["charts", "Impact charts", "heart"], ["trends", "Trends", "calendar"], ["emergency", "Emergency", "siren"],
        ["impact", "Our impact", "sparkles"], ["feedback", "Feedback", "heart"], ["manage", "Manage", "shield"], ["reports", "Reports", "file"]];
    const CARDS = [
        ["totalDonors", "🩸", "Total Registered Donors", "drop", "red"], ["totalDonations", "❤️", "Total Blood Donations", "heart", "coral", "verified only"],
        ["peopleHelped", "🤝", "People Helped Successfully", "heartHand", "green", "confirmed only"], ["totalRequests", "🆘", "Total Blood Requests", "siren", "red"],
        ["fulfilledRequests", "✅", "Successfully Fulfilled Requests", "shield", "green"], ["pendingRequests", "⏳", "Pending Requests", "calendar", "coral"],
        ["registeredCamps", "🏥", "Registered Blood Camps", "tent", "red", "approved"], ["activeDonors", "📍", "Active Donors", "pin", "green", "available now"]];

    function skeleton(root) {
        root.innerHTML = `
        <div class="adm">
          <aside class="adm-side" aria-label="Dashboard sections">
            <div class="adm-brand"><span class="logo-drop"><span>+</span></span><div><b>LifeDrop</b><small>Admin analytics</small></div></div>
            <nav class="adm-nav">${NAV.map(([id, label, i], k) => `<a href="#adm-${id}" class="${k ? "" : "active"}" data-sec="${id}">${ico(i)}<span>${label}</span></a>`).join("")}</nav>
            <div class="adm-who"><span id="admWho">Admin</span><button type="button" class="btn btn-light btn-sm" id="admLogout">${ico("logout")} Log out</button></div>
          </aside>
          <main class="adm-main">
            <header class="adm-top" id="adm-overview">
              <div><span class="eyebrow">Admin · private</span><h1>Analytics Dashboard</h1><p class="adm-sub">Live numbers from the website's records. Charts show counts only, never names or phone numbers.</p></div>
              <div class="adm-top-actions">
                <div class="adm-switch" role="radiogroup" aria-label="Data source">
                  <button type="button" role="radio" data-source="real" aria-checked="true">Real records</button>
                  <button type="button" role="radio" data-source="demo" aria-checked="false">Demo sample data</button>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="admExport">${ico("file")} Export CSV</button>
              </div>
            </header>
            <div class="adm-banner" id="admBanner" hidden></div>
            <form class="adm-filters" id="admFilters" aria-label="Filters">
              <label>From<input type="date" name="from"></label>
              <label>To<input type="date" name="to"></label>
              <label>Year<select name="year"><option value="">All years</option></select></label>
              <label>Month<select name="month"><option value="">All months</option>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></label>
              <label>City<select name="city"><option value="">All cities</option></select></label>
              <label>Blood group<select name="bloodGroup"><option value="">All groups</option>${GROUPS.map(g => `<option>${g}</option>`).join("")}</select></label>
              <button type="reset" class="btn btn-light btn-sm">Reset</button>
              <span class="adm-status" id="admStatus" role="status" aria-live="polite"></span>
            </form>
            <div class="adm-error" id="admError" role="alert" hidden></div>

            <section class="adm-cards" id="admCards" aria-label="Key statistics">
              ${CARDS.map(([key, emoji, label, icon, tone, note]) => `
                <article class="adm-card tone-${tone} is-loading" data-card="${key}">
                  <div class="adm-card-top"><span class="adm-card-ico" aria-hidden="true">${ico(icon)}</span><span class="adm-card-emoji" aria-hidden="true">${emoji}</span></div>
                  <div class="adm-card-num" data-num>0</div>
                  <div class="adm-card-label">${label}${note ? ` <small>(${note})</small>` : ""}</div>
                  <div class="adm-card-trend" data-trend></div>
                </article>`).join("")}
            </section>

            <section class="adm-section" id="adm-charts">
              <div class="adm-head"><h2>Our Life-Saving Impact</h2><p>Every blood request and what happened to it. "Helped" means an admin confirmed with the requester or hospital that the patient received blood.</p></div>
              <div class="adm-grid g3">
                ${chartBox("impact", "Our Life-Saving Impact", "Outcome of blood requests")}
                ${chartBox("groups", "Blood groups requested", "Share of requests by blood group")}
                ${chartBox("donors", "Donor activity", "Registered, available now, and donated (verified)")}
              </div>
            </section>

            <section class="adm-section" id="adm-trends">
              <div class="adm-head"><h2>Trends over time</h2><p>Monthly totals for the filters above (12 months, or the year / date range you pick).</p></div>
              <div class="adm-grid g2">
                ${chartBox("monthlyDonations", "Monthly donations", "Verified donations per month", "tall")}
                ${chartBox("helpedLine", "People helped over time", "Confirmed help per month", "tall")}
                ${chartBox("reqVsFul", "Blood requests vs fulfilled", "Requests made each month and how many were fulfilled", "tall")}
                ${chartBox("campActivity", "Blood camp activity", "Camps held (bars) and donations recorded at camps (line)", "tall")}
              </div>
              <div class="adm-year">
                <div class="adm-year-head"><h3>Yearly impact</h3><label>Year <select id="admYearPick"></select></label></div>
                <div class="adm-year-nums" id="admYearNums"></div>
              </div>
            </section>

            <section class="adm-section" id="adm-emergency">
              <div class="adm-head"><h2>Emergency analytics</h2><p>All emergency blood requests for the filters above.</p></div>
              <div class="adm-mini" id="admEmergency"></div>
              <div class="adm-grid g2">
                ${chartBox("urgency", "Requests by urgency and outcome", "Pending, fulfilled and not fulfilled for each urgency level", "tall")}
                ${chartBox("success", "Emergency success rate", "Fulfilled vs not fulfilled (pending requests not counted)", "tall")}
              </div>
            </section>

            <section class="adm-section adm-impact" id="adm-impact">
              <div class="adm-head"><h2>Our Impact in Saving Lives</h2><p>Only confirmed and verified records are counted here.</p></div>
              <div class="adm-impact-grid" id="admImpact"></div>
              <div class="adm-grid g2">
                <div class="adm-box"><h3>Yearly achievements</h3><ol class="adm-timeline" id="admTimeline"></ol></div>
                ${chartBox("growth", "Growth in successful help", "Total people helped (cumulative, confirmed)", "tall")}
              </div>
              <div class="adm-rules">
                <b>How we count</b>
                <ul>
                  <li><b>People helped</b>: a request counts only after an admin confirms with the requester or hospital that the patient received blood. Posting a request or registering as a donor is never counted as help.</li>
                  <li><b>Successful match</b>: a donor-recipient match an admin confirmed. A match does <b>not</b> prove that a transfusion took place; the hospital decides that after cross-matching.</li>
                  <li><b>Completed donation</b>: counted only when verified against a blood bank or camp record.</li>
                </ul>
              </div>
            </section>

            <section class="adm-section" id="adm-feedback">
              <div class="adm-head"><h2>Visitor feedback</h2><p>Answers from the "Help Us Save More Lives!" form. Anonymous: no names, phone numbers or e-mails are collected. The date filters apply; city and blood group don't (the form doesn't ask for them).</p></div>
              <div class="adm-mini fb-mini" id="admFeedback"></div>
              <div class="adm-grid g2">
                ${chartBox("fbHelped", "Did our website help?", "Share of answers")}
                ${chartBox("fbRecommend", "Would recommend us", "Share of answers")}
                ${chartBox("fbEase", "How easy was the website to use?", "Number of answers")}
                ${chartBox("fbUsed", "What people used the website for", "Number of answers")}
              </div>
              <div class="adm-box adm-sugg"><h3>${ico("file")} Latest suggestions</h3><div id="admSuggestions"><p class="adm-empty">Loading…</p></div></div>
            </section>

            <section class="adm-section" id="adm-manage">
              <div class="adm-head"><h2>Manage records</h2><p>Private details are shown to signed-in admins only.</p></div>
              <div class="adm-tabs" role="tablist">
                ${[["donors", "Donors"], ["requests", "Requests"], ["matches", "Matches & donations"], ["camps", "Camp submissions"]].map(([id, l], k) => `<button type="button" role="tab" id="tab-${id}" aria-controls="pane-${id}" aria-selected="${k ? "false" : "true"}" data-tab="${id}">${l}<span class="adm-badge" data-badge="${id}" hidden></span></button>`).join("")}
              </div>
              <div class="adm-pane" id="pane-donors" role="tabpanel" aria-labelledby="tab-donors"></div>
              <div class="adm-pane" id="pane-requests" role="tabpanel" aria-labelledby="tab-requests" hidden></div>
              <div class="adm-pane" id="pane-matches" role="tabpanel" aria-labelledby="tab-matches" hidden></div>
              <div class="adm-pane" id="pane-camps" role="tabpanel" aria-labelledby="tab-camps" hidden></div>
            </section>

            <section class="adm-section" id="adm-reports">
              <div class="adm-head"><h2>Reports</h2><p>Download the numbers on this page (with the current filters) as a CSV file for Excel or Google Sheets. The report contains totals only, no personal details.</p></div>
              <button type="button" class="btn btn-primary" id="admExport2">${ico("file")} Download CSV report</button>
            </section>
          </main>
        </div>
        <div class="adm-toast" id="admToast" role="status" aria-live="polite" hidden></div>`;
    }
    function chartBox(id, title, desc, size) {
        return `<figure class="adm-box adm-chart ${size || ""}" data-chart="${id}">
            <figcaption><h3>${title}</h3><p>${desc}</p></figcaption>
            <div class="adm-canvas"><canvas id="ch-${id}" role="img" aria-label="${esc(title)}"></canvas><div class="adm-chart-empty" hidden>No data for these filters yet.</div><div class="adm-spinner" aria-hidden="true"></div></div>
        </figure>`;
    }

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let API = serverAPI, source = "real", last = null, charts = {}, loadRun = 0, cache = {};
    function toast(msg, type) {
        const t = $("#admToast"); t.textContent = msg; t.className = "adm-toast " + (type || ""); t.hidden = false;
        clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4200);
    }
    const filters = () => { const f = Object.fromEntries(new FormData($("#admFilters")).entries()); return f; };

    // ---------------------------------------------------------------
    // Analytics: load + draw
    // ---------------------------------------------------------------
    async function load() {
        const run = ++loadRun;
        $("#admStatus").textContent = "Updating…";
        $$(".adm-card").forEach(c => c.classList.add("is-loading"));
        $$(".adm-chart").forEach(c => c.classList.add("is-loading"));
        $("#admError").hidden = true;
        try {
            const res = await API.analytics({ source, ...filters() });
            if (run !== loadRun) return;
            last = res.result;
            banner(res);
            fillFilterOptions(last);
            drawCards(last); drawCharts(last); drawYear(last); drawEmergency(last); drawImpact(last); drawFeedback(last);
            $("#admStatus").textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        } catch (e) {
            if (run !== loadRun) return;
            $("#admError").innerHTML = `${esc(e.message || "Could not load the analytics.")} <button type="button" class="btn btn-light btn-sm" id="admRetry">Try again</button>`;
            $("#admError").hidden = false;
            $("#admStatus").textContent = "";
        } finally {
            if (run === loadRun) { $$(".is-loading").forEach(c => c.classList.remove("is-loading")); }
        }
    }
    function banner(res) {
        const b = $("#admBanner");
        if (res.source === "demo") {
            b.className = "adm-banner demo"; b.hidden = false;
            b.innerHTML = `<b>DEMO SAMPLE DATA. These numbers are not real.</b> They are generated for presentations and testing, with no names or contacts. Switch to <b>Real records</b> for the website's own data.${API.demoNote ? " " + esc(API.demoNote) : ""}`;
        } else if (res.realEmpty) {
            b.className = "adm-banner empty"; b.hidden = false;
            b.innerHTML = `<b>No real records yet.</b> Real numbers appear here as donors register, requests are posted and you confirm matches and donations below. <button type="button" class="btn btn-light btn-sm" data-source-switch="demo">View the demo dashboard</button>${API.realNote ? `<br><small>${esc(API.realNote)}</small>` : ""}`;
        } else {
            b.hidden = !API.realNote; b.className = "adm-banner"; b.innerHTML = API.realNote ? esc(API.realNote) : "";
        }
    }
    function fillFilterOptions(r) {
        const form = $("#admFilters");
        const city = form.elements.city, year = form.elements.year, keepC = city.value, keepY = year.value;
        city.innerHTML = '<option value="">All cities</option>' + r.cityOptions.map(k => `<option value="${esc(k)}">${esc(k.replace("|", ", "))}</option>`).join("");
        city.value = r.cityOptions.includes(keepC) ? keepC : "";
        const years = [...new Set([...r.years, new Date().getFullYear()])].sort((a, b) => b - a);
        year.innerHTML = '<option value="">All years</option>' + years.map(y => `<option>${y}</option>`).join("");
        year.value = years.map(String).includes(keepY) ? keepY : "";
    }
    function countUp(el, to) {
        to = Number(to) || 0;
        if (reduceMotion() || to < 5) { el.textContent = fmt(to); return; }
        const t0 = performance.now(), from = 0;
        const step = t => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }
    function drawCards(r) {
        CARDS.forEach(([key]) => {
            const card = $(`[data-card="${key}"]`), c = r.cards[key];
            countUp($("[data-num]", card), c.value);
            const tr = $("[data-trend]", card);
            if (c.trend) {
                const up = c.trend.change > 0, same = c.trend.change === 0;
                tr.className = "adm-card-trend " + (same ? "same" : up ? "up" : "down");
                tr.innerHTML = `<span aria-hidden="true">${same ? "＝" : up ? "▲" : "▼"}</span> ${same ? "same as" : (up ? "+" : "") + fmt(c.trend.change) + " vs"} ${esc(c.trend.label)} <small>(this month ${fmt(c.trend.thisMonth)}, last month ${fmt(c.trend.lastMonth)})</small>`;
            } else {
                tr.className = "adm-card-trend none";
                tr.textContent = key === "pendingRequests" || key === "activeDonors" ? "Current status" : "No monthly history yet";
            }
        });
    }

    // ---------- Chart.js helpers ----------
    function setChart(id, config, hasData, summary) {
        const box = $(`[data-chart="${id}"]`), canvas = $("canvas", box), empty = $(".adm-chart-empty", box);
        empty.hidden = hasData; canvas.style.visibility = hasData ? "visible" : "hidden";
        canvas.setAttribute("aria-label", summary || "");
        if (!window.Chart) { empty.hidden = false; empty.textContent = "Charts could not load (no internet?). The numbers above are still correct."; return; }
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart(canvas, config);
    }
    const sum = a => a.reduce((x, y) => x + y, 0);
    const listText = (labels, values) => labels.map((l, i) => `${l}: ${values[i]}`).join(", ");
    function baseOptions(extra) {
        return Object.assign({
            responsive: true, maintainAspectRatio: false, animation: reduceMotion() ? false : { duration: 700 },
            plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { family: "Plus Jakarta Sans", weight: "600" } } },
                tooltip: { backgroundColor: "#5e0a1b", padding: 10, cornerRadius: 10, titleFont: { family: "Plus Jakarta Sans" }, bodyFont: { family: "Plus Jakarta Sans" } } }
        }, extra || {});
    }
    const axes = (stacked, extra) => Object.assign({
        x: { stacked: !!stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { family: "Plus Jakarta Sans" } } },
        y: { stacked: !!stacked, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(143,11,33,.07)" } }
    }, extra || {});
    function doughnut(id, labels, values, colors, title, cutout) {
        const total = sum(values);
        setChart(id, {
            type: "doughnut",
            data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: "#fff", borderWidth: 3, hoverOffset: 10 }] },
            options: baseOptions({ cutout: cutout || "62%", plugins: { ...baseOptions().plugins, tooltip: { ...baseOptions().plugins.tooltip, callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${total ? Math.round(c.raw / total * 100) : 0}%)` } } } })
        }, total > 0, `${title}. ${listText(labels, values)}.`);
    }

    function drawCharts(r) {
        const im = r.impact;
        doughnut("impact", ["People helped (confirmed)", "Fulfilled, awaiting confirmation", "Still pending", "Could not be fulfilled"],
            [im.helped, im.fulfilledUnconfirmed, im.pending, im.unfulfilled], [C.green, C.greenSoft, C.coral, C.dark], "Outcome of blood requests");
        const gl = Object.keys(r.groups), gv = gl.map(g => r.groups[g]);
        setChart("groups", { type: "pie", data: { labels: gl, datasets: [{ data: gv, backgroundColor: gl.map(g => GROUP_COLORS[g] || C.grey), borderColor: "#fff", borderWidth: 2 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8, font: { family: "Plus Jakarta Sans", weight: "700" } } } } }) },
            sum(gv) > 0, `Blood groups requested. ${listText(gl, gv)}.`);
        const da = r.donorActivity;
        setChart("donors", { type: "bar", data: { labels: ["Registered", "Available now", "Donated (verified)"], datasets: [{ label: "Donors", data: [da.registered, da.available, da.donated], backgroundColor: [C.red, C.greenL, C.coral], borderRadius: 12, maxBarThickness: 54 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: axes() }) },
            da.registered > 0, `Donor activity. Registered ${da.registered}, available now ${da.available}, donated ${da.donated}.`);
        const m = r.monthly;
        setChart("monthlyDonations", { type: "bar", data: { labels: m.labels, datasets: [{ label: "Verified donations", data: m.donations, backgroundColor: C.red, hoverBackgroundColor: C.dark, borderRadius: 8, maxBarThickness: 34 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: axes() }) }, sum(m.donations) > 0, `Monthly verified donations. ${listText(m.labels, m.donations)}.`);
        setChart("helpedLine", { type: "line", data: { labels: m.labels, datasets: [{ label: "People helped (confirmed)", data: m.helped, borderColor: C.green, backgroundColor: "rgba(24,122,78,.12)", fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: "#fff", pointBorderWidth: 2 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: axes() }) }, sum(m.helped) > 0, `People helped per month. ${listText(m.labels, m.helped)}.`);
        setChart("reqVsFul", { type: "bar", data: { labels: m.labels, datasets: [
                { label: "Blood requests", data: m.requests, backgroundColor: C.coral, borderRadius: 6, maxBarThickness: 22 },
                { label: "Fulfilled", data: m.fulfilled, backgroundColor: C.green, borderRadius: 6, maxBarThickness: 22 }] },
            options: baseOptions({ scales: axes() }) }, sum(m.requests) > 0, `Requests vs fulfilled per month. Requests: ${listText(m.labels, m.requests)}. Fulfilled: ${m.fulfilled.join(", ")}.`);
        setChart("campActivity", { type: "bar", data: { labels: m.labels, datasets: [
                { type: "bar", label: "Camps held", data: m.campsHeld, backgroundColor: C.pink, borderColor: C.red, borderWidth: 1.5, borderRadius: 6, yAxisID: "y", maxBarThickness: 26 },
                { type: "line", label: "Donations at camps", data: m.campDonations, borderColor: C.red, backgroundColor: C.red, tension: .3, pointRadius: 3, yAxisID: "y1" }] },
            options: baseOptions({ scales: axes(false, { y1: { position: "right", beginAtZero: true, ticks: { precision: 0 }, grid: { drawOnChartArea: false } } }) }) },
            sum(m.campsHeld) + sum(m.campDonations) > 0, `Camp activity per month. Camps held: ${listText(m.labels, m.campsHeld)}. Donations at camps: ${m.campDonations.join(", ")}.`);
        const u = r.emergency.byUrgency, ul = ["Critical", "Urgent", "Normal"];
        setChart("urgency", { type: "bar", data: { labels: ul, datasets: [
                { label: "Pending", data: ul.map(k => u[k].pending), backgroundColor: C.coral, borderRadius: 4 },
                { label: "Fulfilled", data: ul.map(k => u[k].fulfilled), backgroundColor: C.green, borderRadius: 4 },
                { label: "Not fulfilled", data: ul.map(k => u[k].unfulfilled), backgroundColor: C.dark, borderRadius: 4 }] },
            options: baseOptions({ indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } }) },
            r.emergency.total > 0, `Requests by urgency. ${ul.map(k => `${k}: ${u[k].pending} pending, ${u[k].fulfilled} fulfilled, ${u[k].unfulfilled} not fulfilled`).join("; ")}.`);
        doughnut("success", ["Fulfilled", "Not fulfilled"], [r.emergency.fulfilled, r.emergency.unfulfilled], [C.green, C.dark], "Emergency success rate", "70%");
        const g = r.growth;
        setChart("growth", { type: "line", data: { labels: g.labels, datasets: [{ label: "People helped (total so far)", data: g.cumulative, borderColor: C.red, backgroundColor: "rgba(200,16,46,.1)", fill: true, tension: .3, pointRadius: 0, borderWidth: 3 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: axes() }) },
            g.cumulative.length > 0, g.cumulative.length ? `Cumulative people helped, reaching ${g.cumulative[g.cumulative.length - 1]} in ${g.labels[g.labels.length - 1]}.` : "No confirmed help yet.");
    }

    function drawYear(r) {
        const pick = $("#admYearPick"), keep = pick.value;
        const years = r.yearly.map(y => y.year).sort((a, b) => b - a);
        pick.innerHTML = years.length ? years.map(y => `<option>${y}</option>`).join("") : "<option value=''>No data yet</option>";
        if (years.map(String).includes(keep)) pick.value = keep;
        const y = r.yearly.find(x => String(x.year) === pick.value);
        $("#admYearNums").innerHTML = y ? [["❤️", "Verified donations", y.donations], ["🤝", "Successful matches", y.matches], ["🌱", "People helped", y.helped], ["🆘", "Requests", y.requests], ["🏥", "Camps held", y.campsHeld], ["📍", "New cities", y.newCities]]
            .map(([e, l, v]) => `<div><span aria-hidden="true">${e}</span><b>${fmt(v)}</b><small>${l}</small></div>`).join("") : '<p class="adm-empty">No yearly data for these filters yet.</p>';
    }
    function drawEmergency(r) {
        const e = r.emergency;
        const items = [["🆘", "Total emergency requests", fmt(e.total)], ["🤝", "Successfully matched", fmt(e.matched)], ["✅", "Fulfilled", fmt(e.fulfilled)],
            ["❌", "Not fulfilled", fmt(e.unfulfilled)], ["⏳", "Pending", fmt(e.pending)],
            ["⏱️", "Average response time", e.avgResponseHours === null ? "Not enough timestamps" : (e.avgResponseHours < 1 ? Math.max(1, Math.round(e.avgResponseHours * 60)) + " min" : e.avgResponseHours < 48 ? e.avgResponseHours.toFixed(1) + " h" : (e.avgResponseHours / 24).toFixed(1) + " days"), e.responseSample ? `from ${e.responseSample} request${e.responseSample === 1 ? "" : "s"} with a fulfil/match time` : ""],
            ["📈", "Success rate", pct(e.successRate), "fulfilled ÷ (fulfilled + not fulfilled)"]];
        $("#admEmergency").innerHTML = items.map(([em, l, v, n]) => `<div class="adm-mini-card"><span aria-hidden="true">${em}</span><b>${esc(v)}</b><small>${l}${n ? `<br><i>${esc(n)}</i>` : ""}</small></div>`).join("");
    }
    function drawImpact(r) {
        const t = r.impactTotals;
        $("#admImpact").innerHTML = [["heartHand", "People helped", t.peopleHelped, "confirmed by an admin"], ["route", "Donor-recipient matches", t.matches, "confirmed matches"],
            ["drop", "Completed donations", t.donations, "verified"], ["tent", "Blood camps conducted", t.campsConducted, "approved, already held"],
            ["pin", "Cities covered", t.cities, "with donors, requests or camps"], ["shield", "Requests fulfilled", t.requestsFulfilled, "reported fulfilled"]]
            .map(([i, l, v, n]) => `<div class="adm-impact-tile">${ico(i)}<b>${fmt(v)}</b><span>${l}</span><small>${n}</small></div>`).join("");
        const tl = r.yearly.slice().reverse();
        $("#admTimeline").innerHTML = tl.length ? tl.map(y => `<li><span class="adm-tl-year">${y.year}</span><div>
            <b>${fmt(y.helped)} people helped</b> · ${fmt(y.donations)} verified donations · ${fmt(y.matches)} confirmed matches
            <small>${fmt(y.campsHeld)} camps held · ${fmt(y.newDonors)} new donors${y.newCities ? ` · ${fmt(y.newCities)} new cit${y.newCities === 1 ? "y" : "ies"} reached` : ""}</small></div></li>`).join("")
            : '<li class="adm-empty">The timeline fills in as confirmed help and verified donations are recorded.</li>';
    }

    // ---------- feedback form results ----------
    const FB_LABELS = {
        usedFor: { "find-donor": "Finding a donor", "request-blood": "Requesting blood", "register-donor": "Registering as donor", "find-camp-bank": "Camp / blood bank" },
        helped: { yes: "Yes, got help", partial: "Partially", "not-yet": "Not yet" },
        ease: { "very-easy": "Very easy", easy: "Easy", average: "Average", difficult: "Difficult" },
        recommend: { definitely: "Definitely", maybe: "Maybe", no: "No" }
    };
    function drawFeedback(r) {
        const f = r.feedback || { total: 0, counts: { usedFor: {}, helped: {}, ease: {}, recommend: {} } };
        const t = f.trend;
        $("#admFeedback").innerHTML = [
            ["💌", "Total responses", fmt(f.total), t ? `${t.change >= 0 ? "+" : ""}${t.change} vs ${t.label}` : ""],
            ["✅", "Website helped", pct(f.helpedYes), f.helpedAny === null ? "" : `${pct(f.helpedAny)} fully or partly`],
            ["😍", "Easy to use", pct(f.easy), "very easy or easy"],
            ["💚", "Would recommend", pct(f.recommend), "answered \"Definitely\""]
        ].map(([em, l, v, n]) => `<div class="adm-mini-card"><span aria-hidden="true">${em}</span><b>${esc(v)}</b><small>${l}${n ? `<br><i>${esc(n)}</i>` : ""}</small></div>`).join("");
        const part = key => { const keys = Object.keys(FB_LABELS[key]); return [keys.map(k => FB_LABELS[key][k]), keys.map(k => f.counts[key][k] || 0)]; };
        let [l, v] = part("helped"); doughnut("fbHelped", l, v, [C.green, C.coral, C.dark], "Did our website help");
        [l, v] = part("recommend"); doughnut("fbRecommend", l, v, [C.green, C.coralSoft, C.dark], "Would recommend");
        [l, v] = part("ease");
        setChart("fbEase", { type: "bar", data: { labels: l, datasets: [{ label: "Answers", data: v, backgroundColor: [C.green, C.greenL, C.coral, C.dark], borderRadius: 10, maxBarThickness: 48 }] },
            options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: axes() }) }, f.total > 0, `Ease of use. ${listText(l, v)}.`);
        [l, v] = part("usedFor");
        setChart("fbUsed", { type: "bar", data: { labels: l, datasets: [{ label: "Answers", data: v, backgroundColor: [C.red, C.coral, C.green, C.dark], borderRadius: 10, maxBarThickness: 30 }] },
            options: baseOptions({ indexAxis: "y", plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } }) }, f.total > 0, `Used the website for. ${listText(l, v)}.`);
        const box = $("#admSuggestions");
        if (source === "demo") { box.innerHTML = '<p class="adm-empty">Written suggestions are never generated for demo data. Switch to Real records to read what visitors wrote.</p>'; return; }
        if (!API.feedbackList) { box.innerHTML = '<p class="adm-empty">Not available here.</p>'; return; }
        API.feedbackList().then(d => {
            box.innerHTML = d.suggestions.length ? `<ul class="adm-sugg-list">${d.suggestions.map(x => `<li><p>“${esc(x.text)}”</p><small>${dateIN(x.createdAt)} · ${esc(FB_LABELS.usedFor[x.usedFor] || "")} · helped: ${esc(FB_LABELS.helped[x.helped] || "")}</small></li>`).join("")}</ul>`
                : '<p class="adm-empty">No written suggestions yet.</p>';
        }).catch(e => { box.innerHTML = errorBox(e); });
    }

    // ---------------------------------------------------------------
    // Management tabs
    // ---------------------------------------------------------------
    const pill = (text, cls) => `<span class="pill ${cls || ""}">${esc(text)}</span>`;
    const maskPhone = p => { const s = String(p || ""); return s.length >= 6 ? s.slice(0, 2) + "•••••" + s.slice(-3) : s; };
    const dateIN = v => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–");
    const cityOpts = () => (last ? last.cityOptions : []).map(k => `<option value="${esc(k)}">${esc(k.replace("|", ", "))}</option>`).join("");
    const groupOpts = () => GROUPS.map(g => `<option>${g}</option>`).join("");
    const loadingRow = '<div class="adm-loading"><span class="adm-spin"></span> Loading…</div>';
    const errorBox = e => `<div class="adm-error">${esc(e.message || "Could not load.")}</div>`;

    async function paneDonors() {
        const pane = $("#pane-donors");
        if (!pane.dataset.ready) {
            pane.dataset.ready = 1;
            pane.innerHTML = `<form class="adm-tbar" data-form="donors"><input type="search" name="q" placeholder="Search name, phone, city…" aria-label="Search donors">
                <select name="city" aria-label="City"><option value="">All cities</option>${cityOpts()}</select><select name="bloodGroup" aria-label="Blood group"><option value="">All groups</option>${groupOpts()}</select>
                <select name="verified" aria-label="Verification"><option value="">Verified + not verified</option><option value="yes">Verified</option><option value="no">Not verified</option></select></form><div data-list></div>`;
            $("form", pane).addEventListener("input", debounce(paneDonors, 250));
        }
        const list = $("[data-list]", pane); list.innerHTML = loadingRow;
        try {
            const d = await API.donors(Object.fromEntries(new FormData($("form", pane))));
            list.innerHTML = d.donors.length ? `<p class="adm-count">${fmt(d.count)} donor${d.count === 1 ? "" : "s"}${d.count > d.donors.length ? ` (showing ${d.donors.length})` : ""}</p>
            <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Donor</th><th>Group</th><th>City</th><th>Phone</th><th>Status</th><th>Donations</th><th>Registered</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${d.donors.map(x => `<tr><td data-l="Donor"><b>${esc(x.name)}</b>${x.isDemo ? " " + pill("DEMO", "pill-demo") : ""}</td><td data-l="Group"><span class="adm-group">${esc(x.bloodGroup)}</span></td>
                <td data-l="City">${esc(x.city)}, ${esc(x.state)}</td><td data-l="Phone"><button type="button" class="adm-reveal" data-phone="${esc(x.phone)}" aria-label="Show phone number">${esc(maskPhone(x.phone))}</button></td>
                <td data-l="Status">${x.verified ? pill("Verified ✓", "pill-green") : pill("Not verified", "pill-gray")} ${pill(x.availability, x.availability === "Available" ? "pill-green" : "pill-gray")}</td>
                <td data-l="Donations">${fmt(x.donations)}</td><td data-l="Registered">${dateIN(x.createdAt)}</td>
                <td>${x.isDemo ? "" : `<button type="button" class="btn btn-sm ${x.verified ? "btn-light" : "btn-primary"}" data-verify-donor="${esc(x.id)}" data-v="${x.verified ? "0" : "1"}">${x.verified ? "Remove verification" : "Verify"}</button>`}</td></tr>`).join("")}
            </tbody></table></div>` : '<p class="adm-empty">No donors match these filters.</p>';
        } catch (e) { list.innerHTML = errorBox(e); }
    }

    const REQ_STATUS = { Open: ["Pending", "pill-amber"], Fulfilled: ["Fulfilled", "pill-green"], Unfulfilled: ["Not fulfilled", "pill-gray"] };
    async function paneRequests() {
        const pane = $("#pane-requests");
        if (!pane.dataset.ready) {
            pane.dataset.ready = 1;
            pane.innerHTML = `<form class="adm-tbar" data-form="requests"><select name="status" aria-label="Status"><option value="">All statuses</option><option value="Open">Pending</option><option value="Fulfilled">Fulfilled</option><option value="Helped">Help confirmed</option><option value="Unfulfilled">Not fulfilled</option></select>
                <select name="urgency" aria-label="Urgency"><option value="">All urgency</option><option>Critical</option><option>Urgent</option><option>Normal</option></select>
                <select name="city" aria-label="City"><option value="">All cities</option>${cityOpts()}</select><select name="bloodGroup" aria-label="Blood group"><option value="">All groups</option>${groupOpts()}</select></form>
                <p class="adm-hint">Confirm help only after you have checked with the requester or hospital that the patient received blood.</p><div data-list></div>`;
            $("form", pane).addEventListener("input", debounce(paneRequests, 250));
        }
        const list = $("[data-list]", pane); list.innerHTML = loadingRow;
        try {
            const d = await API.requests(Object.fromEntries(new FormData($("form", pane))));
            cache.requests = d.requests;
            list.innerHTML = d.requests.length ? `<p class="adm-count">${fmt(d.count)} request${d.count === 1 ? "" : "s"}</p><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Request</th><th>Group</th><th>Urgency</th><th>City</th><th>Posted</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${d.requests.map(r => { const [st, cls] = REQ_STATUS[r.status] || [r.status, "pill-gray"]; return `<tr><td data-l="Request"><b>${esc(r.hospital)}</b>${r.isDemo ? " " + pill("DEMO", "pill-demo") : ""}<small>${esc(r.units)} unit${r.units == 1 ? "" : "s"} · ref ${esc(r.reference || "#" + r.id)}</small></td>
                <td data-l="Group"><span class="adm-group">${esc(r.bloodGroup)}</span></td><td data-l="Urgency">${pill(r.urgency, r.urgency === "Critical" ? "pill-red" : r.urgency === "Urgent" ? "pill-amber" : "pill-gray")}</td>
                <td data-l="City">${esc(r.city)}</td><td data-l="Posted">${dateIN(r.createdAt)}</td>
                <td data-l="Status">${pill(st, cls)}${r.fulfilmentConfirmed ? " " + pill("Help confirmed", "pill-green") : ""}${r.matches ? ` <small>${r.matches} match${r.matches === 1 ? "" : "es"}</small>` : ""}</td>
                <td>${r.isDemo ? "" : `<div class="adm-acts">${!r.fulfilmentConfirmed ? `<button type="button" class="btn btn-primary btn-sm" data-req="${esc(r.id)}" data-act="confirm-help">Confirm help received</button>` : ""}${r.status !== "Unfulfilled" ? `<button type="button" class="btn btn-light btn-sm" data-req="${esc(r.id)}" data-act="mark-unfulfilled">Close: not fulfilled</button>` : ""}${r.status !== "Open" ? `<button type="button" class="text-btn" data-req="${esc(r.id)}" data-act="reopen">Reopen</button>` : ""}</div>`}</td></tr>`; }).join("")}
            </tbody></table></div>` : '<p class="adm-empty">No requests match these filters.</p>';
        } catch (e) { list.innerHTML = errorBox(e); }
    }

    async function paneMatches() {
        const pane = $("#pane-matches");
        pane.innerHTML = loadingRow;
        try {
            const [reqs, donors, matches, donations, camps] = await Promise.all([API.requests({}), API.donors({}), API.matches(), API.donations({}), API.camps().catch(() => ({ camps: [] }))]);
            const realReqs = reqs.requests.filter(r => !r.isDemo && r.status !== "Unfulfilled"), realDonors = donors.donors.filter(d => !d.isDemo);
            const states = LOCS().map(s => s.name);
            const heldCamps = (camps.camps || []).filter(c => c.reviewStatus === "approved" && !c.isDemo);
            pane.innerHTML = `
            <div class="adm-grid g2">
              <form class="adm-box adm-form" data-form="match">
                <h3>${ico("route")} Record a confirmed match</h3>
                <p class="adm-hint">Use this when you have confirmed that this donor gave blood for this request. A match does not prove a transfusion took place.</p>
                <label>Blood request<select name="requestId" required><option value="">Choose a request</option>${realReqs.map(r => `<option value="${esc(r.id)}" data-group="${esc(r.bloodGroup)}">${esc(r.bloodGroup)} · ${esc(r.hospital)}, ${esc(r.city)} (${dateIN(r.createdAt)})</option>`).join("")}</select></label>
                <label>Donor<select name="donorId" required><option value="">Choose a request first</option></select></label>
                <label>Note (optional)<input name="note" maxlength="200" placeholder="e.g. Confirmed by blood bank on phone"></label>
                <button class="btn btn-primary btn-sm" type="submit">Save confirmed match</button>
                ${realReqs.length && realDonors.length ? "" : '<p class="adm-empty">Needs at least one real request and one real donor.</p>'}
              </form>
              <form class="adm-box adm-form" data-form="donation">
                <h3>${ico("drop")} Record a donation</h3>
                <p class="adm-hint">Only verified donations are counted in the analytics.</p>
                <div class="adm-form-row"><label>Blood group<select name="bloodGroup" required><option value="">Choose</option>${groupOpts()}</select></label><label>Date<input type="date" name="date" required max="${new Date().toISOString().slice(0, 10)}"></label></div>
                <div class="adm-form-row"><label>State<select name="state" required><option value="">Choose</option>${states.map(s => `<option>${esc(s)}</option>`).join("")}</select></label><label>City<select name="city" required><option value="">Choose a state first</option></select></label></div>
                <div class="adm-form-row"><label>Where<select name="source" required><option value="camp">Blood camp</option><option value="blood-bank">Blood bank</option><option value="request">For an emergency request</option></select></label><label>Units<input type="number" name="units" min="1" max="4" value="1"></label></div>
                <label>Camp (optional)<select name="campId"><option value="">–</option>${heldCamps.map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.date)})</option>`).join("")}</select></label>
                <label>Donor (optional)<select name="donorId"><option value="">Not linked to a registered donor</option>${realDonors.map(d => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.bloodGroup)} · ${esc(d.city)}</option>`).join("")}</select></label>
                <label class="adm-check"><input type="checkbox" name="verified"> I checked this donation against the blood bank or camp record</label>
                <button class="btn btn-primary btn-sm" type="submit">Save donation</button>
              </form>
            </div>
            <div class="adm-box"><h3>Confirmed matches (${fmt(matches.count)})</h3>${matches.matches.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Date</th><th>Donor</th><th>Request</th><th>Group</th><th>Status</th><th></th></tr></thead><tbody>
                ${matches.matches.map(m => `<tr><td data-l="Date">${dateIN(m.confirmedAt || m.createdAt)}</td><td data-l="Donor">${esc(m.donorName || "–")}</td><td data-l="Request">${esc(m.hospital || "#" + m.requestId)}</td><td data-l="Group"><span class="adm-group">${esc(m.bloodGroup)}</span></td><td data-l="Status">${m.status === "confirmed" ? pill("Confirmed", "pill-green") : pill("Removed", "pill-gray")}</td><td>${m.status === "confirmed" ? `<button type="button" class="text-btn" data-reject-match="${esc(m.id)}">Remove</button>` : ""}</td></tr>`).join("")}
                </tbody></table></div>` : '<p class="adm-empty">No matches recorded yet.</p>'}</div>
            <div class="adm-box"><h3>Donations (${fmt(donations.count)})</h3>${donations.donations.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Date</th><th>Group</th><th>City</th><th>Where</th><th>Donor</th><th>Status</th><th></th></tr></thead><tbody>
                ${donations.donations.map(n => `<tr><td data-l="Date">${dateIN(n.date)}</td><td data-l="Group"><span class="adm-group">${esc(n.bloodGroup)}</span></td><td data-l="City">${esc(n.city)}</td><td data-l="Where">${esc({ camp: "Blood camp", "blood-bank": "Blood bank", request: "Emergency request" }[n.source] || n.source)}</td><td data-l="Donor">${esc(n.donorName || "–")}</td>
                <td data-l="Status">${n.verified ? pill("Verified ✓", "pill-green") : pill("Not verified", "pill-amber")}</td><td><button type="button" class="btn btn-sm ${n.verified ? "btn-light" : "btn-primary"}" data-verify-donation="${esc(n.id)}" data-v="${n.verified ? "0" : "1"}">${n.verified ? "Unverify" : "Verify"}</button></td></tr>`).join("")}
                </tbody></table></div>` : '<p class="adm-empty">No donations recorded yet.</p>'}</div>`;
            const mf = $('[data-form="match"]', pane);
            mf.elements.requestId.addEventListener("change", () => {
                const g = mf.elements.requestId.selectedOptions[0]?.dataset.group;
                const ok = g ? CAN_RECEIVE[g] : [];
                const list = realDonors.filter(d => ok.includes(d.bloodGroup));
                mf.elements.donorId.innerHTML = g ? (list.length ? '<option value="">Choose a compatible donor</option>' + list.map(d => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.bloodGroup)} · ${esc(d.city)}</option>`).join("") : '<option value="">No compatible registered donor</option>') : '<option value="">Choose a request first</option>';
            });
            const df = $('[data-form="donation"]', pane);
            df.elements.state.addEventListener("change", () => {
                const st = LOCS().find(s => s.name === df.elements.state.value);
                df.elements.city.innerHTML = st ? '<option value="">Choose</option>' + st.cities.map(c => `<option>${esc(c[0])}</option>`).join("") : '<option value="">Choose a state first</option>';
            });
        } catch (e) { pane.innerHTML = errorBox(e); }
    }
    const CAN_RECEIVE = { "A+": ["A+", "A-", "O+", "O-"], "A-": ["A-", "O-"], "B+": ["B+", "B-", "O+", "O-"], "B-": ["B-", "O-"], "AB+": GROUPS, "AB-": ["A-", "B-", "AB-", "O-"], "O+": ["O+", "O-"], "O-": ["O-"] };

    async function paneCamps() {
        const pane = $("#pane-camps"); pane.innerHTML = loadingRow;
        try {
            const d = await API.camps();
            setBadge("camps", d.pending);
            const pending = d.camps.filter(c => c.reviewStatus === "pending"), others = d.camps.filter(c => c.reviewStatus !== "pending");
            pane.innerHTML = `${API.campNote ? `<p class="adm-hint">${esc(API.campNote)}</p>` : ""}
            <h3 class="adm-sub-h">Waiting for review (${pending.length})</h3>
            ${pending.length ? pending.map(c => `<article class="adm-box adm-camp" data-camp="${esc(c.id)}">
                <div><b>${esc(c.name)}</b> ${pill("Waiting for review", "pill-amber")}<p>${esc(c.organiser || "")}${c.organiserType ? ` (${esc(c.organiserType)})` : ""} · ${esc(c.date)} ${esc(c.startTime || "")}–${esc(c.endTime || "")}<br>${esc(c.venue || "")}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode || "")}<br>Contact: ${esc(c.contactName || "–")} ${esc(c.contactPhone || "")} ${esc(c.contactEmail || "")}</p></div>
                <div class="adm-form-row"><label>Latitude<input class="c-lat" inputmode="decimal" value="${c.latitude ?? ""}"></label><label>Longitude<input class="c-lng" inputmode="decimal" value="${c.longitude ?? ""}"></label></div>
                <label class="adm-check"><input type="checkbox" class="c-contact"> I checked the contact details (show them publicly)</label>
                <div class="adm-acts"><button type="button" class="btn btn-primary btn-sm" data-camp-act="approve">Approve</button><button type="button" class="btn btn-light btn-sm" data-camp-act="reject">Reject</button></div>
            </article>`).join("") : '<p class="adm-empty">No camps are waiting for review.</p>'}
            <h3 class="adm-sub-h">Reviewed camps (${others.length})</h3>
            ${others.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Camp</th><th>Date</th><th>City</th><th>Review</th><th>Status</th></tr></thead><tbody>${others.map(c => `<tr><td data-l="Camp">${esc(c.name)}</td><td data-l="Date">${esc(c.date)}</td><td data-l="City">${esc(c.city)}</td><td data-l="Review">${pill(c.reviewStatus === "approved" ? "Approved" : "Rejected", c.reviewStatus === "approved" ? "pill-green" : "pill-gray")}</td><td data-l="Status">${esc(c.cancelled ? "cancelled" : c.status || "")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="adm-empty">No reviewed camps yet. Sample (demo) camps are not listed.</p>'}`;
        } catch (e) { pane.innerHTML = errorBox(e); }
    }
    function setBadge(tab, n) { const b = $(`[data-badge="${tab}"]`); if (!b) return; b.hidden = !n; b.textContent = n || ""; }
    const PANES = { donors: paneDonors, requests: paneRequests, matches: paneMatches, camps: paneCamps };
    function openTab(id) {
        $$(".adm-tabs [role=tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
        $$(".adm-pane").forEach(p => { p.hidden = p.id !== "pane-" + id; });
        PANES[id]();
    }
    function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------
    let wired = false;
    function wire() {
        if (wired) return; wired = true;
        $("#admFilters").addEventListener("input", debounce(load, 250));
        $("#admFilters").addEventListener("change", debounce(load, 250));
        $("#admFilters").addEventListener("reset", () => setTimeout(load, 0));
        $("#admYearPick").addEventListener("change", () => last && drawYear(last));
        const exp = async () => { try { const r = await API.exportCSV({ source, ...filters() }); toast((r && r.message) || "CSV report downloaded.", "ok"); } catch (e) { toast(e.message || "The report could not be saved.", "err"); } };
        $("#admExport").addEventListener("click", exp); $("#admExport2").addEventListener("click", exp);
        $("#admLogout").addEventListener("click", () => API.logout());
        document.addEventListener("click", async e => {
            const t = e.target;
            const sw = t.closest("[data-source], [data-source-switch]");
            if (sw && sw.closest("#adminApp")) {
                source = sw.dataset.source || sw.dataset.sourceSwitch;
                $$(".adm-switch [data-source]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.source === source)));
                load(); return;
            }
            if (t.closest("#admRetry")) { load(); return; }
            const tab = t.closest(".adm-tabs [data-tab]"); if (tab) { openTab(tab.dataset.tab); return; }
            const rev = t.closest(".adm-reveal"); if (rev) { rev.textContent = rev.textContent.includes("•") ? rev.dataset.phone : maskPhone(rev.dataset.phone); return; }
            const act = async (fn, after) => { t.disabled = true; try { const r = await fn(); toast((r && r.message) || "Saved.", "ok"); after(); load(); } catch (er) { toast(er.message, "err"); t.disabled = false; } };
            if (t.dataset.verifyDonor) return act(() => API.verifyDonor(t.dataset.verifyDonor, t.dataset.v === "1"), paneDonors);
            if (t.dataset.req) return act(() => API.requestAction(t.dataset.req, t.dataset.act), paneRequests);
            if (t.dataset.rejectMatch) return act(() => API.rejectMatch(t.dataset.rejectMatch), paneMatches);
            if (t.dataset.verifyDonation) return act(() => API.verifyDonation(t.dataset.verifyDonation, t.dataset.v === "1"), paneMatches);
            if (t.dataset.campAct) {
                const box = t.closest("[data-camp]");
                return act(() => API.reviewCamp(box.dataset.camp, { action: t.dataset.campAct, latitude: $(".c-lat", box).value.trim(), longitude: $(".c-lng", box).value.trim(), contactVerified: $(".c-contact", box).checked }), paneCamps);
            }
        });
        document.addEventListener("submit", async e => {
            const form = e.target.closest("#adminApp [data-form=match], #adminApp [data-form=donation]");
            if (!form) return;
            e.preventDefault();
            const btn = $("button[type=submit]", form); btn.disabled = true;
            try {
                const b = Object.fromEntries(new FormData(form));
                const r = form.dataset.form === "match" ? await API.createMatch(b) : await API.createDonation({ ...b, verified: form.elements.verified.checked });
                toast(r.message || "Saved.", "ok"); paneMatches(); load();
            } catch (er) { toast(er.message, "err"); btn.disabled = false; }
        });
        // highlight the section in view
        const links = $$(".adm-nav a");
        if ("IntersectionObserver" in window) {
            const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) links.forEach(a => a.classList.toggle("active", "adm-" + a.dataset.sec === en.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
            NAV.forEach(([id]) => { const s = document.getElementById("adm-" + id); if (s) io.observe(s); });
        }
    }

    // ---------------------------------------------------------------
    // Start
    // ---------------------------------------------------------------
    async function start(root, adapter) {
        if (adapter) API = adapter;
        root.innerHTML = '<div class="adm-gate"><span class="adm-spin"></span> Checking admin access…</div>';
        let me;
        try { me = await API.me(); } catch (e) { me = null; }
        if (!me) {
            root.innerHTML = `<div class="adm-gate locked"><div class="adm-gate-ico">${ico("shield")}</div><h1>Admin area</h1><p>${esc(API.lockedText || "Please log in with an admin account.")}</p>${API.mode === "server" ? '<a class="btn btn-primary" href="admin-login.html">Admin login</a>' : ""}</div>`;
            return;
        }
        skeleton(root);
        $("#admWho").textContent = me.name || "Admin";
        if (window.Chart) { Chart.defaults.font.family = "Plus Jakarta Sans, system-ui, sans-serif"; Chart.defaults.color = "#6b5d61"; }
        if (API.defaultSource) {
            source = API.defaultSource;
            $$(".adm-switch [data-source]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.source === source)));
        }
        wire();
        await load();
        paneDonors();
        API.camps().then(d => setBadge("camps", d.pending)).catch(() => { });
    }
    window.LifeDropAdmin = { start };
    if (document.getElementById("adminApp") && !window.LifeDropAdminAPI && document.body.dataset.adminAuto !== "off") {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start(document.getElementById("adminApp")));
        else start(document.getElementById("adminApp"));
    }
})();
