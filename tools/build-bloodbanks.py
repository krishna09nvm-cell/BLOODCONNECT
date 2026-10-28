"""
BUILD BLOOD BANK DATA FILE
==========================

Creates  backend/data/blood-banks.json  from the official
"Blood Bank Directory" published by the National Health Portal (NHP),
Ministry of Health & Family Welfare, on the Open Government Data Platform
(https://data.gov.in, Government Open Data License - India).

Copy used for this project (CSV with latitude/longitude, 2,820 blood banks):
    https://github.com/atmajitg/bloodbanks   ->  blood-banks.csv

HOW TO REFRESH THE DATA
    git clone --depth 1 https://github.com/atmajitg/bloodbanks bb
    python tools/build-bloodbanks.py bb/blood-banks.csv
(or download the newest "Blood Bank Directory" CSV from data.gov.in -
 it has the same columns - and pass its path instead)

IMPORTANT - what this data does NOT contain
    * It has NO blood stock / inventory. We never say a blood bank has a
      blood group. Users are sent to e-RaktKosh or told to call.
    * Phone numbers and addresses may be out of date. Users should call first.

LOCATION CHECKS (so that distances are not based on wrong coordinates)
    Every blood bank gets a "location" value:
      "verified"    coordinates passed all checks below
      "approximate" several banks of the same district share the exact same
                    point (usually a city centre) -> distance is approximate
      "unverified"  coordinates failed a check -> NOT used for distance
                    search; directions use the address instead
      "missing"     no usable coordinates
    Checks:
      1. Coordinates must be inside India (lat 6-37.5, lng 68-97.5).
      2. The same point used by banks in DIFFERENT districts is a data error.
      3. District with 3+ banks: must be within 80 km of the district's
         median point.
      4. Otherwise: must be inside the state's area (the box around 90% of
         that state's banks, plus a 1-degree margin).
"""

import csv
import html
import json
import math
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

SOURCE = sys.argv[1] if len(sys.argv) > 1 else "bb/blood-banks.csv"
OUT_FILE = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "blood-banks.json")

# Directory state names -> official LGD names used by our dropdowns
STATE_FIX = {
    "Andaman And Nicobar Islands": "Andaman and Nicobar Islands",
    "Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu",
    "Dadra and Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu",
}
# Leh and Kargil became the UT of Ladakh in 2019
LADAKH_DISTRICTS = {"LEH", "LEH LADAKH", "KARGIL"}
# Puducherry's districts are far apart (Mahe is in Kerala, Yanam in Andhra)
SKIP_STATE_BOX = {"Puducherry"}

EMPTY = {"", "N/A", "NA", "N.A.", "NIL", "0", "-", "--", "NONE"}


def clean(text):
    # The source file has a few broken characters (shown as \ufffd):
    # "Doctor\ufffd??s" was an apostrophe, the others are junk bytes.
    text = (text or "").replace("\ufffd??", "'").replace("\ufffd", "")
    text = html.unescape(text)  # "Martha&#39;s" -> "Martha's"
    text = text.replace("\r", " ").replace("\n", ", ")
    text = re.sub(r"\s*,\s*(,\s*)*", ", ", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.")
    return "" if text.upper() in EMPTY else text


def title(text):
    text = clean(text)
    return text.title() if text.isupper() or text.islower() else text


def phones(*values):
    """Split '0824 2444590, 9876543210/ 102' into separate numbers, no duplicates."""
    out = []
    for value in values:
        for part in re.split(r"[,/;]| or ", value or ""):
            p = clean(part)
            digits = re.sub(r"\D", "", p)
            if len(digits) >= 3 and p not in out:
                out.append(p)
    return out


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def haversine(lat1, lng1, lat2, lng2):
    r = math.radians
    a = (math.sin(r(lat2 - lat1) / 2) ** 2 +
         math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(a))


# ---------- 1. Read and clean ----------
with open(SOURCE, encoding="utf-8", errors="replace") as f:
    raw = [{(k or "").strip(): (v or "") for k, v in row.items()} for row in csv.DictReader(f)]

banks = []
for row in raw:
    state = STATE_FIX.get(clean(row["State"]), clean(row["State"]))
    district = title(row["District"])
    if district.upper() in LADAKH_DISTRICTS:
        state = "Ladakh"
    lat, lng = number(row["Latitude"]), number(row["Longitude"])
    inside_india = lat is not None and lng is not None and 6 <= lat <= 37.5 and 68 <= lng <= 97.5
    banks.append({
        "id": "bb" + clean(row["Sr No"]),
        "name": clean(row["Blood Bank Name"]),
        "category": clean(row["Category"]),              # Government / Private / Charity
        "address": clean(row["Address"]),
        "city": title(row["City"]),
        "district": district,
        "state": state,
        "pincode": clean(row["Pincode"]),
        "phones": phones(row["Contact No"], row["Mobile"]),
        "helpline": phones(row["Helpline"]),
        "email": clean(row["Email"]),
        "serviceTime": clean(row["Service Time"]).replace("24X7", "24x7").replace("24 x 7", "24x7"),
        "lat": round(lat, 6) if inside_india else None,
        "lng": round(lng, 6) if inside_india else None,
        "location": "verified" if inside_india else "missing",
    })

located = [b for b in banks if b["lat"] is not None]

# ---------- 2. Same point used in different districts / many times ----------
by_point = defaultdict(list)
for b in located:
    by_point[(round(b["lat"], 4), round(b["lng"], 4))].append(b)
for group in by_point.values():
    districts = {(b["state"], b["district"].upper()) for b in group}
    if len(districts) > 1:
        for b in group:
            b["location"] = "unverified"
    elif len(group) >= 3:
        for b in group:
            b["location"] = "approximate"

# ---------- 3 & 4. District / state consistency ----------
by_district, by_state = defaultdict(list), defaultdict(list)
for b in located:
    if b["location"] != "unverified":
        by_district[(b["state"], b["district"].upper())].append(b)
        by_state[b["state"]].append(b)


def percentile(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, max(0, int(round(p * (len(values) - 1)))))]


for b in located:
    if b["location"] == "unverified" or b["state"] in SKIP_STATE_BOX:
        continue
    group = by_district[(b["state"], b["district"].upper())]
    if len(group) >= 3:
        centre = (statistics.median(x["lat"] for x in group), statistics.median(x["lng"] for x in group))
        if haversine(b["lat"], b["lng"], *centre) > 80:
            b["location"] = "unverified"
        continue
    state_group = by_state[b["state"]]
    if b["state"] in SKIP_STATE_BOX or len(state_group) < 5:
        continue
    lats, lngs = [x["lat"] for x in state_group], [x["lng"] for x in state_group]
    if not (percentile(lats, .05) - 1 <= b["lat"] <= percentile(lats, .95) + 1 and
            percentile(lngs, .05) - 1 <= b["lng"] <= percentile(lngs, .95) + 1):
        b["location"] = "unverified"

# ---------- 5. Write ----------
banks.sort(key=lambda b: (b["state"], b["city"], b["name"]))
meta = {
    "source": "Blood Bank Directory, National Health Portal (MoHFW), Open Government Data Platform India (data.gov.in)",
    "license": "Government Open Data License - India",
    "note": "No blood stock information. Contact details may be outdated - call before visiting.",
    "count": len(banks),
    "locationCounts": dict(Counter(b["location"] for b in banks)),
}
with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump({"meta": meta, "bloodBanks": banks}, f, ensure_ascii=False, separators=(",", ":"))

print(f"Wrote {OUT_FILE}")
print(json.dumps(meta, indent=2))
