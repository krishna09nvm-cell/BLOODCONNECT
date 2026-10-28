// ==========================================================
// ROUTES/AUTH.JS - registration, login, logout, profile, reset
// ----------------------------------------------------------
//  POST /api/auth/register          create account (+ logs in)
//  POST /api/auth/login             { login: email or mobile, password, remember }
//  POST /api/auth/logout
//  GET  /api/auth/me                the logged-in user (401 if not)
//  PUT  /api/auth/me                update profile
//  POST /api/auth/change-password   { currentPassword, newPassword }
//  POST /api/auth/forgot            { email } -> reset link (e-mail / terminal)
//  GET  /api/auth/reset/check?token= is the link still valid?
//  POST /api/auth/reset             { token, password, confirmPassword }
//  GET  /api/auth/notifications     my e-mail settings + recent e-mails
//  PUT  /api/auth/notifications     { notifyNearbyCamps, notifyRadiusKm }
// E-mails (utils/notifications.js) are sent only AFTER the change is saved.
// ==========================================================

const express = require("express");
const a = require("../utils/auth");
const notify = require("../utils/notifications");
const { emailEnabled, emailsForUser } = require("../utils/email");
const { idempotent } = require("../utils/idempotency");

// Base address used in reset links (set APP_URL when you put the site online)
const APP_URL = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
const SHOW_RESET_LINK = process.env.SHOW_RESET_LINK === "true"; // demo only, never in production

