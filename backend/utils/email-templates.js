// ==========================================================
// EMAIL-TEMPLATES.JS - the HTML (and plain-text) e-mails
// ----------------------------------------------------------
// Red & white, mobile-friendly. E-mail apps ignore most CSS,
// so the layout uses simple tables and inline styles.
// Every value from users is escaped. No passwords or login
// tokens are ever put in an e-mail.
// ==========================================================

const SITE_NAME = "Blood Donation and Blood Camp Tracker";
const appUrl = () => (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
const supportEmail = () => (process.env.SUPPORT_EMAIL || "").trim();

const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// "2026-10-24T10:30:00Z" -> "24 Oct 2026, 4:00 pm IST"
function formatWhen(iso = new Date().toISOString()) {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
}
function formatCampDate(c) {
    const d = new Date(`${c.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const t = x => { const [h, m] = x.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
    return `${d}, ${t(c.startTime)} – ${t(c.endTime)} IST`;
}
const firstName = name => String(name || "").trim().split(/\s+/)[0] || "there";

/**
 * One e-mail layout for everything.
 *  title, preheader, greeting, paragraphs[], details[[label, value]],
 *  button {text, url}, note, reason (footer: why you got this),
 *  unsubscribeUrl (only for OPTIONAL e-mails)
 */
function layout({ title, preheader = "", greeting, paragraphs = [], details = [], button, note = "", reason, unsubscribeUrl = "" }) {
    const red = "#c8102e", dark = "#8f0b21", soft = "#f9dce3", ink = "#1d1416", muted = "#6b5d61";
    const rows = details.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([label, value]) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid #f3d3da;color:${muted};font-size:14px;width:42%;vertical-align:top;">${esc(label)}</td>
          <td style="padding:9px 0;border-bottom:1px solid #f3d3da;color:${ink};font-size:14px;font-weight:600;vertical-align:top;">${esc(value)}</td>
        </tr>`).join("");
    const support = supportEmail();

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#fff0f3;font-family:Arial,Helvetica,sans-serif;color:${ink};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f3;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #f3d3da;">
    <tr><td style="background:${red};background:linear-gradient(120deg,${red},${dark});padding:22px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;height:40px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;font-size:22px;line-height:40px;">🩸</td>
        <td style="padding-left:12px;color:#ffffff;font-size:17px;font-weight:bold;line-height:1.3;">LifeDrop<br><span style="font-size:12px;font-weight:normal;opacity:.9;">${SITE_NAME}</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 26px 8px;">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${dark};">${esc(title)}</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(greeting)}</p>
      ${paragraphs.map(p => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${ink};">${esc(p)}</p>`).join("")}
      ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;background:${soft};border-radius:12px;padding:6px 16px;"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>` : ""}
      ${note ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${muted};">${esc(note)}</p>` : ""}
      ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr><td style="background:${red};border-radius:999px;">
        <a href="${esc(button.url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none;">${esc(button.text)}</a></td></tr></table>` : ""}
    </td></tr>
    <tr><td style="padding:18px 26px 24px;border-top:1px solid #f3d3da;font-size:12px;line-height:1.6;color:${muted};">
      ${esc(reason)}
      ${support ? `<br>Need help? Contact <a href="mailto:${esc(support)}" style="color:${red};">${esc(support)}</a>.` : ""}
      ${unsubscribeUrl ? `<br><a href="${esc(unsubscribeUrl)}" style="color:${red};">Unsubscribe from nearby camp updates</a> (account e-mails will still be sent).` : ""}
      <br>In an emergency call 108 or 112. · <a href="${esc(appUrl())}" style="color:${red};">${esc(appUrl().replace(/^https?:\/\//, ""))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

    // Plain-text version (for e-mail apps that block HTML)
    const text = [title, "", greeting, "", ...paragraphs, "",
        ...details.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([l, v]) => `${l}: ${v}`),
        note ? `\n${note}` : "", button ? `\n${button.text}: ${button.url}` : "", "", "—", reason,
        support ? `Need help? ${support}` : "", unsubscribeUrl ? `Unsubscribe from nearby camp updates: ${unsubscribeUrl}` : "",
        "LifeDrop - " + SITE_NAME].filter(x => x !== undefined).join("\n");
    return { html, text };
}

// ---------------- The e-mails ----------------

function welcomeEmail(user) {
    const subject = "Welcome to Blood Donation and Blood Camp Tracker!";
    const purpose = {
        donor: "As a Blood Donor you can find blood donation camps near you on the map, check their dates and times, and get directions.",
        finder: "As a Blood Finder you can search blood donation camps, blood banks and hospitals by PIN code, city or locality, and get directions.",
        organizer: "As a Camp Organizer you can add your blood donation camps with their map location. They are published after our team verifies them."
    }[user.role];
    return { subject, ...layout({
        title: "Your registration was successful",
        preheader: "Your LifeDrop account is ready.",
        greeting: `Hello ${firstName(user.fullName)},`,
        paragraphs: [
            `Welcome to ${SITE_NAME}! Your account has been created successfully.`,
            "Our website connects blood donors, people who need blood and blood donation camp organisers, so that help can be found quickly.",
            purpose
        ],
        details: [["Name", user.fullName], ["Role", user.roleName], ["City", `${user.city}, ${user.state}`], ["Registered on", formatWhen(user.createdAt)]],
        button: { text: "Go to my dashboard", url: `${appUrl()}/dashboard.html` },
        note: "If you did not create this account, please ignore this e-mail or contact us.",
        reason: `You received this e-mail because this address was used to create an account on ${SITE_NAME}.`
    }) };
}

/** Confirmation for a submitted form (donor, blood request, camp...) */
function formEmail(user, { formType, title, reference, when, details = [], paragraphs = [], note = "", buttonText = "Visit the website", buttonUrl }) {
    return { subject: `${formType} — ${reference ? reference : "confirmation"}`, ...layout({
        title,
        preheader: `${formType} received${reference ? " · " + reference : ""}`,
        greeting: `Hello ${firstName(user.fullName)},`,
        paragraphs,
        details: [["Form", formType], ["Reference number", reference], ["Date and time", formatWhen(when)], ...details],
        button: { text: buttonText, url: buttonUrl || appUrl() },
        note,
        reason: `You received this e-mail because you submitted this form while logged in to ${SITE_NAME}.`
    }) };
}

function accountNoticeEmail(user, { title, paragraphs, details = [] }) {
    return { subject: `${title} — LifeDrop`, ...layout({
        title, greeting: `Hello ${firstName(user.fullName)},`, paragraphs,
        details: [["Date and time", formatWhen()], ...details],
        button: { text: "Open my profile", url: `${appUrl()}/dashboard.html#profile` },
        note: "If this was not you, reset your password straight away and contact us.",
        reason: `This is a security notice about your ${SITE_NAME} account. It is sent to every account holder.`
    }) };
}

