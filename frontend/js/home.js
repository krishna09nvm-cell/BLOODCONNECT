// ==========================================================
// HOME.JS - homepage logic
// 1) fill the quick-search dropdown
// 2) load stats from the backend and animate the numbers
// 3) build the 8 blood group cards
// ==========================================================

// ---------- 1. Quick search ----------
const qsBloodGroup = document.getElementById("qsBloodGroup");

BLOOD_GROUPS.forEach(group => {
    qsBloodGroup.innerHTML += `<option value="${group}">${group}</option>`;
});

// State + City dropdowns (see location-picker.js)
const qsPicker = setupLocationPicker({
    stateId: "qsState",
    cityId: "qsCity",
    searchId: "qsCitySearch"
});

document.getElementById("quickSearch").addEventListener("submit", event => {
    event.preventDefault();

    // URLSearchParams encodes "A+" as "A%2B" automatically
    const params = new URLSearchParams();
    if (qsBloodGroup.value) params.set("bloodGroup", qsBloodGroup.value);
    if (qsPicker.getState()) params.set("state", qsPicker.getState());
    if (qsPicker.getCity()) {
        params.set("city", qsPicker.getCity());
        params.set("district", qsPicker.getDistrict());
    }

    window.location.href = "find-donor.html?" + params.toString();
});


// ---------- 2. Stats with count-up animation ----------
function animateNumber(element, target) {
    const duration = 1200; // ms
    const start = performance.now();

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        element.textContent = Math.floor(progress * target);
        if (progress < 1) requestAnimationFrame(step);
        else element.textContent = target;
    }
    requestAnimationFrame(step);
}

let donorCounts = {};     // REAL donors per blood group, from /api/stats
let demoCounts = {};      // DEMO (fictional) donors per blood group

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();

        document.querySelectorAll("[data-stat]").forEach(el => {
            animateNumber(el, stats[el.dataset.stat] || 0);
        });

        donorCounts = stats.byBloodGroup || {};
        demoCounts = stats.demoByBloodGroup || {};

        // The numbers above count REAL records only. Say so if demo data is loaded.
        const note = document.getElementById("demoNote");
        if (stats.demoDonors) {
            note.textContent = `These numbers count real registrations only. The site also has ${stats.demoDonors} DEMO donor records (fictional, for testing).`;
            note.hidden = false;
        }
    } catch (error) {
        console.error(error);
        showToast("Cannot reach the server. Is node server.js running?", "error");
    }

    renderBloodCards();
}


// ---------- 3. Blood group cards ----------
function renderBloodCards() {
    const grid = document.getElementById("bloodGrid");

    grid.innerHTML = BLOOD_GROUPS.map(group => {
        const count = donorCounts[group] ?? 0;
        const demo = demoCounts[group] ?? 0;
        const info = COMPATIBILITY[group];

        return `
            <a class="blood-card reveal" href="find-donor.html?bloodGroup=${encodeURIComponent(group)}">
                <div class="blood-card-top">
                    <span class="blood-type">${group}</span>
                    <span class="donor-count">${count} donor${count === 1 ? "" : "s"}${demo ? ` · ${demo} demo` : ""}</span>
                </div>
                <p>Gives to: <b>${info.give}</b></p>
                <p>Receives from: <b>${info.receive}</b></p>
                <span class="find-link">Find ${group} donors →</span>
            </a>`;
    }).join("");

    // New cards also need the scroll animation
    grid.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));
}

loadStats();
