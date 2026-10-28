"""
BUILD INDIA STATE & CITY DATA FILE
==================================

Creates  frontend/js/india-locations.js  from the official
Local Government Directory (LGD) data published by the Government of India
(https://lgdirectory.gov.in -> Download Directory).

Source used for this project (CSV dump of LGD, December 2022):
    https://github.com/planemad/india-local-government-directory

    administrative/1-state.csv         -> 28 States + 8 Union Territories
    municipal/urban-local-body.csv     -> all Urban Local Bodies (cities/towns)
    municipal-directory.csv            -> which district each ULB belongs to
    administrative/3-subdistrict.csv   -> used ONLY for Lakshadweep, which has
                                          no urban local body (its islands are
                                          listed instead)

HOW TO REFRESH THE DATA (e.g. with a newer LGD download)
    git clone --depth 1 https://github.com/planemad/india-local-government-directory lgd
    python tools/build-locations.py lgd

The script only tidies names, it never invents places:
    * "MANGAON" / "savli"  -> "Mangaon" / "Savli" (fixes ALL-CAPS / lowercase)
    * "Municipal Council Kathua", "Wokha Town Council" -> "Kathua", "Wokha"
      (removes the body type, keeps the place name)
    * two bodies with the same name in the same district (e.g. a city and its
      cantonment board, both called "Pune") are shown once.
"""

import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

SOURCE_DIR = sys.argv[1] if len(sys.argv) > 1 else "lgd"
OUT_FILE = os.path.join(os.path.dirname(__file__), "..", "frontend", "js", "india-locations.js")

# Correct official spelling/case for state names (LGD stores them in CAPITALS)
STATE_NAME_FIX = {
    "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "Dadra and Nagar Haveli and Daman and Diu",
}

# A few bodies are listed by an abbreviation only. We show the place name
# people search for, and keep the official abbreviation in brackets.
DISPLAY_NAME_FIX = {
    "BBMP": "Bengaluru (BBMP)",             # Bruhat Bengaluru Mahanagara Palike
    "GNIDA": "Greater Noida (GNIDA)",       # Greater Noida Industrial Development Authority
    "YEIDA": "Yamuna Expressway (YEIDA)",   # Yamuna Expressway Industrial Development Authority
    "BKT": "Bakshi Ka Talab",               # Nagar Panchayat in Lucknow district
}

SMALL_WORDS = {"and", "of", "the", "ka", "ki", "ke"}

# Body-type words that appear before or after the place name
PREFIXES = [
    r"municipal committee", r"municipal council", r"city corporation",
    r"nagar palika,?", r"nagar parishad", r"nagar panchayat",
]
SUFFIXES = [
    r"municipal corporation", r"municipal co-operation", r"city corporation",
    r"municipal council", r"muncipal council", r"municipal board",
    r"municipality", r"nagar ?panchayat", r"nagar parishad", r"town council",
    r"np", r"\(m\)",
]
PREFIX_RE = re.compile(r"^(?:" + "|".join(PREFIXES) + r")\s+", re.I)
SUFFIX_RE = re.compile(r"\s*(?:" + "|".join(SUFFIXES) + r")$", re.I)


def title_case(text):
    """Title-case a name only if it is ALL CAPS or all lowercase."""
    text = re.sub(r"\s+", " ", text.strip())
    if not (text.isupper() or text.islower()):
        return text
    words = re.split(r"(\s+|-|\(|\)|\.)", text.lower())
    out = []
    for i, w in enumerate(words):
        if w and w[0].isalpha() and not (i > 0 and w in SMALL_WORDS):
            w = w[0].upper() + w[1:]
        out.append(w)
    return "".join(out)


def clean_city(raw):
    name = raw.strip()
    if name.upper() in DISPLAY_NAME_FIX:
        return DISPLAY_NAME_FIX[name.upper()]
    name = PREFIX_RE.sub("", name)
    name = SUFFIX_RE.sub("", name)
    name = name.replace("Cantonment Board", "Cantonment").strip(" ,")
    name = re.sub(r"\(\s+", "(", name)
    return title_case(name)