function passwordResetEmail(user, link) {
    return { subject: "Reset your LifeDrop password", ...layout({
        title: "Reset your password",
        greeting: `Hello ${firstName(user.fullName)},`,
        paragraphs: ["We received a request to reset the password of your account. Click the button to choose a new password. The link works once and expires in 30 minutes."],
        button: { text: "Choose a new password", url: link },
        note: "If you did not ask for this, ignore this e-mail. Your password stays the same.",
        reason: `You received this e-mail because a password reset was requested for your ${SITE_NAME} account.`
    }) };
}

function nearbyCampEmail(user, camp, distanceKm, unsubscribeUrl) {
    return { subject: `New blood donation camp near you: ${camp.name}`, ...layout({
        title: "A blood donation camp near you",
        preheader: `${camp.name} · ${camp.city}`,
        greeting: `Hello ${firstName(user.fullName)},`,
        paragraphs: ["A verified blood donation camp has been added near you. If you are eligible, please consider donating."],
        details: [["Camp", camp.name], ["When", formatCampDate(camp)], ["Where", `${camp.venue}, ${camp.city}${camp.pincode ? " - " + camp.pincode : ""}`],
            ["Organiser", camp.organiser], ["Distance", distanceKm < 1 ? "less than 1 km from your PIN code" : `about ${Math.round(distanceKm)} km from your PIN code`]],
        button: { text: "See the camp on the map", url: `${appUrl()}/camps.html` },
        note: "Eligibility is decided by the doctor at the camp.",
        reason: `You received this OPTIONAL update because you chose "e-mail me about blood donation camps near me" in your ${SITE_NAME} profile.`,
        unsubscribeUrl
    }) };
}

module.exports = { welcomeEmail, formEmail, accountNoticeEmail, passwordResetEmail, nearbyCampEmail, formatCampDate, formatWhen, appUrl, SITE_NAME };
