// ==========================================================
// REGISTER.JS - "Become a Donor" form
// Works in two modes:
//   register.html        -> CREATE a new donor  (POST)
//   register.html?id=3   -> UPDATE donor #3     (PUT)
// Saves name, age, blood group, phone, availability, other info,
// state, city, district, latitude and longitude.
// ==========================================================

const donorForm = document.getElementById("donorForm");
const latInput = document.getElementById("latitude");
const lngInput = document.getElementById("longitude");
const submitBtn = document.getElementById("submitBtn");

// Fill blood group dropdown
const bloodGroupSelect = document.getElementById("bloodGroup");
BLOOD_GROUPS.forEach(group => {
    bloodGroupSelect.innerHTML += `<option value="${group}">${group}</option>`;
});

// State + City dropdowns (see location-picker.js)
const locationPicker = setupLocationPicker({
    stateId: "state",
    cityId: "city",
    searchId: "citySearch",
    countId: "cityCount"
});

// Are we editing? (register.html?id=5)
const editId = new URLSearchParams(window.location.search).get("id");

// PRIVACY: in edit mode the server only sends the APPROXIMATE location.
// We tell the server to change the saved location only if the donor
// actually moves the pin (clicks the map, drags, uses GPS...).
let locationChanged = !editId;


// ==========================================================
// MINI MAP: click or drag the pin to choose a location
// ==========================================================
const regMap = L.map("regMap").setView([20.5937, 78.9629], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(regMap);

const pinIcon = L.divIcon({
    className: "",
    html: '<div class="donor-pin"><span>You</span></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 43]
});

let pin = null;

// Put the pin at a position and update the lat/lng boxes
function setPin(lat, lng, zoom = 13) {
    latInput.value = lat.toFixed(6);
    lngInput.value = lng.toFixed(6);

    if (pin) {
        pin.setLatLng([lat, lng]);
    } else {
        pin = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(regMap);

        // When the user drags the pin, save the new position
        pin.on("dragend", () => {
            locationChanged = true;
            const pos = pin.getLatLng();
            latInput.value = pos.lat.toFixed(6);
            lngInput.value = pos.lng.toFixed(6);
        });
    }
    regMap.setView([lat, lng], zoom);
}

// Clicking anywhere on the map moves the pin there
regMap.on("click", event => {
    locationChanged = true;
    setPin(event.latlng.lat, event.latlng.lng, regMap.getZoom());
});


// ==========================================================
// LOCATION BUTTONS
// ==========================================================

// Look up the selected city on the map (OpenStreetMap)
async function locateSelectedCity() {
    const state = locationPicker.getState();
    const city = locationPicker.getCity();
    if (!state || !city) return null;
    return geocodeCity(city, locationPicker.getDistrict(), state);
}

// "Show my city on the map"
document.getElementById("locateCityBtn").addEventListener("click", async () => {
    if (!locationPicker.getState() || !locationPicker.getCity()) {
        showToast("Select your state and city first.", "error");
        return;
    }

    const place = await locateSelectedCity();
    if (!place) {
        showToast("Couldn't find this city on the map. Click your location on the map instead.", "error");
        return;
    }
    locationChanged = true;
    setPin(place.lat, place.lng, place.approximate ? 10 : 13);
    showToast(place.approximate
        ? "Pin placed at the district centre. Drag it to your area."
        : "City found! Drag the pin to your exact area.", "success");
});

// "Use my current location": browser Geolocation API
const myLocationBtn = document.getElementById("myLocationBtn");

myLocationBtn.addEventListener("click", async () => {
    const original = myLocationBtn.innerHTML;
    myLocationBtn.disabled = true;
    myLocationBtn.innerHTML = '<span class="spinner"></span> Locating...';

    try {
        const { lat, lng } = await getCurrentPosition();
        locationChanged = true;
        setPin(lat, lng, 15);

        // Pre-select state and city if they are empty (best effort)
        if (!locationPicker.getCity()) {
            const place = await reverseGeocode(lat, lng);
            if (place.state && findState(place.state)) {
                locationPicker.setValue(place.state, place.city);
            }
        }
        showToast(locationPicker.getCity()
            ? "Location set. Please check the state and city."
            : "Location set. Please select your state and city.", "success");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        myLocationBtn.disabled = false;
        myLocationBtn.innerHTML = original;
    }
});


// ==========================================================
// EDIT MODE: load the existing donor into the form
// ==========================================================
async function loadDonorForEdit(id) {
    document.getElementById("pageTitle").textContent = "Update Donor Details";
    document.getElementById("pageSubtitle").textContent = "Change any details below and click Update.";
    submitBtn.textContent = "Update Donor";
    document.getElementById("cancelBtn").textContent = "Cancel";

    try {
        const response = await fetch(`${API_URL}/donors/${id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        const d = data.donor;
        document.getElementById("name").value = d.name;
        document.getElementById("age").value = d.age;
        bloodGroupSelect.value = d.bloodGroup;
        document.getElementById("phone").value = d.phone;
        document.getElementById("availability").value = d.availability;
        document.getElementById("otherInfo").value = d.otherInfo || "";
        locationPicker.setValue(d.state, d.city, d.district);

        // Approximate position only (about 1 km) - see backend/utils/privacy.js
        if (typeof d.approxLatitude === "number") {
            setPin(d.approxLatitude, d.approxLongitude, 13);
            showToast("For privacy your saved location is shown approximately. Move the pin only if you want to change it.");
        }
    } catch (error) {
        showToast(error.message || "Could not load donor", "error");
    }
}

if (editId) loadDonorForEdit(editId);


// ==========================================================
// FORM SUBMIT: validate, then POST (create) or PUT (update)
// ==========================================================
donorForm.addEventListener("submit", async event => {
    event.preventDefault();

    const donor = {
        name: document.getElementById("name").value.trim(),
        age: Number(document.getElementById("age").value),
        bloodGroup: bloodGroupSelect.value,
        phone: document.getElementById("phone").value.trim(),
        availability: document.getElementById("availability").value,
        otherInfo: document.getElementById("otherInfo").value.trim(),
        state: locationPicker.getState(),
        city: locationPicker.getCity(),
        district: locationPicker.getDistrict(),
        latitude: latInput.value,
        longitude: lngInput.value,
        locationChanged: locationChanged
    };

    // ----- Frontend validation (the backend checks again) -----
    if (!donor.name || !donor.bloodGroup) {
        showToast("Please fill in all required fields.", "error");
        return;
    }
    if (!donor.state) {
        showToast("Please select your State/Union Territory.", "error");
        return;
    }
    if (!donor.city) {
        showToast("Please select your city.", "error");
        return;
    }
    if (!donor.age || donor.age < 18 || donor.age > 65) {
        showToast("Age must be between 18 and 65.", "error");
        return;
    }
    if (!/^[0-9]{10}$/.test(donor.phone)) {
        showToast("Please enter a valid 10-digit phone number.", "error");
        return;
    }

    // No pin yet? Place it on the selected city automatically.
    if (!donor.latitude || !donor.longitude) {
        const place = await locateSelectedCity();
        if (!place) {
            showToast("Please set your location on the map.", "error");
            return;
        }
        locationChanged = true;
        donor.locationChanged = true;
        setPin(place.lat, place.lng, 12);
        donor.latitude = latInput.value;
        donor.longitude = lngInput.value;
    }

    donor.latitude = Number(donor.latitude);
    donor.longitude = Number(donor.longitude);

    // ----- Send to backend -----
    const url = editId ? `${API_URL}/donors/${editId}` : `${API_URL}/donors`;
    const method = editId ? "PUT" : "POST";

    submitBtn.disabled = true;

    try {
        const response = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json", ...idempotencyHeaders(donorForm) },
            credentials: "same-origin",     // if logged in, the server e-mails a confirmation
            body: JSON.stringify(donor)
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        submissionDone(donorForm);
        showToast(resultMessage(data), "success");
        // New donor: offer the short feedback form on the next page (never during an emergency request)
        if (!editId && window.LifeDropFeedback) LifeDropFeedback.later("after-registration", "Thank you for registering as a blood donor!");

        // Go to the donor directory after a short pause
        setTimeout(() => {
            window.location.href = "find-donor.html#all-donors";
        }, data.emailNote || data.reference ? 3500 : 1200);
    } catch (error) {
        showToast(error.message || "Cannot reach the server.", "error");
        submitBtn.disabled = false;
    }
});
