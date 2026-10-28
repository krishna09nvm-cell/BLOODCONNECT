// ==========================================================
// DEMO-DATA.JS - remove the fictional demo records
// ----------------------------------------------------------
// Demo donors, requests and camps carry "isDemo": true. This removes
// ONLY those records; real records are never touched. Used when the
// server starts with DEMO_DATA=off, or by "npm run remove-demo".
// ==========================================================
const { readData, writeData, dataFileExists } = require("./db");

function removeDemoRecords() {
    const result = {};
    for (const file of ["donors.json", "requests.json", "camps.json"]) {
        // readData() creates donors/requests from the sample files on first run;
        // camps.json is created by the server, so an absent file has nothing to remove
        if (file === "camps.json" && !dataFileExists(file)) { writeData(file, []); result[file] = 0; continue; }
        const list = readData(file);
        const real = list.filter(r => r.isDemo !== true);
        if (real.length !== list.length) writeData(file, real);
        else if (!dataFileExists(file)) writeData(file, real);
        result[file] = list.length - real.length;
    }
    return result;
}

module.exports = { removeDemoRecords };
