// ==========================================================
// NOTIFICATIONS.JS - WHEN to send which e-mail
// ----------------------------------------------------------
// ESSENTIAL (always sent, no unsubscribe):
//   welcome after registration, form confirmations, camp review
//   updates, password reset, password / e-mail change notices
// OPTIONAL (only if the user ticked it, with an unsubscribe link):
//   "new blood donation camp near you"
// Every function is called only AFTER the data was saved.
// ==========================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sendEmail, maskEmail } = require("./email");
const T = require("./email-templates");

// Secret used to sign unsubscribe links (EMAIL_LINK_SECRET in .env,
// otherwise a random one is created once and kept in data/.link-secret)
function linkSecret() {
    if (process.env.EMAIL_LINK_SECRET) return process.env.EMAIL_LINK_SECRET;
    const file = path.join(require("./db").DATA_DIR, ".link-secret");
    try { return fs.readFileSync(file, "utf-8").trim(); }
    catch (e) { const s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(file, s); return s; }
}
const unsubscribeToken = userId => crypto.createHmac("sha256", linkSecret()).update("unsubscribe:" + userId).digest("hex").slice(0, 32);
function checkUnsubscribeToken(userId, token) {
    const expected = Buffer.from(unsubscribeToken(String(userId)));
    const given = Buffer.from(String(token || ""));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// Reference numbers like LD-CAMP-261024-7F3A
function makeReference(kind) {
    const ist = new Date(Date.now() + 5.5 * 3600e3).toISOString();
    return `LD-${kind}-${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

// Wait at most a few seconds so the page can say "e-mail sent";
// if the provider is slow the e-mail still goes out in the background.
async function withTimeout(promise, ms = 8000) {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ status: "pending" }), ms); });
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
}

function send(user, mail, meta) {
    return withTimeout(sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text }, { userId: user.id, ...meta }));
}

// ---------------- Essential ----------------
const welcome = user => send(user, T.welcomeEmail({ ...user, roleName: { donor: "Blood Donor", finder: "Blood Finder", organizer: "Camp Organizer" }[user.role] }),
    { type: "welcome", dedupeKey: `welcome:${user.id}` });

/** Form confirmation. key must be unique per submission (e.g. "donor:12") */
const formConfirmation = (user, key, form) => send(user, T.formEmail(user, form), { type: "form", dedupeKey: `form:${key}` });

const accountNotice = (user, key, notice, toAddress) =>
    send(toAddress ? { ...user, email: toAddress } : user, T.accountNoticeEmail(user, notice), { type: "account", dedupeKey: `account:${key}` });

const passwordReset = (user, link, key) => send(user, T.passwordResetEmail(user, link), { type: "password-reset", dedupeKey: `reset:${key}`, secretLink: true });

// ---------------- Optional: camps near me ----------------
/**
 * Tell opted-in users about a newly APPROVED camp near their PIN code.
 * whereIs(user) -> { lat, lng } or null ; distance(a, b) -> km
 */
async function nearbyCamp(camp, users, whereIs, distance) {
    let count = 0;
    for (const user of users) {
        if (!user.notifyNearbyCamps || user.id === camp.ownerId) continue;
        const point = whereIs(user);
        if (!point) continue;
        const km = distance(point.lat, point.lng, camp.latitude, camp.longitude);
        if (km > (user.notifyRadiusKm || 25)) continue;
        const url = `${T.appUrl()}/api/notifications/unsubscribe?u=${encodeURIComponent(user.id)}&t=${unsubscribeToken(user.id)}`;
        const mail = T.nearbyCampEmail(user, camp, km, url);
        // optional e-mails are not awaited one by one by the admin page
        sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text },
            { userId: user.id, type: "nearby-camp", category: "optional", dedupeKey: `nearby:${camp.id}:${user.id}` });
        count++;
    }
    return count;
}

// Short text for the page, e.g. "A confirmation e-mail was sent to kk***@gmail.com."
function emailNote(result) {
    if (!result) return "";
    return {
        sent: `A confirmation e-mail was sent to ${result.to}.`,
        pending: `A confirmation e-mail is on its way to ${result.to}.`,
        failed: "We could not send the confirmation e-mail right now, but your submission was saved.",
        not_configured: "E-mail notifications are not set up on this server yet, so no e-mail was sent.",
        duplicate: "",
        invalid_address: "No e-mail was sent: the address on your account looks invalid."
    }[result.status] || "";
}

module.exports = { welcome, formConfirmation, accountNotice, passwordReset, nearbyCamp, emailNote, makeReference, checkUnsubscribeToken, maskEmail, T };
