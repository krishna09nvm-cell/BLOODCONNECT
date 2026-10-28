// ==========================================================
// Create an ADMIN account for the Admin Analytics Dashboard
// ----------------------------------------------------------
//   cd backend
//   npm run create-admin
// It asks for a name, e-mail and password (the password is not shown
// while you type). The password is stored only as a scrypt hash in
// data/admins.json. Nothing is hard-coded and nothing is printed.
//
// On a host without a keyboard (e.g. Render shell) you can instead run:
//   ADMIN_NAME="..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." npm run create-admin
// then remove those variables again.
// ==========================================================
require("../utils/env");
const readline = require("readline");
const { createAdmin } = require("../utils/admin-auth");

function ask(question, hidden) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) {
            rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); else process.stdout.write("*"); };
        }
        rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
    });
}

(async () => {
    try {
        let { ADMIN_NAME: name, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
        if (!email || !password) {
            console.log("Create an admin account for /admin-login.html\n");
            name = await ask("Admin name: ");
            email = await ask("Admin e-mail: ");
            password = await ask("Password (min 10 chars, letters + numbers): ", true);
            const again = await ask("Repeat password: ", true);
            if (again !== password) throw new Error("The passwords do not match.");
        }
        const admin = createAdmin({ name: name || "Admin", email, password });
        console.log(`\nAdmin account created for ${admin.email}. Log in at /admin-login.html`);
    } catch (e) {
        console.error("\nCould not create the admin: " + e.message);
        process.exitCode = 1;
    }
})();
