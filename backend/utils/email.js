// ==========================================================
// EMAIL.JS - sends e-mails from the SERVER (never from the browser)
// ----------------------------------------------------------
// Providers (choose one in backend/.env, see .env.example):
//   EMAIL_PROVIDER=resend    RESEND_API_KEY=re_...      (recommended, free tier)
//   EMAIL_PROVIDER=sendgrid  SENDGRID_API_KEY=SG....
//   EMAIL_PROVIDER=smtp      SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (+ npm install nodemailer)
// Not configured -> nothing is sent. The e-mail is saved as a
// preview file in backend/data/outbox/ so you can see the design,
// and it is logged as "not_configured" (never as "sent").
//
// Safety:
//  - one e-mail per event: every e-mail has a "dedupe key" (e.g.
//    welcome:<userId>). The same key is never sent twice.
//  - failures are retried once, then logged as "failed". The form
//    submission itself is never undone because of an e-mail problem.
//  - the log (data/email-log.json) stores only a masked address,
//    the subject and the status. Never the content, passwords,
//    API keys or reset links.
// ==========================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { readData, writeData } = require("./db");

const LOG_FILE = "email-log.json";
const OUTBOX_DIR = path.join(require("./db").DATA_DIR, "outbox");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const inFlight = new Set();        // dedupe keys being sent right now

// ---------------- Settings ----------------
function emailConfig() {
    const e = process.env;
    let provider = (e.EMAIL_PROVIDER || "").toLowerCase();
    if (!provider) provider = e.RESEND_API_KEY ? "resend" : e.SENDGRID_API_KEY ? "sendgrid" : e.SMTP_HOST ? "smtp" : "none";
    const ready = { resend: Boolean(e.RESEND_API_KEY), sendgrid: Boolean(e.SENDGRID_API_KEY), smtp: Boolean(e.SMTP_HOST), none: false }[provider] || false;
    return { provider, ready: ready && Boolean(e.EMAIL_FROM), from: e.EMAIL_FROM || "", replyTo: e.SUPPORT_EMAIL || "" };
}
const emailEnabled = () => emailConfig().ready;

// "kkrishna@gmail.com" -> "kk***@gmail.com"
function maskEmail(email) {
    const [name, domain] = String(email || "").split("@");
    if (!domain) return "(invalid)";
    return `${name.slice(0, 2)}***@${domain}`;
}

// Remove anything that looks like a secret before logging an error
function cleanError(message) {
    return String(message || "Unknown error")
        .replace(/(re_|SG\.)[A-Za-z0-9._-]+/g, "[key]")
        .replace(/token=[a-f0-9]+/gi, "token=[hidden]")
        .replace(/Bearer\s+\S+/gi, "Bearer [hidden]")
        .slice(0, 200);
}

// ---------------- Log ----------------
const readLog = () => readData(LOG_FILE);
function writeLog(list) { writeData(LOG_FILE, list.slice(-1000)); } // keep the last 1000
function updateLog(id, changes) {
    const list = readLog();
    const entry = list.find(x => x.id === id);
    if (entry) Object.assign(entry, changes);
    writeLog(list);
}

// ---------------- Providers ----------------
async function viaResend(msg, cfg, idempotencyKey) {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}) }),
        signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(`Resend ${res.status}: ${data.message || data.name || "error"}`); err.retry = res.status >= 500 || res.status === 429; throw err; }
    return data.id || "";
}

async function viaSendgrid(msg, cfg) {
    const match = cfg.from.match(/^(.*)<(.+)>$/);
    const from = match ? { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() } : { email: cfg.from };
    const res = await fetch(process.env.SENDGRID_API_URL || "https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            personalizations: [{ to: [{ email: msg.to }] }], from, subject: msg.subject,
            ...(cfg.replyTo ? { reply_to: { email: cfg.replyTo } } : {}),
            content: [{ type: "text/plain", value: msg.text }, { type: "text/html", value: msg.html }]
        }),
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(`SendGrid ${res.status}: ${(data.errors && data.errors[0] && data.errors[0].message) || "error"}`);
        err.retry = res.status >= 500 || res.status === 429; throw err;
    }
    return res.headers.get("x-message-id") || "";
}

