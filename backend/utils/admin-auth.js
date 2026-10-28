// ==========================================================
// ADMIN AUTHENTICATION (separate from normal user accounts)
// ----------------------------------------------------------
// - Admin accounts live in data/admins.json, NOT in users.json.
//   Nobody can sign up as an admin on the website. The first admin
//   is created on the server with:   npm run create-admin
// - Passwords: scrypt hash + salt (same as user accounts).
// - Session: random token in an HttpOnly, SameSite=Strict cookie
//   ("lifedrop_admin"), valid for 8 hours. Only the SHA-256 of the
//   token is stored in data/admin-sessions.json.
// - 5 wrong passwords -> 15 minute lock for that e-mail address.
// - Every admin change is written to data/admin-audit.json
//   (who, what, when - never personal details).
// ==========================================================

const { readData, writeData } = require("./db");
const { hashPassword, verifyPassword, sha256, randomToken, passwordProblem, EMAIL_RE } = require("./auth");

const ADMINS_FILE = "admins.json";
const SESSIONS_FILE = "admin-sessions.json";
const AUDIT_FILE = "admin-audit.json";
const COOKIE = "lifedrop_admin";
const SESSION_HOURS = 8;

const readAdmins = () => readData(ADMINS_FILE);

function createAdmin({ name, email, password }) {
    const mail = String(email || "").trim().toLowerCase();
    if (!name || !String(name).trim()) throw new Error("Please enter a name.");
    if (!EMAIL_RE.test(mail)) throw new Error("Please enter a valid e-mail address.");
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    if (password.length < 10) throw new Error("Admin passwords must be at least 10 characters.");
    const admins = readAdmins();
    if (admins.some(a => a.email === mail)) throw new Error("An admin with this e-mail already exists.");
    const admin = { id: admins.reduce((m, a) => Math.max(m, a.id), 0) + 1, name: String(name).trim(), email: mail, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    admins.push(admin);
    writeData(ADMINS_FILE, admins);
    return { id: admin.id, name: admin.name, email: admin.email };
}

function readCookie(req) {
    for (const part of (req.headers.cookie || "").split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === COOKIE) return decodeURIComponent(rest.join("="));
    }
    return "";
}

function startSession(req, res, adminId) {
    const token = randomToken(), now = Date.now(), ms = SESSION_HOURS * 36e5;
    const sessions = readData(SESSIONS_FILE).filter(s => s.expiresAt > now);
    sessions.push({ tokenHash: sha256(token), adminId, createdAt: new Date(now).toISOString(), expiresAt: now + ms });
    writeData(SESSIONS_FILE, sessions);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/", maxAge: ms });
}

function sessionAdmin(req) {
    const token = readCookie(req);
    if (!token) return null;
    const s = readData(SESSIONS_FILE).find(x => x.tokenHash === sha256(token) && x.expiresAt > Date.now());
    return s ? readAdmins().find(a => a.id === s.adminId) || null : null;
}

function endSession(req, res) {
    const token = readCookie(req);
    if (token) writeData(SESSIONS_FILE, readData(SESSIONS_FILE).filter(s => s.tokenHash !== sha256(token)));
    res.clearCookie(COOKIE, { path: "/" });
}

// Middleware: admin session required. Changes must come from this website (Origin check).
function requireAdmin(req, res, next) {
    const admin = sessionAdmin(req);
    if (!admin) return res.status(401).json({ message: "Admin login required." });
    if (req.method !== "GET" && req.headers.origin) {
        let host = "";
        try { host = new URL(req.headers.origin).host; } catch (e) { }
        if (host !== req.headers.host) return res.status(403).json({ message: "Request blocked (wrong origin)." });
    }
    req.admin = admin;
    next();
}

// ---------------- login attempt limit ----------------
const fails = new Map();
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
function lockedMinutes(key) {
    const f = fails.get(key);
    return f && f.count >= MAX_FAILS && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
}
function noteFail(key) {
    const f = fails.get(key);
    fails.set(key, { count: f && f.until > Date.now() ? f.count + 1 : 1, until: Date.now() + LOCK_MS });
}

function login(req, res) {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = (req.body || {}).password || "";
    if (!email || !password) return res.status(400).json({ message: "Please enter your admin e-mail and password." });
    const minutes = lockedMinutes(email);
    if (minutes) return res.status(429).json({ message: `Too many wrong attempts. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.` });
    const admin = readAdmins().find(a => a.email === email);
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
        noteFail(email);
        return res.status(401).json({ message: "Incorrect admin e-mail or password." });
    }
    fails.delete(email);
    const admins = readAdmins();
    const me = admins.find(a => a.id === admin.id); me.lastLoginAt = new Date().toISOString(); writeData(ADMINS_FILE, admins);
    startSession(req, res, admin.id);
    audit(admin, "login");
    res.json({ message: `Welcome, ${admin.name}.`, admin: { name: admin.name, email: admin.email } });
}

function audit(admin, action, target) {
    const log = readData(AUDIT_FILE);
    log.push({ at: new Date().toISOString(), adminId: admin.id, action, target: target || "" });
    writeData(AUDIT_FILE, log.slice(-2000));
}

module.exports = { createAdmin, readAdmins, sessionAdmin, requireAdmin, login, endSession, audit, COOKIE };
