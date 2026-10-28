// ==========================================================
// AUTH.JS - shared code for Login, Registration, Password reset,
// Dashboard and Profile pages
// ----------------------------------------------------------
// The server (backend/routes/auth.js) does the real security:
// password hashing, sessions and checks. The browser checks the
// fields too, only to show friendly messages straight away.
// ==========================================================

// ---------- Talk to the auth API ----------
async function authRequest(path, { method = "GET", body, headers = {} } = {}) {
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method,
            credentials: "same-origin",                 // send the login cookie
            headers: body ? { "Content-Type": "application/json", ...headers } : headers,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (error) {
        throw new Error("Cannot reach the server. Is node server.js running?");
    }
    let data = {};
    try { data = await response.json(); } catch (error) { }
    if (!response.ok) {
        const err = new Error(data.message || "Something went wrong. Please try again.");
        err.status = response.status;
        throw err;
    }
    return data;
}

// The logged-in user, or null
async function currentUser() {
    try { return (await authRequest("/auth/me")).user; }
    catch (error) { return null; }
}

// Only allow going back to our own pages after login
function safeNext(value) {
    return /^[a-z-]+\.html$/.test(value || "") ? value : "dashboard.html";
}


// ---------- Field checks (same rules as the server) ----------
const RULES = {
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Please enter a valid email address, e.g. name@example.com.",
    mobile: v => /^[6-9]\d{9}$/.test(cleanMobile(v)) ? "" : "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.",
    pincode: v => /^[1-9]\d{5}$/.test(v.trim()) ? "" : "PIN code must be 6 digits and cannot start with 0.",
    fullName: v => /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(v.trim().replace(/\s+/g, " ")) ? "" : "Please enter your full name (letters only).",
    password: v => v.length < 8 ? "Use at least 8 characters." : (!/[A-Za-z]/.test(v) || !/\d/.test(v)) ? "Use at least one letter and one number." : ""
};

function cleanMobile(value) {
    let d = String(value || "").replace(/[\s-]/g, "");
    if (d.startsWith("+91")) d = d.slice(3);
    else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return d;
}

function ageFrom(dob) {
    if (!dob) return null;
    const d = new Date(dob + "T00:00:00"), now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
}

// Show / clear a message under one field
function setFieldError(input, message) {
    const group = input.closest(".form-group") || input.parentElement;
    let box = group.querySelector(".field-error");
    if (!box) { box = document.createElement("p"); box.className = "field-error"; box.setAttribute("role", "alert"); group.appendChild(box); }
    box.textContent = message || "";
    box.hidden = !message;
    input.classList.toggle("invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
}
function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach(b => { b.hidden = true; b.textContent = ""; });
    form.querySelectorAll(".invalid").forEach(i => { i.classList.remove("invalid"); i.removeAttribute("aria-invalid"); });
}

// Big message at the top of a form
function showFormAlert(box, message, type = "error") {
    box.innerHTML = message;
    box.className = "form-alert " + type;
    box.hidden = !message;
    if (message) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Show / hide password buttons ----------
function setupPasswordToggles(root = document) {
    root.querySelectorAll("[data-toggle-password]").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.togglePassword);
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.textContent = show ? "Hide" : "Show";
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
            btn.setAttribute("aria-pressed", String(show));
        });
    });
}

// ---------- Password strength bar ----------
function setupStrengthMeter(input, bar, label) {
    input.addEventListener("input", () => {
        const v = input.value;
        let score = 0;
        if (v.length >= 8) score++;
        if (v.length >= 12) score++;
        if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
        if (/\d/.test(v)) score++;
        if (/[^A-Za-z0-9]/.test(v)) score++;
        const level = !v ? 0 : score <= 2 ? 1 : score <= 3 ? 2 : 3;
        bar.className = "strength-bar level-" + level;
        label.textContent = ["", "Weak", "Good", "Strong"][level];
    });
}

// ---------- Logout (any page) ----------
async function logout() {
    try { await authRequest("/auth/logout", { method: "POST", body: {} }); } catch (error) { }
    location.href = "login.html?loggedOut=1";
}