def read_csv(*parts):
    with open(os.path.join(SOURCE_DIR, *parts), encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------- 1. States and Union Territories ----------
states = {}
for row in read_csv("administrative", "1-state.csv"):
    raw = row["State Name"].strip()
    states[raw] = {
        "name": STATE_NAME_FIX.get(raw, title_case(raw)),
        "type": "State" if row["State or UT"].strip() == "S" else "Union Territory",
        "cities": {},
    }

# ---------- 2. District of each urban local body ----------
district_votes = defaultdict(Counter)
for row in read_csv("municipal-directory.csv"):
    district_votes[row["Localbody Code"]][row["District Name"].strip()] += 1


def district_of(code):
    votes = district_votes.get(code)
    return title_case(votes.most_common(1)[0][0]) if votes else ""


# ---------- 3. Urban local bodies -> cities ----------
for row in read_csv("municipal", "urban-local-body.csv"):
    state = states[row["State Name"].strip()]
    city = clean_city(row["Local Body Name"])
    district = district_of(row["Local Body Code"])
    key = (city.lower(), district.lower())
    if key not in state["cities"]:                      # merge duplicates
        state["cities"][key] = [city, district, int(row["Local Body Code"])]

# ---------- 4. States/UTs with no urban local body (Lakshadweep) ----------
for row in read_csv("administrative", "3-subdistrict.csv"):
    state = states[row["State Name"].strip()]
    if state["name"] != "Lakshadweep":
        continue
    city = title_case(row["Sub-district Name"])
    key = (city.lower(), "lakshadweep")
    state["cities"][key] = [city, "Lakshadweep", int(row["Sub-district Code"])]

# ---------- 5. Sort alphabetically and write the JS file ----------
result = []
for s in sorted(states.values(), key=lambda s: s["name"].lower()):
    cities = sorted(s["cities"].values(), key=lambda c: (c[0].lower(), c[1].lower()))
    result.append({"name": s["name"], "type": s["type"], "cities": cities})

total = sum(len(s["cities"]) for s in result)
n_states = sum(1 for s in result if s["type"] == "State")
n_uts = len(result) - n_states

lines = [
    "// ==========================================================",
    "// INDIA STATES, UNION TERRITORIES AND CITIES",
    "// ----------------------------------------------------------",
    "// GENERATED FILE - do not edit by hand.",
    "// Made by tools/build-locations.py from the Local Government",
    "// Directory (LGD), Government of India - urban local bodies",
    "// (municipal corporations, municipalities, nagar panchayats,",
    "// notified area councils, cantonments...). December 2022 dump:",
    "// https://github.com/planemad/india-local-government-directory",
    "//",
    f"// {n_states} States + {n_uts} Union Territories, {total} cities/towns.",
    "// Each city is [ name, district, LGD code ].",
    "// Lakshadweep has no urban local body, so its LGD sub-districts",
    "// (islands) are listed instead.",
    "// ==========================================================",
    "",
    "const INDIA_LOCATIONS = [",
]
for s in result:
    lines.append("  {")
    lines.append(f'    "name": {json.dumps(s["name"])}, "type": {json.dumps(s["type"])},')
    lines.append('    "cities": [')
    for c in s["cities"]:
        lines.append("      " + json.dumps(c, ensure_ascii=False) + ",")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("    ]")
    lines.append("  },")
lines[-1] = "  }"
lines += [
    "];",
    "",
    "// Lets the Node.js backend use the same list:  require('../frontend/js/india-locations.js')",
    'if (typeof module !== "undefined") module.exports = INDIA_LOCATIONS;',
    "",
]

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Wrote {OUT_FILE}: {n_states} states, {n_uts} UTs, {total} cities")
for s in result:
    print(f"  {s['name']:<42} {s['type']:<16} {len(s['cities'])}")
