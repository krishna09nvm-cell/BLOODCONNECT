// ==========================================================
// CAMPS.JS - blood donation camp helpers
// ----------------------------------------------------------
//  campStatus()     Upcoming / Ongoing / Completed / Cancelled,
//                   worked out from the camp's date and times
//  makeDemoCamps()  clearly labelled DEMO camps for testing,
//                   dated relative to today
// All camp times are Indian Standard Time (UTC+05:30).
// ==========================================================

const IST = "+05:30";
const IST_MS = 5.5 * 60 * 60 * 1000;

// "2026-10-24" + "09:30" -> a real Date (in IST), or null if invalid
function toDate(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return null;
    const d = new Date(`${date}T${time}:00${IST}`);
    return isNaN(d) ? null : d;
}

// Start and end of a camp, or null if the schedule is missing / wrong
function campTimes(camp) {
    const start = toDate(camp.date, camp.startTime);
    const end = toDate(camp.date, camp.endTime);
    if (!start || !end || end <= start) return null;
    return { start, end };
}

/**
 * Status of a camp at time "now":
 *   "cancelled"   organiser/admin cancelled it
 *   "unscheduled" date or time is missing/invalid -> never shown as ongoing
 *   "upcoming"    before the start time
 *   "ongoing"     between start and end time
 *   "completed"   after the end time
 */
function campStatus(camp, now = new Date()) {
    if (camp.cancelled) return "cancelled";
    const times = campTimes(camp);
    if (!times) return "unscheduled";
    if (now < times.start) return "upcoming";
    if (now <= times.end) return "ongoing";
    return "completed";
}

// Today's date and hour in India
function indiaToday(now = new Date()) {
    const ist = new Date(now.getTime() + IST_MS);
    return { date: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() };
}

function addDays(dateText, days) {
    const d = new Date(`${dateText}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const pad = n => String(n).padStart(2, "0");

/**
 * DEMO camps for testing the tracker. They are NOT real events:
 *   - "isDemo": true and the label "DEMO CAMP — NOT A REAL EVENT"
 *   - fictional organiser, test venue at the city centre
 *   - no contact details and no registration link
 * Dates are relative to "now" so every status can be seen.
 */
function makeDemoCamps(now = new Date(), areaPin = () => "") {
    const { date: today, hour } = indiaToday(now);
    const ongoingStart = `${pad(Math.max(0, hour - 1))}:00`;
    const ongoingEnd = hour >= 21 ? "23:59" : `${pad(hour + 3)}:00`;

    // [city, district, state, lat, lng, days from today, start, end, extra]
    const rows = [
        ["Mangaluru", "Dakshina Kannada", "Karnataka", 12.8698, 74.8430, 0, ongoingStart, ongoingEnd],
        ["Mangaluru", "Dakshina Kannada", "Karnataka", 12.8865, 74.8543, 3, "09:00", "14:00"],
        ["Udupi", "Udupi", "Karnataka", 13.3409, 74.7421, 6, "10:00", "16:00"],
        ["Bengaluru (BBMP)", "Bengaluru Urban", "Karnataka", 12.9716, 77.5946, 0, ongoingStart, ongoingEnd],
        ["New Delhi", "New Delhi", "Delhi", 28.6139, 77.2090, 2, "09:30", "15:30"],
        ["Greater Mumbai", "Mumbai", "Maharashtra", 19.0760, 72.8777, 9, "10:00", "17:00"],
        ["Pune", "Pune", "Maharashtra", 18.5204, 73.8567, -3, "09:00", "13:00"],
        ["Chennai", "Chennai", "Tamil Nadu", 13.0827, 80.2707, 14, "08:30", "13:30"],
        ["Kolkata", "Kolkata", "West Bengal", 22.5726, 88.3639, -7, "10:00", "16:00"],
        ["Hyderabad", "Hyderabad", "Telangana", 17.3850, 78.4867, 5, "09:00", "15:00", { cancelled: true }],
        ["Lucknow", "Lucknow", "Uttar Pradesh", 26.8467, 80.9462, 20, "10:00", "15:00"],
        ["Chandigarh", "Chandigarh", "Chandigarh", 30.7333, 76.7794, -1, "09:00", "14:00"]
    ];

    return rows.map(([city, district, state, lat, lng, days, start, end, extra = {}], i) => {
        const pincode = areaPin(lat, lng); // real PIN of the AREA (from a nearby listed blood bank)
        return {
            name: `Sample Blood Donation Camp ${i + 1} (Demo) — ${city.replace(/\s*\(.*\)/, "")}`,
            organiser: "Demo Organiser (fictional)",
            organiserType: "Organisation",
            venue: "Demo venue near the city centre (test location)",
            city, district, state,
            pincode,
            pincodeNote: pincode ? "PIN code of the area (from a nearby listed blood bank)" : "",
            date: addDays(today, days),
            startTime: start,
            endTime: end,
            latitude: lat,
            longitude: lng,
            // Fictional contact: 00000 009xx is not a valid Indian number
            contactName: "Demo contact", contactPhone: "00000009" + pad(i + 1), contactEmail: "",
            contactVerified: false,
            registrationLink: "",
            reviewStatus: "approved",
            cancelled: Boolean(extra.cancelled),
            reviewNote: extra.cancelled ? "Demo of a cancelled camp." : "",
            isDemo: true,
            demoLabel: "SAMPLE DATA — NOT A REAL CAMP",
            submittedAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
    });
}

module.exports = { campStatus, campTimes, makeDemoCamps, indiaToday };
