// ==========================================================
// LOCATION-PICKER.JS - State + City dropdowns
// ----------------------------------------------------------
// Uses INDIA_LOCATIONS from india-locations.js (official LGD list).
//
// Every form that needs a location has three elements:
//   <select id="...State">   State / Union Territory
//   <input  id="...CitySearch">  "Type to search city" box
//   <select id="...City">    City (disabled until a state is chosen)
//
// Usage:
//   const picker = setupLocationPicker({
//       stateId: "regState", cityId: "regCity",
//       searchId: "regCitySearch", countId: "regCityCount",
//       onChange: () => { ... }      // optional
//   });
//   picker.getState(); picker.getCity(); picker.getDistrict();
//   picker.setValue("Karnataka", "Udupi");
// ==========================================================

// Quick lookup: state name -> state object
const STATE_BY_NAME = {};
INDIA_LOCATIONS.forEach(state => { STATE_BY_NAME[state.name] = state; });

// Find a state by name, ignoring upper/lower case ("karnataka" -> Karnataka)
function findState(name) {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    return INDIA_LOCATIONS.find(s => s.name.toLowerCase() === lower) || null;
}

// Find a city inside a state. Returns [name, district, code] or null.
function findCity(stateName, cityName, district) {
    const state = findState(stateName);
    if (!state || !cityName) return null;
    const lower = cityName.trim().toLowerCase();
    const matches = state.cities.filter(c => c[0].toLowerCase() === lower);
    if (district) {
        const exact = matches.find(c => c[1].toLowerCase() === district.toLowerCase());
        if (exact) return exact;
    }
    return matches[0] || null;
}

// Text shown in the dropdown: "Puttur (Dakshina Kannada)"
function cityLabel(city) {
    const [name, district] = city;
    return district && district.toLowerCase() !== name.toLowerCase()
        ? `${name} (${district})`
        : name;
}

function setupLocationPicker(options) {
    const stateSelect = document.getElementById(options.stateId);
    const citySelect = document.getElementById(options.cityId);
    const searchInput = document.getElementById(options.searchId);
    const countText = options.countId ? document.getElementById(options.countId) : null;

    let stateCities = []; // cities of the selected state

    // ---------- 1. Fill the state dropdown (already A-Z in the data) ----------
    stateSelect.innerHTML = '<option value="">Select State/Union Territory</option>';
    INDIA_LOCATIONS.forEach(state => {
        stateSelect.add(new Option(state.name, state.name));
    });

    // ---------- 2. Fill the city dropdown (optionally filtered) ----------
    function fillCities(query = "") {
        const previous = getSelectedCity();
        const q = query.trim().toLowerCase();

        // Cities whose name starts with the text come first, then
        // cities that contain it (in the name or the district)
        let list = stateCities;
        if (q) {
            const starts = stateCities.filter(c => c[0].toLowerCase().startsWith(q));
            const contains = stateCities.filter(c =>
                !c[0].toLowerCase().startsWith(q) &&
                (c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q)));
            list = starts.concat(contains);
        }

        citySelect.innerHTML = '<option value="">Select City</option>';
        list.forEach(city => {
            const option = new Option(cityLabel(city), city[0]);
            option.dataset.district = city[1];
            citySelect.add(option);
        });

        if (q && list.length === 0) {
            const none = new Option(`No city matches "${query.trim()}"`, "");
            none.disabled = true;
            citySelect.add(none);
        }

        // Keep the earlier choice if it is still in the list
        if (previous) selectCity(previous[0], previous[1], false);

        if (countText) {
            countText.textContent = !stateCities.length ? "" :
                q ? `${list.length} of ${stateCities.length} cities match` :
                    `${stateCities.length} cities in ${stateSelect.value}`;
        }
    }

    // ---------- 3. When the state changes: reset and reload cities ----------
    function onStateChange(notify = true) {
        const state = STATE_BY_NAME[stateSelect.value];
        stateCities = state ? state.cities : [];

        searchInput.value = "";
        citySelect.disabled = !state;          // disabled until a state is chosen
        searchInput.disabled = !state;
        fillCities();
        citySelect.value = "";                 // reset city selection

        if (notify && options.onChange) options.onChange();
    }

    stateSelect.addEventListener("change", () => onStateChange());

    // ---------- 4. Search box filters the city list ----------
    searchInput.addEventListener("input", () => fillCities(searchInput.value));

    // Pressing Enter in the search box picks the first matching city
    searchInput.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const first = Array.from(citySelect.options).find(o => o.value && !o.disabled);
        if (first) {
            citySelect.value = first.value;
            first.selected = true;
            citySelect.dispatchEvent(new Event("change"));
        }
    });

    citySelect.addEventListener("change", () => {
        if (options.onChange) options.onChange();
    });

    // ---------- Helpers used by the pages ----------
    function getSelectedCity() {
        const option = citySelect.selectedOptions[0];
        if (!option || !option.value) return null;
        return [option.value, option.dataset.district || ""];
    }

    function selectCity(name, district, notify = true) {
        const lower = (name || "").toLowerCase();
        const all = Array.from(citySelect.options);
        const option =
            all.find(o => o.value.toLowerCase() === lower && (!district || o.dataset.district === district)) ||
            all.find(o => o.value.toLowerCase() === lower);
        if (option) option.selected = true;
        if (notify && options.onChange) options.onChange();
        return Boolean(option);
    }

    onStateChange(false); // start with the city dropdown disabled

    return {
        getState: () => stateSelect.value,
        getCity: () => (getSelectedCity() || [""])[0],
        getDistrict: () => (getSelectedCity() || ["", ""])[1],

        // Select a state and city (used for edit mode and URL parameters)
        setValue(stateName, cityName, district) {
            const state = findState(stateName);
            stateSelect.value = state ? state.name : "";
            onStateChange(false);
            if (state && cityName) {
                const city = findCity(state.name, cityName, district);
                if (city) selectCity(city[0], city[1], false);
            }
        },

        reset() {
            stateSelect.value = "";
            onStateChange(false);
        }
    };
}