module.exports = function createAuthRouter({ findLocation }) {
    const router = express.Router();

    // Changes must be sent as JSON: a simple form on another website
    // cannot do that, which (with SameSite cookies) blocks CSRF attacks.
    router.use((req, res, next) => {
        if (req.method !== "GET" && !req.is("application/json")) {
            return res.status(415).json({ message: "Please send JSON." });
        }
        next();
    });

    // ---------------- Register ----------------
    router.post("/register", idempotent, async (req, res) => {
        const b = req.body || {};
        const check = a.validateProfile(b, findLocation);
        if (check.error) return res.status(400).json({ message: check.error });

        const problem = a.passwordProblem(b.password);
        if (problem) return res.status(400).json({ message: problem });
        if (b.password !== b.confirmPassword) return res.status(400).json({ message: "The two passwords do not match." });
        if (b.acceptTerms !== true) return res.status(400).json({ message: "Please accept the Terms and Conditions and the Privacy Policy." });

        const users = a.readUsers();
        if (users.some(u => u.email === check.value.email)) {
            return res.status(409).json({ message: "An account with this email already exists. Please log in instead." });
        }
        if (users.some(u => u.mobile === check.value.mobile)) {
            return res.status(409).json({ message: "An account with this mobile number already exists. Please log in instead." });
        }

        const now = new Date().toISOString();
        const user = {
            id: a.randomToken().slice(0, 16),   // random id, not guessable
            ...check.value,
            passwordHash: a.hashPassword(b.password),
            // OPTIONAL e-mails, off unless the user ticks the box
            notifyNearbyCamps: b.notifyNearbyCamps === true,
            notifyRadiusKm: 25,
            termsAcceptedAt: now,
            createdAt: now,
            updatedAt: now
        };
        users.push(user);
        a.writeUsers(users);

        a.createSession(res, req, user.id, false);
        // Saved -> now the welcome e-mail (a failed e-mail never undoes the registration)
        const email = await notify.welcome(user);
        res.status(201).json({ message: `Welcome, ${user.fullName.split(" ")[0]}! Your account was created.`, user: a.safeUser(user), email, emailNote: notify.emailNote(email) });
    });

    // ---------------- Login ----------------
    router.post("/login", (req, res) => {
        const { login, password, remember } = req.body || {};
        if (!login || !String(login).trim()) return res.status(400).json({ message: "Please enter your email address or mobile number." });
        if (!password) return res.status(400).json({ message: "Please enter your password." });

        const key = String(login).trim().toLowerCase();
        const minutes = a.loginLocked(key);
        if (minutes) {
            return res.status(429).json({ message: `Too many wrong attempts. Please wait ${minutes} minute${minutes > 1 ? "s" : ""} or reset your password.` });
        }

        const user = a.findUserByLogin(a.readUsers(), login);
        // Same message whether the account exists or not (doesn't reveal who is registered)
        if (!user || !a.verifyPassword(password, user.passwordHash)) {
            a.noteFailedLogin(key);
            return res.status(401).json({ message: "Incorrect email/mobile number or password. Please try again." });
        }
        a.clearFailedLogins(key);
        a.createSession(res, req, user.id, remember === true);
        res.json({ message: `Welcome back, ${user.fullName.split(" ")[0]}!`, user: a.safeUser(user) });
    });

    // ---------------- Logout ----------------
    router.post("/logout", (req, res) => {
        a.endSession(req, res);
        res.json({ message: "You have been logged out." });
    });

    // ---------------- Me / profile ----------------
    router.get("/me", a.requireAuth(), (req, res) => res.json({ user: a.safeUser(req.user) }));

    router.put("/me", a.requireAuth(), async (req, res) => {
        const check = a.validateProfile(req.body || {}, findLocation, { requireAll: false });
        if (check.error) return res.status(400).json({ message: check.error });
        if (req.user.role === "donor") {
            const age = a.ageFromDob(check.value.dob);
            if (age > 65) return res.status(400).json({ message: "Blood donors must be between 18 and 65 years old." });
        }
        const users = a.readUsers();
        if (users.some(u => u.id !== req.user.id && u.email === check.value.email)) return res.status(409).json({ message: "Another account already uses this email." });
        if (users.some(u => u.id !== req.user.id && u.mobile === check.value.mobile)) return res.status(409).json({ message: "Another account already uses this mobile number." });

        const user = users.find(u => u.id === req.user.id);
        const oldEmail = user.email, oldMobile = user.mobile;
        Object.assign(user, check.value, { updatedAt: new Date().toISOString() }); // role is not changed here
        a.writeUsers(users);

        // Security notice when the contact details change (to the old AND the new address)
        let email = null;
        if (oldEmail !== user.email || oldMobile !== user.mobile) {
            const notice = { title: "Your contact details were changed", paragraphs: ["The e-mail address or mobile number of your account was changed."],
                details: [["E-mail", notify.maskEmail(user.email)], ["Mobile", "ending in " + user.mobile.slice(-3)]] };
            email = await notify.accountNotice(user, `contact:${user.id}:${user.updatedAt}`, notice);
            if (oldEmail !== user.email) notify.accountNotice(user, `contact-old:${user.id}:${user.updatedAt}`, notice, oldEmail);
        }
        res.json({ message: "Your profile was updated.", user: a.safeUser(user), email, emailNote: email ? notify.emailNote(email).replace("A confirmation", "A security") : "" });
    });

    router.post("/change-password", a.requireAuth(), async (req, res) => {
        const { currentPassword, newPassword, confirmPassword } = req.body || {};
        if (!a.verifyPassword(currentPassword || "", req.user.passwordHash)) return res.status(400).json({ message: "Your current password is not correct." });
        const problem = a.passwordProblem(newPassword);
        if (problem) return res.status(400).json({ message: problem });
        if (newPassword !== confirmPassword) return res.status(400).json({ message: "The two new passwords do not match." });

        const users = a.readUsers();
        const user = users.find(u => u.id === req.user.id);
        user.passwordHash = a.hashPassword(newPassword);
        user.updatedAt = new Date().toISOString();
        a.writeUsers(users);
        a.endAllSessions(user.id);              // log out other devices
        a.createSession(res, req, user.id, false);
        const email = await notify.accountNotice(user, `password:${user.id}:${user.updatedAt}`,
            { title: "Your password was changed", paragraphs: ["The password of your account was just changed. Other devices were logged out."] });
        res.json({ message: "Password changed. Other devices were logged out.", email });
    });

    // ---------------- Forgot / reset password ----------------
    const forgotLog = new Map(); // email -> times (max 3 per hour)

    router.post("/forgot", async (req, res) => {
        const email = String((req.body || {}).email || "").trim().toLowerCase();
        if (!a.EMAIL_RE.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });

        const recent = (forgotLog.get(email) || []).filter(t => t > Date.now() - 3600e3);
        if (recent.length >= 3) return res.status(429).json({ message: "Too many reset requests. Please try again in an hour." });
        forgotLog.set(email, [...recent, Date.now()]);

        // Same answer whether the email is registered or not
        const answer = { message: "If an account exists for this email, a password reset link has been sent. It is valid for 30 minutes." };

        const users = a.readUsers();
        const user = users.find(u => u.email === email);
        if (!user) return res.json(answer);

        const token = a.randomToken();
        user.resetTokenHash = a.sha256(token);
        user.resetExpiresAt = Date.now() + a.RESET_MINUTES * 60e3;
        a.writeUsers(users);

        const link = `${APP_URL}/reset-password.html?token=${token}`;
        await notify.passwordReset(user, link, user.resetTokenHash.slice(0, 16));
        // The link is a secret: print it only when you asked for it (local demos)
        if (SHOW_RESET_LINK) console.log(`[demo] Password reset link for ${notify.maskEmail(user.email)}: ${link}`);

        if (SHOW_RESET_LINK) answer.devResetLink = link; // only for local demos
        res.json(answer);
    });

    function userForToken(token) {
        if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null;
        const users = a.readUsers();
        const user = users.find(u => u.resetTokenHash === a.sha256(token) && u.resetExpiresAt > Date.now());
        return user ? { users, user } : null;
    }

    router.get("/reset/check", (req, res) => {
        if (!userForToken(req.query.token)) return res.status(400).json({ message: "This reset link is invalid or has expired. Please ask for a new one." });
        res.json({ valid: true });
    });

    router.post("/reset", (req, res) => {
        const { token, password, confirmPassword } = req.body || {};
        const found = userForToken(token);
        if (!found) return res.status(400).json({ message: "This reset link is invalid or has expired. Please ask for a new one." });
        const problem = a.passwordProblem(password);
        if (problem) return res.status(400).json({ message: problem });
        if (password !== confirmPassword) return res.status(400).json({ message: "The two passwords do not match." });

        const { users, user } = found;
        user.passwordHash = a.hashPassword(password);
        delete user.resetTokenHash;               // one-time link
        delete user.resetExpiresAt;
        user.updatedAt = new Date().toISOString();
        a.writeUsers(users);
        a.endAllSessions(user.id);
        a.clearFailedLogins(user.email);
        notify.accountNotice(user, `password-reset-done:${user.id}:${user.updatedAt}`,
            { title: "Your password was reset", paragraphs: ["The password of your account was reset with a reset link. All devices were logged out."] });
        res.json({ message: "Your password was changed. Please log in with the new password." });
    });

    // ---------------- E-mail settings ----------------
    router.get("/notifications", a.requireAuth(), (req, res) => {
        res.json({
            emailEnabled: emailEnabled(),
            notifyNearbyCamps: Boolean(req.user.notifyNearbyCamps),
            notifyRadiusKm: req.user.notifyRadiusKm || 25,
            recent: emailsForUser(req.user.id)
        });
    });

    router.put("/notifications", a.requireAuth(), (req, res) => {
        const radius = Number((req.body || {}).notifyRadiusKm || 25);
        if (![10, 25, 50].includes(radius)) return res.status(400).json({ message: "Choose 10, 25 or 50 km." });
        const users = a.readUsers();
        const user = users.find(u => u.id === req.user.id);
        user.notifyNearbyCamps = (req.body || {}).notifyNearbyCamps === true;
        user.notifyRadiusKm = radius;
        a.writeUsers(users);
        res.json({ message: user.notifyNearbyCamps ? `Saved. We'll e-mail you about new camps within ${radius} km.` : "Saved. You won't get optional camp e-mails.", notifyNearbyCamps: user.notifyNearbyCamps, notifyRadiusKm: radius });
    });

    return router;
};
