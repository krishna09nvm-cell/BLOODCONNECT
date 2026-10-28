// ==========================================================
// SEED SCRIPT - load the DEMO sample data
// ----------------------------------------------------------
//      npm run seed      (or)      node seed.js
//
// What it does:
//   1. REMOVES only demo records:
//        - records marked  "isDemo": true
//        - the old sample donors/requests from earlier versions
//          of this project (recognised by their sample phone numbers)
//   2. KEEPS every real donor / request that someone registered.
//   3. ADDS the demo records from data/sample-donors.json and
//      data/sample-requests.json (15 fictional donors, 4 requests),
//      and 12 DEMO blood donation camps dated from today.
//
// Every demo record is labelled "DEMO — NOT A REAL DONOR" and uses a
// phone number starting with 00000, which cannot belong to anyone.
// ==========================================================

const { readData, writeData } = require("./utils/db");
const fs = require("fs");
const path = require("path");

// Sample phone numbers used by OLD versions of this project
const OLD_DEMO_DONOR_PHONES = [];
for (let n = 9876543210; n <= 9876543227; n++) OLD_DEMO_DONOR_PHONES.push(String(n));
const OLD_DEMO_REQUEST_PHONES = ["9845012345", "9845012346", "9845012347", "9845012348"];

function isOldOrNewDemo(record, oldPhones, phoneField) {
    return record.isDemo === true || oldPhones.includes(String(record[phoneField]));
}

function readSample(fileName) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "data", fileName), "utf-8"));
}

function reseed(fileName, sampleFile, oldPhones, phoneField) {
    const current = readData(fileName);          // creates the file on first run
    const real = current.filter(r => !isOldOrNewDemo(r, oldPhones, phoneField));
    const removed = current.length - real.length;

    // Demo records get ids AFTER the real ones, so ids never clash
    let nextId = real.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    const demo = readSample(sampleFile).map(r => ({ ...r, id: nextId++ }));

    writeData(fileName, [...real, ...demo]);
    console.log(`${fileName}: removed ${removed} demo record(s), kept ${real.length} real, added ${demo.length} demo.`);
}

reseed("donors.json", "sample-donors.json", OLD_DEMO_DONOR_PHONES, "phone");
reseed("requests.json", "sample-requests.json", OLD_DEMO_REQUEST_PHONES, "contactPhone");

// ---------- Blood donation camps ----------
// Remove old DEMO camps, keep real ones, add fresh DEMO camps dated from today
// (so you can see Upcoming, Ongoing, Completed and Cancelled camps).
const { makeDemoCamps } = require("./utils/camps");
const camps = readData("camps.json");
const realCamps = camps.filter(c => !c.isDemo);
let nextCampId = realCamps.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
const { nearestPin } = require("./utils/places");
const { getDistanceKm } = require("./utils/haversine");
const BANKS = require("./data/blood-banks.json").bloodBanks;
const demoCamps = makeDemoCamps(new Date(), (lat, lng) => nearestPin(lat, lng, BANKS, getDistanceKm)).map(c => ({ id: nextCampId++, ...c }));
writeData("camps.json", [...realCamps, ...demoCamps]);
console.log(`camps.json: removed ${camps.length - realCamps.length} demo camp(s), kept ${realCamps.length} real, added ${demoCamps.length} demo.`);
