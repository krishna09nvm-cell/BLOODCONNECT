// ==========================================================
// SIMPLE JSON "DATABASE"
// ----------------------------------------------------------
// Instead of MongoDB/MySQL we store data in JSON files inside
// the /data folder. This keeps the project easy to run, and
// data is NOT lost when you restart the server.
// ==========================================================

const fs = require("fs");
const path = require("path");

// Bundled data shipped with the code (blood banks, sample files ...)
const BUNDLED_DIR = path.join(__dirname, "..", "data");
// Where records are SAVED. On a hosting service set DATA_DIR to a
// persistent disk/volume (e.g. /data) so data survives restarts.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : BUNDLED_DIR;
fs.mkdirSync(DATA_DIR, { recursive: true });

// Read a JSON file and return its contents as a JS array
function readData(fileName) {
    const filePath = path.join(DATA_DIR, fileName);

    // First run: if the file does not exist yet, copy the sample
    // data (e.g. sample-donors.json) so the site is not empty.
    if (!fs.existsSync(filePath)) {
        const samplePath = [path.join(DATA_DIR, "sample-" + fileName), path.join(BUNDLED_DIR, "sample-" + fileName)].find(p => fs.existsSync(p));
        if (samplePath) {
            fs.copyFileSync(samplePath, filePath);
        } else {
            return [];
        }
    }

    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text || "[]");
}

// Save a JS array back into the JSON file (pretty printed)
function writeData(fileName, data) {
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Generate the next ID: (biggest existing id) + 1
function getNextId(list) {
    if (list.length === 0) return 1;
    return Math.max(...list.map(item => item.id)) + 1;
}

// true if the data file already exists in the data folder
const dataFileExists = fileName => fs.existsSync(path.join(DATA_DIR, fileName));

module.exports = { readData, writeData, getNextId, dataFileExists, DATA_DIR, BUNDLED_DIR };
