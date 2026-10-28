// ==========================================================
// ENV.JS - reads settings from backend/.env (if the file exists)
// ----------------------------------------------------------
// Secrets such as RESEND_API_KEY live ONLY on the server, in
// backend/.env (copy .env.example). This file is never sent to
// the browser and must never be uploaded to GitHub (.gitignore).
// Values already set in the terminal win over the .env file.
// ==========================================================

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf-8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (!match || line.trim().startsWith("#")) continue;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
}
