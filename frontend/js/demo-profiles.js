// ==========================================================
// DEMO-PROFILES.JS - fictional EDUCATIONAL profiles
// ----------------------------------------------------------
// Shows the 15 profiles from GET /api/education-profiles:
//   universal red-cell donors (O-), universal red-cell
//   recipients (AB+) and rare blood groups (Bombay, Rh-null).
//
// These are NOT donors. They live in their own file
// (backend/data/education-profiles.json), so they never appear
// in the nearby search, the donor list or the homepage numbers.
// ==========================================================

const profileForm = document.getElementById("profileFilterForm");
const profileSearch = document.getElementById("profileSearch");
const profileCategory = document.getElementById("profileCategory");
const profileCards = document.getElementById("profileCards");
const profileCount = document.getElementById("profileCount");

// Colour of the category pill
const CATEGORY_PILL = {
    "universal-donor": "pill-blue",
    "universal-recipient": "pill-amber",
    "rare": "pill-purple"
};

// "O-" -> "O−" (proper minus sign) for display only
function prettyGroup(group) {
    return group.replace("-", "−").replace("−null", "-null");
}

function profileCardHTML(p) {
    return `
        <article class="donor-card is-demo profile-card">
            <div class="donor-badge profile-badge ${p.category}">${escapeHtml(prettyGroup(p.bloodGroup))}</div>
            <div>
                <h3>${escapeHtml(p.name)}</h3>
                <div class="card-pills">
                    <span class="pill pill-demo">${escapeHtml(p.demoStatus)}</span>
                    <span class="pill ${CATEGORY_PILL[p.category]}">${escapeHtml(p.categoryLabel)}</span>
                </div>
                <p class="donor-meta">
                    ${escapeHtml(p.role)} · ${escapeHtml(placeText(p))}
                    ${p.bloodGroupDetail ? `<br>Blood group: ${escapeHtml(p.bloodGroupDetail)}` : ""}
                </p>
                ${p.requiresLabConfirmation
                    ? '<p class="lab-note">🔬 Educational example: requires laboratory confirmation.</p>'
                    : ""}
                <p class="donor-note">${escapeHtml(p.note)}</p>
                <div class="donor-actions">
                    <span class="demo-phone">📵 ${escapeHtml(formatPhone(p.phone))} · demo number, not callable</span>
                </div>
                <p class="stock-note">${escapeHtml(p.locationNote)}
                    No donation history or medical eligibility is claimed for this fictional profile.</p>
            </div>
        </article>`;
}

async function loadProfiles() {
    const params = new URLSearchParams();
    if (profileCategory.value) params.set("category", profileCategory.value);
    if (profileSearch.value.trim()) params.set("q", profileSearch.value.trim());

    try {
        const response = await fetch(`${API_URL}/education-profiles?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        profileCount.textContent =
            `Showing ${data.count} fictional educational profile${data.count === 1 ? "" : "s"}. ` +
            "DEMO ONLY: these are not real donors or patients.";
        profileCards.innerHTML = data.profiles.length
            ? data.profiles.map(profileCardHTML).join("")
            : '<div class="empty-state"><strong>No profile matches your search</strong>Try a blood group (O-, AB+), a city, a state or "Bombay".</div>';
    } catch (error) {
        profileCards.innerHTML = '<div class="empty-state"><strong>Cannot load the profiles</strong>Is the backend running? (node server.js)</div>';
    }
}

profileForm.addEventListener("submit", event => {
    event.preventDefault();
    loadProfiles();
});
profileCategory.addEventListener("change", loadProfiles);

document.getElementById("profileResetBtn").addEventListener("click", () => {
    profileSearch.value = "";
    profileCategory.value = "";
    loadProfiles();
});

// find-donor.html?category=rare#demo-profiles opens a category directly
const startCategory = new URLSearchParams(window.location.search).get("category");
if (startCategory) profileCategory.value = startCategory;

loadProfiles();
