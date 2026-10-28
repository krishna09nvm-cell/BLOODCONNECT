// ==========================================================
// SEND-TEST-EMAIL.JS - checks your e-mail settings
//   npm run email:test -- your-address@example.com
// Uses the same code and settings (backend/.env) as the website.
// "Accepted" means the provider took the e-mail. Then check the
// inbox (and spam folder) to confirm it was really delivered.
// ==========================================================
require("../utils/env");
const { sendEmail, emailConfig, EMAIL_RE } = require("../utils/email");
const T = require("../utils/email-templates");

(async () => {
    const to = process.argv[2];
    if (!to || !EMAIL_RE.test(to)) {
        console.log("Usage: npm run email:test -- your-address@example.com");
        process.exit(1);
    }
    const cfg = emailConfig();
    console.log(`Provider: ${cfg.provider} · configured: ${cfg.ready ? "yes" : "NO"} · from: ${cfg.from || "(EMAIL_FROM not set)"}`);
    const mail = T.welcomeEmail({ id: "test", fullName: "Test User", role: "donor", roleName: "Blood Donor", city: "Mangaluru", state: "Karnataka", createdAt: new Date().toISOString() });
    const result = await sendEmail({ to, subject: "[Test] " + mail.subject, html: mail.html, text: mail.text },
        { type: "test", dedupeKey: `test:${to}:${Date.now()}` });
    const explain = {
        sent: "Accepted by the provider. Now check the inbox (and spam) of " + to + ".",
        failed: "Failed. See the error above and in data/email-log.json (wrong API key? EMAIL_FROM not verified?).",
        not_configured: "Not sent: no provider configured. Copy .env.example to .env and fill it in. A preview was saved in data/outbox/."
    }[result.status] || result.status;
    console.log(`Result: ${result.status} → ${explain}`);
    process.exit(result.status === "sent" ? 0 : 1);
})();