let smtpTransport = null;
async function viaSmtp(msg, cfg) {
    if (!smtpTransport) {
        let nodemailer;
        try { nodemailer = require("nodemailer"); }
        catch (e) { throw new Error("SMTP needs nodemailer. Run: npm install nodemailer"); }
        smtpTransport = nodemailer.createTransport({
            host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    const info = await smtpTransport.sendMail({ from: cfg.from, to: msg.to, replyTo: cfg.replyTo || undefined, subject: msg.subject, html: msg.html, text: msg.text });
    return info.messageId || "";
}

// Save the design for viewing when no provider is set up (local only)
function savePreview(id, msg, hideLinks) {
    try {
        fs.mkdirSync(OUTBOX_DIR, { recursive: true });
        let html = msg.html;
        if (hideLinks) html = html.replace(/token=[a-f0-9]+/gi, "token=HIDDEN-IN-PREVIEW");
        fs.writeFileSync(path.join(OUTBOX_DIR, `${id}.html`), html);
    } catch (e) { /* preview is optional */ }
}

/**
 * Send one e-mail. Never throws: returns { status, to }
 *   status: "sent" | "failed" | "not_configured" | "duplicate" | "invalid_address"
 *   msg: { to, subject, html, text }
 *   meta: { type, dedupeKey, category: "essential" | "optional", userId, secretLink }
 */
async function sendEmail(msg, meta) {
    const to = String(msg.to || "").trim().toLowerCase();
    const masked = maskEmail(to);
    if (!EMAIL_RE.test(to)) return { status: "invalid_address", to: masked };

    // One e-mail per event
    const dedupeKey = crypto.createHash("sha256").update(meta.dedupeKey).digest("hex").slice(0, 32);
    if (inFlight.has(dedupeKey) || readLog().some(x => x.dedupeKey === dedupeKey && x.status !== "failed")) {
        return { status: "duplicate", to: masked };
    }
    inFlight.add(dedupeKey);

    const cfg = emailConfig();
    const id = `em_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
    const entry = { id, type: meta.type, category: meta.category || "essential", userId: meta.userId || null, to: masked,
        subject: msg.subject, provider: cfg.provider, status: "sending", dedupeKey, createdAt: new Date().toISOString() };
    const log = readLog(); log.push(entry); writeLog(log);

    try {
        if (!cfg.ready) {
            savePreview(id, msg, Boolean(meta.secretLink) && process.env.SHOW_RESET_LINK !== "true");
            updateLog(id, { status: "not_configured" });
            console.log(`[email] NOT sent (no e-mail provider configured): "${msg.subject}" to ${masked}. Preview: data/outbox/${id}.html`);
            return { status: "not_configured", to: masked };
        }
        const send = { resend: viaResend, sendgrid: viaSendgrid, smtp: viaSmtp }[cfg.provider];
        if (!send) throw new Error(`Unknown EMAIL_PROVIDER "${cfg.provider}"`);
        const full = { ...msg, to };
        let providerId;
        try { providerId = await send(full, cfg, id); }
        catch (err) {
            if (!err.retry && err.name !== "TimeoutError" && !/fetch failed|ECONN|ETIMEDOUT/i.test(err.message)) throw err;
            await new Promise(r => setTimeout(r, 1500));      // retry once
            providerId = await send(full, cfg, id);
        }
        updateLog(id, { status: "sent", providerMessageId: providerId, sentAt: new Date().toISOString() });
        console.log(`[email] accepted by ${cfg.provider}: "${msg.subject}" to ${masked}`);
        return { status: "sent", to: masked };
    } catch (err) {
        updateLog(id, { status: "failed", error: cleanError(err.message) });
        console.error(`[email] FAILED "${msg.subject}" to ${masked}: ${cleanError(err.message)}`);
        return { status: "failed", to: masked };
    } finally {
        inFlight.delete(dedupeKey);
    }
}

// Recent e-mails for one user (shown in their profile)
function emailsForUser(userId, limit = 10) {
    return readLog().filter(x => x.userId === userId).slice(-limit).reverse()
        .map(({ type, category, subject, status, createdAt, to }) => ({ type, category, subject, status, createdAt, to }));
}

module.exports = { sendEmail, emailConfig, emailEnabled, maskEmail, emailsForUser, readLog, EMAIL_RE };
