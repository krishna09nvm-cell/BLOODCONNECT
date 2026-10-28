// ==========================================================
// AUTH.JS - secure accounts for the website
// ----------------------------------------------------------
//  - Passwords are NEVER saved as text. We save a "scrypt" hash:
//    a slow, salted one-way function built into Node.js (crypto).
//  - After login the browser gets a random session token in an
//    HttpOnly cookie (JavaScript on the page cannot read it).
//    The server stores only the SHA-256 hash of that token.
//  - Password-reset links use a random one-time token that
//    expires after 30 minutes (also stored only as a hash).
//  - Too many wrong passwords -> the account is paused 15 minutes.
// No extra npm packages are needed.
// ==========================================================

const crypto = require("crypto");
const { readData, writeData } = require("./db");

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";

const COOKIE_NAME = "lifedrop_session";
const SESSION_DAYS_REMEMBER = 30;     // "Remember me" ticked
const SESSION_HOURS_DEFAULT = 12;     // not ticked (cookie also ends when the browser closes)
const RESET_MINUTES = 30;
const ROLES = ["donor", "finder", "organizer"];
const ROLE_NAMES = { donor: "Blood Donor", finder: "Blood Finder", organizer: "Camp Organizer" };


// ---------------- Passwords ----------------
// Stored as "scrypt$<salt>$<hash>" (both in hex)
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
    const [method, saltHex, hashHex] = String(stored || "").split("$");
    if (method !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected); // same time for right and wrong passwords
}

const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("hex");


// ---------------- Validation (the browser checks too) ----------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// "+91 98450 12345", "098450 12345" -> "9845012345". Indian mobiles start with 6-9.
function normaliseMobile(value) {
    let digits = String(value || "").replace(/[\s-]/g, "");
    if (digits.startsWith("+91")) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return digits;
}
const isIndianMobile = m => /^[6-9]\d{9}$/.test(m);

function ageFromDob(dob, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || "")) return null;
    const d = new Date(dob + "T00:00:00Z");
    if (isNaN(d)) return null;
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    const m = now.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
    return age;
}

// At least 8 characters with a letter and a number
function passwordProblem(password) {
    if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters.";
    if (password.length > 128) return "Password is too long.";
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain at least one letter and one number.";
    return null;
}

/**
 * Checks profile fields. Returns { error } or { value } with clean data.
 * findLocation(state, city, district) checks the official State/City list.
 */
function validateProfile(b, findLocation, { requireAll = true } = {}) {
    const fullName = String(b.fullName || "").trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(fullName)) return { error: "Please enter your full name (letters only, 2-60 characters)." };

    const age = ageFromDob(b.dob);
    if (age === null) return { error: "Please enter your date of birth." };
    if (age < 18) return { error: "You must be at least 18 years old to create an account." };
    if (age > 100) return { error: "Please check your date of birth." };

    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 120) return { error: "Please enter a valid email address." };

    const mobile = normaliseMobile(b.mobile);
    if (!isIndianMobile(mobile)) return { error: "Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)." };

    const gender = ["", "female", "male", "other", "prefer-not"].includes(b.gender || "") ? (b.gender || "") : "";

    const place = findLocation(b.state, b.city, b.district);
    if (!place) return { error: "Please select your state and city from the lists." };

    const pincode = String(b.pincode || "").trim();
    if (!/^[1-9]\d{5}$/.test(pincode)) return { error: "PIN code must be 6 digits and cannot start with 0." };

    const value = { fullName, dob: b.dob, email, mobile, gender, state: place.state, city: place.city, district: place.district, pincode };

    if (requireAll) {
        if (!ROLES.includes(b.role)) return { error: "Please choose your role: Blood Donor, Blood Finder or Camp Organizer." };
        if (b.role === "donor" && (age < 18 || age > 65)) return { error: "Blood donors must be between 18 and 65 years old." };
        value.role = b.role;
    }
    return { value };
}


// ---------------- Users ----------------
const readUsers = () => readData(USERS_FILE);
const writeUsers = users => writeData(USERS_FILE, users);

