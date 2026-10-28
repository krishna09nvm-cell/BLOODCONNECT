// ==========================================================
// EMERGENCY.JS - create and view emergency blood requests
// API used:
//   GET    /api/requests?status=Open&bloodGroup=O-
//   POST   /api/requests
//   PATCH  /api/requests/:id/fulfill
//   DELETE /api/requests/:id
// ==========================================================

const requestForm = document.getElementById("requestForm");
const requestList = document.getElementById("requestList");
const listBloodGroup = document.getElementById("listBloodGroup");

let currentStatus = "Open"; // which tab is selected

// State + City dropdowns for the hospital location (see location-picker.js)
const reqPicker = setupLocationPicker({
    stateId: "reqState", cityId: "reqCity", searchId: "reqCitySearch"
});

// Fill both blood group dropdowns
BLOOD_GROUPS.forEach(group => {
    const option = `<option value="${group}">${group}</option>`;
    document.getElementById("reqBloodGroup").innerHTML += option;
    listBloodGroup.innerHTML += option;
});


// ---------- Helper: "5 min ago", "3 h ago", "2 days ago" ----------
function timeAgo(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}


// ---------- Build one request card ----------
function requestCardHTML(r) {
    const urgencyClass = r.status !== "Open" ? "fulfilled" : r.urgency.toLowerCase();
    const urgencyPill = {
        Critical: "pill-red",
        Urgent: "pill-amber",
        Normal: "pill-gray"
    }[r.urgency] || "pill-gray";

    // Link to the Find Donor page, pre-filled with this blood group, state and city
    // compatible=true: also show donors whose blood the patient can receive
    const findParams = new URLSearchParams({ bloodGroup: r.bloodGroup, compatible: "true", city: r.city });
    if (r.state) findParams.set("state", r.state);
    if (r.district) findParams.set("district", r.district);
    const findLink = `find-donor.html?${findParams}`;

    // Demo requests: label + "not callable" number (see common.js)
    const openActions = r.status === "Open" ? `
        ${contactButton(r, r.contactPhone)}
        <a class="btn btn-light btn-sm" href="${findLink}">Find matching donors</a>
        <button class="btn-danger-text" data-fulfill="${r.id}">Mark fulfilled</button>
    ` : r.status === "Unfulfilled" ? `<span class="pill pill-gray">Closed: not fulfilled</span>` : `<span class="pill pill-green">Fulfilled ✓</span>`;

    return `
        <article class="request-card ${urgencyClass} ${r.isDemo ? "is-demo" : ""}">
            <div class="request-top">
                <div>
                    <span class="pill ${urgencyPill}">
                        ${r.urgency === "Critical" && r.status === "Open" ? '<span class="critical-dot"></span>' : ""}${escapeHtml(r.urgency)}
                    </span>
                    ${r.isDemo ? demoBadge(r) : ""}
                    <h3 style="margin-top:8px;">${escapeHtml(r.patientName)}</h3>
                    <small style="color:var(--muted);">${timeAgo(r.createdAt)}</small>
                </div>
                <div class="request-blood">${escapeHtml(r.bloodGroup)}</div>
            </div>

            <div class="request-info">
                <span>Hospital: <b>${escapeHtml(r.hospital)}</b></span>
                <span>City: <b>${escapeHtml(placeText(r))}</b></span>
                <span>Units: <b>${r.units}</b></span>
                <span>Contact: <b>${escapeHtml(formatPhone(r.contactPhone))}${r.isDemo ? " (demo)" : ""}</b></span>
            </div>

            ${r.notes ? `<p class="donor-note">${escapeHtml(r.notes)}</p>` : ""}

            <div class="donor-actions">
                ${openActions}
                <button class="btn-danger-text" data-remove="${r.id}">Delete</button>
            </div>
        </article>`;
}


// ---------- Load requests from the backend ----------
async function loadRequests() {
    const params = new URLSearchParams();
    if (currentStatus) params.set("status", currentStatus);
    if (listBloodGroup.value) params.set("bloodGroup", listBloodGroup.value);

    try {
        const response = await fetch(`${API_URL}/requests?${params}`);
        const data = await response.json();

        requestList.innerHTML = data.requests.length
            ? data.requests.map(requestCardHTML).join("")
            : '<div class="empty-state"><strong>No requests here</strong>Nothing matches this filter right now.</div>';
    } catch (error) {
        requestList.innerHTML = '<div class="empty-state"><strong>Cannot reach the server</strong>Start the backend with: node server.js</div>';
    }
}


// ---------- Tabs & filter ----------
document.getElementById("statusTabs").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;

    document.querySelectorAll("#statusTabs button").forEach(b => b.classList.remove("active"));
    button.classList.add("active");

    currentStatus = button.dataset.status;
    loadRequests();
});

listBloodGroup.addEventListener("change", loadRequests);


// ---------- Mark fulfilled / delete ----------
requestList.addEventListener("click", async event => {
    const fulfillBtn = event.target.closest("[data-fulfill]");
    const removeBtn = event.target.closest("[data-remove]");

    try {
        if (fulfillBtn) {
            const response = await fetch(`${API_URL}/requests/${fulfillBtn.dataset.fulfill}/fulfill`, { method: "PATCH" });
            const data = await response.json();
            showToast(data.message, response.ok ? "success" : "error");
            loadRequests();
            // The request is finished: now (not before) offer the short feedback form
            if (response.ok && window.LifeDropFeedback) setTimeout(() => LifeDropFeedback.nudge("after-fulfilled", "Glad the blood was arranged!"), 1800);
        }

        if (removeBtn) {
            if (!confirm("Delete this request?")) return;
            const response = await fetch(`${API_URL}/requests/${removeBtn.dataset.remove}`, { method: "DELETE" });
            const data = await response.json();
            showToast(data.message, response.ok ? "success" : "error");
            loadRequests();
        }
    } catch (error) {
        showToast("Cannot reach the server.", "error");
    }
});


// ---------- Create a new request ----------
requestForm.addEventListener("submit", async event => {
    event.preventDefault();

    const request = {
        patientName: document.getElementById("patientName").value.trim(),
        bloodGroup: document.getElementById("reqBloodGroup").value,
        units: Number(document.getElementById("units").value),
        hospital: document.getElementById("hospital").value.trim(),
        state: reqPicker.getState(),
        city: reqPicker.getCity(),
        district: reqPicker.getDistrict(),
        contactPhone: document.getElementById("contactPhone").value.trim(),
        urgency: document.querySelector('input[name="urgency"]:checked').value,
        notes: document.getElementById("notes").value.trim()
    };

    // Frontend validation
    if (!request.patientName || !request.bloodGroup || !request.hospital) {
        showToast("Please fill in all required fields.", "error");
        return;
    }
    if (!request.state || !request.city) {
        showToast("Please select the hospital's state and city.", "error");
        return;
    }
    if (!/^[0-9]{10}$/.test(request.contactPhone)) {
        showToast("Contact phone must be 10 digits.", "error");
        return;
    }
    if (request.units < 1 || request.units > 10) {
        showToast("Units must be between 1 and 10.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...idempotencyHeaders(requestForm) },
            credentials: "same-origin",     // if logged in, the server e-mails a confirmation
            body: JSON.stringify(request)
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        submissionDone(requestForm);
        showToast(resultMessage({ ...data, message: "Emergency request posted!" }), "success");
        requestForm.reset();
        reqPicker.reset();

        // Switch to the "Open" tab so the new request is visible
        document.querySelector('#statusTabs button[data-status="Open"]').click();
    } catch (error) {
        showToast(error.message || "Cannot reach the server.", "error");
    }
});

loadRequests();