// What the logged-in user may see about THEMSELVES (never the password hash)
function safeUser(u) {
    return {
        id: u.id, fullName: u.fullName, dob: u.dob, age: ageFromDob(u.dob), email: u.email, mobile: u.mobile,
        gender: u.gender, state: u.state, city: u.city, district: u.district, pincode: u.pincode,
        role: u.role, roleName: ROLE_NAMES[u.role], createdAt: u.createdAt, updatedAt: u.updatedAt,
        notifyNearbyCamps: Boolean(u.notifyNearbyCamps), notifyRadiusKm: u.notifyRadiusKm || 25
    };
}

// Login with email OR mobile number
function findUserByLogin(users, login) {
    const text = String(login || "").trim().toLowerCase();
    if (text.includes("@")) return users.find(u => u.email === text);
    const mobile = normaliseMobile(text);
    return users.find(u => u.mobile === mobile);
}


// ---------------- Sessions (cookie) ----------------
function readCookie(req, name) {
    const header = req.headers.cookie || "";
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return decodeURIComponent(rest.join("="));
    }
    return "";
}

function createSession(res, req, userId, remember) {
    const token = randomToken();
    const ms = remember ? SESSION_DAYS_REMEMBER * 864e5 : SESSION_HOURS_DEFAULT * 36e5;
    const now = Date.now();
    const sessions = readData(SESSIONS_FILE).filter(s => s.expiresAt > now); // drop old ones
    sessions.push({ tokenHash: sha256(token), userId, createdAt: new Date(now).toISOString(), expiresAt: now + ms });
    writeData(SESSIONS_FILE, sessions);

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,          // not readable by page JavaScript
        sameSite: "lax",         // not sent by other websites' forms (CSRF protection)
        secure: req.secure,      // HTTPS-only when the site runs on HTTPS
        path: "/",
        ...(remember ? { maxAge: ms } : {}) // no maxAge = ends when the browser closes
    });
}

function sessionUser(req) {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return null;
    const session = readData(SESSIONS_FILE).find(s => s.tokenHash === sha256(token) && s.expiresAt > Date.now());
    if (!session) return null;
    return readUsers().find(u => u.id === session.userId) || null;
}

function endSession(req, res) {
    const token = readCookie(req, COOKIE_NAME);
    if (token) writeData(SESSIONS_FILE, readData(SESSIONS_FILE).filter(s => s.tokenHash !== sha256(token)));
    res.clearCookie(COOKIE_NAME, { path: "/" });
}

// Log the user out everywhere (after a password change / reset)
function endAllSessions(userId) {
    writeData(SESSIONS_FILE, readData(SESSIONS_FILE).filter(s => s.userId !== userId));
}

// Middleware: only logged-in users (optionally only some roles)
function requireAuth(...roles) {
    return (req, res, next) => {
        const user = sessionUser(req);
        if (!user) return res.status(401).json({ message: "Please log in to continue." });
        if (roles.length && !roles.includes(user.role)) {
            return res.status(403).json({ message: `This page is for ${roles.map(r => ROLE_NAMES[r]).join(" / ")} accounts.` });
        }
        req.user = user;
        next();
    };
}


// ---------------- Login attempt limit ----------------
const failedLogins = new Map(); // key -> { count, until }
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

function loginLocked(key) {
    const f = failedLogins.get(key);
    return f && f.count >= MAX_FAILS && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
}
function noteFailedLogin(key) {
    const f = failedLogins.get(key);
    const count = f && f.until > Date.now() ? f.count + 1 : 1;
    failedLogins.set(key, { count, until: Date.now() + LOCK_MS });
}
const clearFailedLogins = key => failedLogins.delete(key);


module.exports = {
    COOKIE_NAME, RESET_MINUTES, ROLES, ROLE_NAMES,
    hashPassword, verifyPassword, sha256, randomToken, passwordProblem,
    normaliseMobile, isIndianMobile, ageFromDob, validateProfile, EMAIL_RE,
    readUsers, writeUsers, safeUser, findUserByLogin,
    createSession, sessionUser, endSession, endAllSessions, requireAuth,
    loginLocked, noteFailedLogin, clearFailedLogins
};
