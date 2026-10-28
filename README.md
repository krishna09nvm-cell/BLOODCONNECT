# 🩸 LifeDrop – Blood Donation & Emergency Donor Finder

A college mini project built with **HTML, CSS, JavaScript** (frontend) and **Node.js + Express.js** (REST API backend).
It lets people register as blood donors, find the nearest donors by blood group and distance on a map, and post emergency blood requests.

---

> 🌐 **Putting the website online?** See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step hosting instructions (Render / Railway / Docker).

## ✨ Features

**Dashboard** (new): public statistics page in the main menu: cards, pie, monthly/yearly bars, blood groups and locations (aggregated only).

**Feedback form**: anonymous 4-question form on the home page; results in the admin dashboard.

**Admin Analytics Dashboard**: private `admin.html` with a separate admin login, impact and
emergency charts (Chart.js), filters, honest counting rules, record management and CSV reports.
See [📊 Admin Analytics Dashboard](#-admin-analytics-dashboard-adminhtml).

**Donors (CRUD)**
- Register as a donor (name, age, blood group, phone, availability, **state, city, district, latitude, longitude**)
- View all donors, update a donor, delete a donor
- Search donors by blood group, state and city

**Indian State & City dropdowns (official LGD data)**
- All **28 States and 8 Union Territories**, A–Z, placeholder "Select State/Union Territory"
- **4,790 cities and towns**: every urban local body in the Government of India's
  Local Government Directory (municipal corporations, municipalities, nagar panchayats,
  notified area councils, cantonments…), each with its district and LGD code
- City dropdown ("Select City") stays disabled until a state is chosen, shows only that
  state's cities, and resets when the state changes
- "Type to search city" box filters the list as you type (press Enter to pick the first match)
- Used in: homepage quick search, Find Donor (location + directory), Become a Donor, Emergency requests
- The backend uses the same list to reject a city that doesn't belong to the chosen state

**Interactive GPS map + search any place**
- Leaflet.js + OpenStreetMap map on the Find Donor page (works on phones and computers)
- **Search bar** for an address, area, city, state, **PIN code** or **blood bank name**.
  Results are grouped as *Blood banks* (official directory) and *Places* (OpenStreetMap).
  Pick one to put a marker there and search around it
- The selected point's **address, city, district, state and PIN code** are shown automatically
  (reverse geocoding), and the State/City dropdowns are set to match
- **Use my current location (GPS)** shows a blue dot plus a light circle for the GPS accuracy (e.g. ±35 m)
- **Click anywhere on the map** to search around that point
- Handles loading, "no place found", no internet, permission denied and insecure pages with clear messages

**Location-based search: donors + blood banks**
- "Use my current location" (browser Geolocation API, asks permission), or **live location**
  that updates the results as you move, or choose State + City if permission is denied
- Distance filter: Within 5 / 10 / 25 / 50 km, **More than 50 km**, **All distances**
- If no matching donor is within 50 km: *"No matching donors found within 50 km. Would you like to
  search farther away?"* with buttons for 75 km, 100 km, 150 km and farther. The search keeps the
  same location, so nothing has to be entered again
- Optional **compatible blood groups** (e.g. O- donors for an A+ patient)
- **2,820 official blood banks** (National Health Portal directory) in the same results, with name,
  address, phone, email, distance and directions. Donor and blood bank cards look different, and the
  All / Donors / Blood banks tabs separate them
- Every result shows its distance in km, nearest first, with a **Get directions** link (Google Maps)
- Map (Leaflet.js + OpenStreetMap): blue = you, red = donor's approximate area, white square = blood bank
- Backend: `GET /api/search` using the **Haversine formula**
- **Privacy:** a donor's exact location never leaves the server (see below)

**Emergency requests**
- Create an emergency request (patient, blood group, units, hospital, city, contact, urgency)
- View requests (Open / Fulfilled / All, filter by blood group)
- Mark as fulfilled, delete, and jump to "Find matching donors"

**Modern homepage**
- Sticky navbar, hero with quick search, live stats, "How it works", 8 blood group cards, footer
- Red & white theme, rounded cards, hover effects, scroll animations, fully responsive

---

## 📁 Folder structure

```
Blood-Donation/
├── README.md
├── tools/
│   ├── build-locations.py        ← rebuilds india-locations.js from LGD CSV files
│   └── build-bloodbanks.py       ← rebuilds blood-banks.json from the NHP directory
├── backend/
│   ├── package.json
│   ├── server.js                 ← Express app + all REST API routes
│   ├── seed.js                   ← replaces DEMO records, keeps real ones (npm run seed)
│   ├── .env.example              ← copy to .env and add your e-mail API key (never commit .env)
│   ├── scripts/send-test-email.js ← npm run email:test -- you@example.com
│   ├── scripts/create-admin.js   ← npm run create-admin (first admin account)
│   ├── routes/
│   │   ├── auth.js               ← register, login, logout, profile, password reset
│   │   ├── admin.js              ← Admin Analytics Dashboard API (admins only)
│   │   ├── route.js              ← road routes for the camp map (OSRM)
│   │   └── chat.js               ← AI Assistant: POST /api/chat (key stays on the server)
│   ├── utils/
│   │   ├── haversine.js          ← distance between two lat/lng points
│   │   ├── privacy.js            ← hides exact donor locations
│   │   ├── geocoder.js           ← address ↔ coordinates (OpenStreetMap Nominatim)
│   │   ├── camps.js              ← camp status (upcoming/ongoing/…) + demo camps
│   │   ├── places.js             ← blood banks vs hospitals, built-in PIN code lookup
│   │   ├── auth.js               ← scrypt password hashes, sessions, validation, login limits
│   │   ├── admin-auth.js         ← separate admin accounts, admin sessions, audit log
│   │   ├── env.js                ← reads backend/.env (server-side secrets)
│   │   ├── email.js              ← sends e-mails (Resend / SendGrid / SMTP), retry, no duplicates, safe log
│   │   ├── email-templates.js    ← red & white HTML e-mails
│   │   ├── notifications.js      ← which e-mail when (essential vs optional), reference numbers
│   │   ├── idempotency.js        ← stops double form submissions
│   │   ├── chat-knowledge.js     ← what the AI Assistant knows about the website
│   │   ├── compatibility.js      ← which donor groups a patient can receive
│   │   └── db.js                 ← read/write JSON files (simple database)
│   └── data/
│       ├── sample-donors.json    ← 15 DEMO donors (fictional, test locations)
│       ├── sample-requests.json  ← 4 DEMO emergency requests
│       ├── blood-banks.json      ← 2,820 blood banks (official directory, read-only)
│       ├── education-profiles.json ← 15 fictional EDUCATIONAL profiles (O−, AB+, rare)
│       ├── camps.json            ← blood donation camps (created on first run / npm run seed)
│       ├── users.json            ← accounts (password HASHES only), created on first sign-up
│       ├── sessions.json         ← login sessions (token hashes), created on first login
│       ├── email-log.json        ← e-mail status log (masked addresses only)
│       ├── outbox/               ← e-mail PREVIEWS when no provider is configured
│       ├── donors.json           ← created automatically on first run
│       └── requests.json         ← created automatically on first run
└── frontend/
    ├── welcome.html              ← FIRST PAGE: Welcome + Login / Create Account
    ├── login.html, signup.html   ← Login and Registration
    ├── forgot-password.html, reset-password.html
    ├── dashboard.html            ← role-based dashboard + profile (logged-in only)
    ├── terms.html                ← Terms and Conditions + Privacy Policy
    ├── index.html                ← Home page
    ├── find-donor.html           ← Nearby search + map + donor directory
    ├── register.html             ← Become a donor / update donor
    ├── emergency.html            ← Emergency requests
    ├── camps.html                ← Blood Donation Camp Tracker
    ├── css/
    │   └── style.css
    └── js/
        ├── india-locations.js    ← GENERATED: 36 states/UTs + 4,790 cities (LGD)
        ├── location-picker.js    ← State + City dropdowns with search
        ├── common.js             ← navbar, toast, geolocation, geocoding helpers
        ├── home.js
        ├── demo-profiles.js      ← educational demo profiles section
        ├── camps.js              ← camp tracker page
        ├── auth.js               ← shared login/registration helpers (validation, show/hide)
        ├── dashboard.js          ← donor / finder / organizer dashboards + profile
        ├── chatbot.js            ← floating AI Assistant (on every page)
        ├── mascot.js             ← Dr. Asha (animated doctor) + Bindu (blood-drop mascot)
        ├── stats.js              ← public Dashboard (statistics.html)
        ├── feedback.js           ← "Help Us Save More Lives!" feedback form
        ├── admin.js              ← Admin Analytics Dashboard (charts, filters, management)
        ├── analytics-core.js     ← every dashboard number (shared with the server)
        ├── decor.js              ← illustrations, nav/footer icons, donor avatars, click animations
        ├── camp-route.js         ← road routes, city markers and quick filter on the camps map
        ├── find-donor.js
        ├── register.js
        └── emergency.js
```

---

## 🚀 How to run

**Requirements:** [Node.js](https://nodejs.org) 18 or newer, and an internet connection (for the map tiles, Leaflet library and Google Font).

```bash
# 1. go into the backend folder
cd Blood-Donation/backend

# 2. install dependencies (express, cors)
npm install

# 3. load the 15 DEMO donors (removes old demo records, keeps real donors)
npm run seed

# 4. start the server
node server.js
```

You should see:

```
Server running at http://localhost:5000
```

**5. Open http://localhost:5000 in your browser.** The Welcome / Login page opens first. The Express server serves the website *and* the API, so nothing else is needed.

> 💡 Open the site through `http://localhost:5000`, not by double-clicking the HTML file.
> Browsers only allow the "Use my current location" feature on `localhost` or `https` pages.

> 🔄 **Upgrading from an earlier version?** Run `npm run seed` once. It deletes the old sample donors
> (Rahul Shetty, Mahesh Rao… recognised by their old sample phone numbers 98765 432xx) and the old
> sample requests, keeps every donor you registered yourself, and adds the 15 new DEMO donors.

## 🧪 Demo (sample) donors

The project ships with **15 fictional donors** for testing (`backend/data/sample-donors.json`):

| Name | Group | City, State/UT |
|---|---|---|
| Aarav Malhotra | O+ | New Delhi, Delhi |
| Ishita Bansal | AB- | South Delhi, Delhi |
| Kabir Rathore | B+ | Greater Jaipur, Rajasthan |
| Meera Srivastava | A+ | Lucknow, Uttar Pradesh |
| Rohan Deshmukh | O- | Greater Mumbai, Maharashtra |
| Ananya Tiwari | B- | Bhopal, Madhya Pradesh |
| Vivaan Sinha | A- | Patna, Bihar |
| Simran Gill | AB+ | Chandigarh, Chandigarh |
| Karthik Subramanian | O+ | Chennai, Tamil Nadu |
| Divya Gowda | A+ | Bengaluru (BBMP), Karnataka |
| Arjun Banerjee | B+ | Kolkata, West Bengal |
| Sneha Kamath | O- | Mangaluru, Karnataka |
| Nikhil Shenoy | A- | Udupi, Karnataka |
| Fatima Qureshi | B- | Hyderabad, Telangana |
| Joel Mathew | AB+ | Kochi, Kerala |

Rules followed for the demo data:
- Every record has `"isDemo": true` and the label **"DEMO — NOT A REAL DONOR"**, shown on every card and map popup.
- Phone numbers are `00000 00101` to `00000 00115`. No Indian phone number starts with `0000`
  (a leading 0 is only the trunk prefix), so they can't reach anyone. They are shown as
  "demo number, not callable", with no Call button.
- Coordinates are **test locations** at the city centre, not anyone's address. On the map, demo donors
  have a **grey dashed marker**, and there is no "Directions" link for them.
- Availability is `"Demo record"`. No demo donor is shown as "Available", and no eligibility is claimed.
- The homepage numbers count **real** records only and say how many demo records exist.
- Demo records can be **deleted** but not edited (`PUT` returns 403), so they can't turn into "real" donors.
- The 4 sample emergency requests are also labelled **"DEMO — NOT A REAL REQUEST"**, with `00000 009xx` numbers.

**Before a real launch:** delete the demo records (Delete button, or remove `"isDemo": true` records from
`data/donors.json`). `npm run seed` never deletes real donors.

### Testing the demo donor list
1. `npm run seed`, start the server, open **Find Donor** and scroll to **All registered donors**: 15 DEMO cards.
2. In the search box try `Meera` (name), `O-` (blood group), `Kolkata` (city), `Rajasthan` (state).
3. Filter **B+** + **West Bengal** → Arjun Banerjee. Click **Reset**.
4. Set location **Delhi → New Delhi**: the results show Aarav Malhotra (≈0.5 km) and Ishita Bansal (≈10 km), both labelled DEMO.
5. Choose blood group **AB+**, **Within 50 km**: no demo AB+ donor is that close, so the
   "search farther away" message appears. Click **Farther (all distances)** → Simran Gill, Chandigarh (≈239 km).
6. The homepage says "0 donors · 2 demo" on each blood group card and explains that the numbers count real donors only.

## 🔐 Login, Registration and Role-Based Dashboards

**Opening http://localhost:5000 now shows the Welcome page** (`welcome.html`): *Blood Donation and Blood
Camp Tracker — Find Blood. Donate Blood. Save Lives.* with **Login** and **Create Account**. Everything
public (home page, Find Donor, Camps, Emergency) still works without an account via
"Continue without an account".

| Page | What it does |
|---|---|
| `welcome.html` | First page. Login / Create Account (or "Go to my dashboard" when logged in) |
| `signup.html` | Full name, date of birth, email, mobile (+91), password + confirm, gender (optional), state, city, PIN, role (Blood Donor / Blood Finder / Camp Organizer), accept Terms & Privacy |
| `login.html` | Email **or** mobile number, password with Show/Hide, Remember me, Forgot password link |
| `forgot-password.html` → `reset-password.html` | One-time reset link, valid 30 minutes |
| `dashboard.html` | **Protected.** Different tabs per role + Profile + Logout |
| `terms.html` | Terms and Conditions + Privacy Policy |

**Dashboards**
- **Blood Donor**: camps near the PIN code in your profile on a map; search another PIN code or place;
  use your location; camp dates, addresses, contacts, directions; **My profile**.
- **Blood Finder**: the same, plus **blood banks** and **hospitals** (filters), search by city,
  locality or PIN code; **My profile**.
- **Camp Organizer**: **My camps** (with *Pending verification* / *Approved* / *Not approved*),
  **Add a camp** (name, organiser, address, PIN, date, time, contact, **pin on the map**: "Find on map"
  or click / drag the pin), **Edit** (sends it back to pending) and **Delete** (click twice);
  **My profile**. Camps appear publicly only after the admin approves them (Organiser review on
  the Camps page, with the `ADMIN_KEY`).
- **Profile** (all roles): view and edit name, date of birth, gender, email, mobile, state, city, PIN;
  change password. Email and mobile are shown **only to you**, never publicly.

**Validation** (in the browser *and* again on the server): valid email; Indian mobile = 10 digits starting
with 6-9 (+91 / 0 prefixes are removed); PIN = 6 digits, not starting with 0; passwords match, at least
8 characters with a letter and a number; 18+ years old (donors 18-65); role chosen; terms accepted;
email and mobile not already registered.

### How the security works (`backend/utils/auth.js`, `backend/routes/auth.js`)
- **Passwords are never stored.** Only a salted **scrypt** hash (Node.js `crypto`, no extra package)
  is saved in `backend/data/users.json`. No password is written in any JavaScript file.
- After login the browser gets a random session token in an **HttpOnly, SameSite=Lax cookie**
  (page scripts cannot read it). The server stores only the token's SHA-256 hash in `sessions.json`.
  Remember me = 30 days; otherwise the cookie ends when the browser closes (max 12 hours).
- `dashboard.html` and every `/api/auth/*` and `/api/organizer/*` call check the session on the
  **server**. Logged-out visitors are sent to the login page. Organizers can only change their own camps.
- Login errors never reveal whether an account exists. 5 wrong passwords → 15-minute pause.
- Password reset: random one-time token (stored as a hash), valid 30 minutes; after a reset or a
  password change all other sessions are logged out.
- Changes must be sent as JSON (blocks simple cross-site form attacks).

### Configuration
No API key is needed. Optional settings (environment variables when starting the server):

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:5000` | Address used in reset links. Set it to your real `https://` address online |
| `SHOW_RESET_LINK` | off | `true` = also show the reset link on the page. **For local demos/presentations only** |
| `EMAIL_PROVIDER`, `RESEND_API_KEY` / `SENDGRID_API_KEY` / `SMTP_*`, `EMAIL_FROM` | not set | Send e-mails (welcome, confirmations, reset). See **E-mail notifications** |
| `ADMIN_KEY` | `change-this-admin-key` | Approve organizers' camps |

Without an e-mail provider no e-mail is sent; the reset link is shown on the page / terminal **only** when `SHOW_RESET_LINK=true`. For a presentation:
```bash
# Windows (Command Prompt)
set SHOW_RESET_LINK=true
set ADMIN_KEY=my-secret-key
node server.js

# Mac / Linux
SHOW_RESET_LINK=true ADMIN_KEY=my-secret-key node server.js
```
**For a real public website:** run it on **HTTPS** (the cookie is then marked Secure automatically),
set `APP_URL`, configure SMTP, keep `SHOW_RESET_LINK` off, use a real database (MongoDB/MySQL/PostgreSQL)
instead of JSON files, and back up `users.json`.

> **Firebase Authentication or Supabase Auth instead?** Both work too. You would replace
> `routes/auth.js` with their SDK (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`,
> `sendPasswordResetEmail` in Firebase; `supabase.auth.signUp / signInWithPassword /
> resetPasswordForEmail` in Supabase), store the profile in Firestore / a Supabase table protected by
> security rules, and put the project's **public** config keys in the frontend. This project uses its
> own Express login so it runs offline with no account or API key, which is easier to present.

### The online preview
The hosted preview has no server of its own, so its login is a **clearly labelled browser-only
demo**: accounts live only in that browser (localStorage), passwords are hashed with PBKDF2-SHA-256
(Web Crypto), the reset code is shown on screen instead of e-mailed, and organizers' camps stay in the
browser and are never published. Use the Node.js version for real accounts.

### Testing the login system
1. `node server.js` (with `SHOW_RESET_LINK=true` for step 7) and open **http://localhost:5000**: the
   Welcome page appears.
2. Open **http://localhost:5000/dashboard.html** directly: you are sent to Login ("Please log in…").
3. **Create Account** → click Create Account with empty fields: every field shows its error. Try
   `abc@` (email), `12345` (mobile), `057500` (PIN), different passwords: each gets a clear message.
4. Register as **Camp Organizer** → you land on the organizer dashboard. **Add a camp**, click
   **Find on map** (or click the map), tick the box, **Save**: it shows *Pending verification* and
   is **not** on the public Camps page. Approve it in **Camps → Organiser review** with the admin key:
   it becomes *Approved · public*. **Edit** it (pending again) and **Delete** it (click twice).
5. **My profile**: change the city and PIN → saved. Try a wrong mobile → error. Change the password.
6. **Logout** → login page. Log in with the **mobile number** and the new password, tick **Remember me**.
   Wrong password → "Incorrect email/mobile number or password".
7. Logout → **Forgot password?** → enter the email → open the link (page or terminal) → set a new
   password → log in. Opening the same link again says it has expired.
8. Register a **Blood Donor** and a **Blood Finder** (another email and mobile): the donor sees camps
   near their PIN; the finder also sees blood banks and hospitals.
9. Check `backend/data/users.json`: passwords appear only as `scrypt$…` hashes.

---

## 🎨 Visual identity: "a community heartbeat"

The design is built around one idea: **a heartbeat line that turns into a blood drop**. It appears
under the home headline, along the bottom of every page header and next to section titles.

**Colours** (CSS variables in `style.css`; section 25 has the visual identity):

| Colour | Shades | Used for |
|---|---|---|
| **Red** (primary) | `#c8102e`, deeper `#8f0b21`, footer `#5e0a1b` | main buttons, headings, page headers, blood drops, map pins |
| **White** (primary) | `#ffffff` | cards, panels, forms |
| **Warm cream** | `#fff8f1`, `#fdeee3` | page background, soft sections |
| **Soft coral** | `#f4846f`, `#fde4dd` | distance chips, floating hearts, accents, footer icons |
| **Soft pink** | `#f9dce3`, `#fff0f3`, `#f2bcc8` | light buttons, pills, borders |
| **Green** | `#187a4e`, `#34b27b`, `#e3f4eb` | success, "Available", ongoing camps, "Call 108", the camp banner |

Text uses a dark warm grey (`#1d1416`, `#6b5d61`). No blue or purple.

**Fonts:** headings in *Bricolage Grotesque*, body text in *Plus Jakarta Sans* (Google Fonts).

**Illustrations and icons** (`js/decor.js`, original SVG drawn for this project, no stock images):

| Where | What you see |
|---|---|
| Home | Dr. Asha, floating blood drops and hearts, a heartbeat underline, "one donation can help save up to three lives" |
| Find Donor | Map illustration with donor pins and a magnifying glass; donor cards with an illustrated avatar, a drop-shaped blood-group badge, a location pin and a distance chip |
| Camps | Medical tent with a flag, calendar and location pin; camp cards with a calendar date badge and a tent watermark |
| Become a Donor | One person handing a blood drop to another in front of a heart; a glowing "Register as Donor" button |
| Emergency | Siren symbol with a heartbeat line, a striped alert bar and quick buttons: **Find donors nearby**, **Blood banks near me**, **Call 108** |
| Login / Sign-up | A friendly blood-bag character holding a heart, floating hearts and drops |
| Maps | Tent pins for camps (green = happening now), blood-bag pins for blood banks, hospital pins, drop pins with the blood group for donors |
| Navigation + footer | Lucide-style line icons next to every link, with small hover animations |

Avatars are generic drawings picked from the donor's name. They are not photos and do not show
what anyone looks like.

**How it works:** `decor.js` fills any element with `data-art="camps"` (or `find`, `register`, `sos`,
`auth`, `terms`) with the matching illustration, adds floating drops/hearts to elements with
`data-floaters`, adds icons to nav/footer links and avatars to donor cards (also when lists are
redrawn). Buttons get a ripple, and main buttons a tiny heart burst when clicked.

**Accessibility:** illustrations have a text label (`role="img"` + `aria-label`); decorative ones
are hidden from screen readers; every icon sits next to a visible text label. With "reduce motion"
turned on in the operating system, all floating, pulsing and burst animations stop.

If `decor.js` is removed, every page still works; it only adds decoration.

---

## 👩‍⚕️ Dr. Asha and Bindu: the animated mascots

**Dr. Asha** is a friendly animated doctor in a white coat, with a stethoscope and a red-cross badge. She
appears in the hero of the **Welcome** and **Home** pages. **Bindu** is a little blood-drop mascot that
appears on the Camps page, the Become a Donor page and the camp banner on the home page.
Everything is drawn in **SVG and animated with CSS**: no images, no libraries.

| What | How it behaves |
|---|---|
| Idle | breathes, tilts her head, blinks naturally; floating blood drops, hearts and sparkles; a drop that turns into a beating heart |
| Page opens | waves hello: "Hello! 👋 Every drop counts!" (the first time she is on screen) |
| Hover / focus a main button | points at it and explains it ("Find a blood camp near your PIN code!") |
| Click **Find Blood Camp** / **Become a Donor** / **Create Account** | thumbs-up, happy face and a burst of hearts, then the page opens (0.65 s later) |
| Every ~9 s | a tip: "Every Drop Counts!", "Be a Hero, Donate Blood!"… |
| Click Dr. Asha | opens the **AI Assistant** |
| Chat button | shows Dr. Asha's blinking face, with "Hi there! ❤️ Need help finding a blood camp or learning how to donate blood?" (hides by itself after 12 s) |
| Bindu | poses: map pin (Camps), heart and wave (Become a Donor), calendar (camp results) |

**Lightweight and respectful:** only CSS animations, paused when the character is off-screen.
**Reduce motion** (an operating-system setting) turns all movement off, and buttons then work instantly.
The characters never cover buttons, forms or maps: only the drawn doctor is clickable. On phones she
appears smaller below the search box.

**Code:** `frontend/js/mascot.js` (both characters). Put `<div data-doctor></div>` or
`<span data-drop-mascot="camp|donor|calendar"></span>` anywhere. Buttons talk to her with
`data-mascot-point="text"` and `data-mascot-cheer="text"`. Styles are in section 22 of `style.css`.

---

## 🤖 AI Assistant (chatbot)

A floating **AI Assistant** button (with Dr. Asha's face) sits in the bottom-right corner of **every page**. About a second after a
page opens, the message **"Hi there! ❤️ Need help finding a blood camp or learning how to donate blood?"** appears above it. Click the message or the
button to open the chat ("AI Assistant" / "Hello! 👋 How may I help you today?").

- **Real AI answers** from Claude (Anthropic), not fixed replies. The assistant knows the website's features
  (`backend/utils/chat-knowledge.js`) and answers blood-donation questions. It guides users with buttons
  such as **Find camps →** that open the right page. It replies in Hindi or Hinglish when the user
  writes that way.
- **Safe answers:** it never invents camps, donors or blood stock. For emergencies it says to call 108/112.
  Eligibility is always left to the doctor.
- **Chat window:** message box, **Send** (or Enter), close (× or Esc), **↻ new conversation**, typing dots,
  scrollable chat with the user on the right and the AI on the left, suggestion chips, "Try again" on errors.
  The conversation stays while you move between pages (until the tab is closed).
- **Welcome message:** can be dismissed with ×. The chat can be reopened any time.
- **Phones:** the chat opens as a sheet over the page, and the button stays small. Tablets and desktops show
  a floating window.
- **Code:** one component, `frontend/js/chatbot.js` (loaded on every page), with styles in section 21 of
  `style.css`. The server route is `backend/routes/chat.js` (`POST /api/chat`).

### Set it up
1. Get an API key: **https://console.anthropic.com → API Keys → Create Key** (paid per use; the chatbot
   uses the fast, low-cost `claude-haiku-5-5` model by default).
2. Add it to `backend/.env` (never in frontend code):
   ```ini
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   CHAT_MODEL=claude-haiku-5-5
   ```
3. Restart `node server.js`. It prints `AI Assistant: ON`. Without a key the chat window still opens, but
   it answers "The AI Assistant is not set up on this server yet".

**Security:** the browser sends only the conversation to `/api/chat`. The server adds the instructions
and the key, and calls Anthropic. The key is never sent to the browser. Each visitor can ask at most
20 questions per 10 minutes, and only the last 12 messages (max 1,500 characters each) are sent. If the
user is logged in, only their first name and role are shared with the AI, never their email or phone.

### Test it
1. Open any page: after about a second the welcome message appears. Click ×: it stays hidden on other pages
   in this tab.
2. Click the red button → the chat opens. Ask "How do I find camps near 575001?": typing dots, then an
   answer with a **Find camps →** button that opens the Camps page.
3. Ask a follow-up ("And blood banks?"): the AI remembers the conversation. Click ↻ to start again.
4. Try it on a phone width (DevTools, 390 px): the chat fills the bottom of the screen and closes with ×.

> The **online preview** (claude.ai link) uses Claude through the page itself, on the viewer's own Claude
> account, so it needs no key. The first question asks the viewer to allow it. Opened outside Claude,
> that version shows "The AI Assistant works when this website is opened in Claude".

---

## 📧 E-mail notifications

The **server** sends e-mails (never the browser), only **after** the action was saved. API keys stay in
`backend/.env` on the server.

| When | E-mail (essential unless marked) |
|---|---|
| New account | **"Welcome to Blood Donation and Blood Camp Tracker!"**: first name, role, purpose, button to the dashboard, support contact |
| Logged-in user registers as a donor (`register.html`) / updates it | "Blood donor registration — LD-DNR-…" |
| Logged-in user posts an emergency blood request (`emergency.html`) | "Emergency blood request — LD-REQ-…" (no patient name or phone in the e-mail) |
| Organizer adds / edits / deletes a camp (dashboard or Camps page form) | "Blood donation camp registration / update / deleted — LD-CAMP-…" |
| Admin approves / rejects / cancels / reschedules an organizer's camp | e-mail to that organizer |
| Password reset, password changed, e-mail or mobile changed | security e-mails (reset link valid 30 min) |
| **Optional**: a new camp is approved within 10/25/50 km of the user's PIN | only if the user ticked it at sign-up or in **Profile → E-mail notifications**; has an **Unsubscribe** link |

Every confirmation has the form type, a **reference number**, the date and time (IST) and only the details
needed. **Never** passwords, login tokens or API keys. Red & white HTML layout with a plain-text
version, readable on phones. Visitors who are not logged in don't get e-mails.

**Reliability and safety**
- **No duplicates:** each form sends an `Idempotency-Key`; a double click or retry returns the first
  result (one record, one e-mail). Each e-mail also has a unique key and is never sent twice.
- **Failures:** retried once; then logged as `failed`. The form submission is still saved, and the page
  says the e-mail could not be sent.
- **Logs** (`data/email-log.json`, server terminal): masked address (`kk***@gmail.com`), subject and
  status only. No e-mail content, tokens or keys.
- **Not configured?** Nothing is sent, the page says "E-mail notifications are not set up on this server
  yet", and a preview of the design is saved in `backend/data/outbox/`.

### Set up the e-mail service (Resend, recommended)
1. Create a free account at **https://resend.com**.
2. **API Keys → Create API key** (permission: *Sending access*). Copy it (starts with `re_`).
3. In `backend`, copy the settings file and fill it in:
   ```bash
   # Windows: copy .env.example .env      Mac/Linux: cp .env.example .env
   ```
   ```ini
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   EMAIL_FROM=LifeDrop <onboarding@resend.dev>
   SUPPORT_EMAIL=you@example.com
   APP_URL=http://localhost:5000
   EMAIL_LINK_SECRET=any-long-random-text
   ```
   With `onboarding@resend.dev` Resend only delivers to **the e-mail address of your Resend account**,
   enough for testing. To e-mail anyone: **Domains → Add domain**, add the DNS records it shows, then use
   e.g. `EMAIL_FROM=LifeDrop <noreply@yourdomain.in>`.
4. Restart: `node server.js`. It prints `E-mail notifications: ON (resend, from …)`.

**SendGrid instead:** `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY=SG.…` (Settings → API Keys, *Mail Send*),
and verify a **Single Sender** to use as `EMAIL_FROM`.
**Gmail (SMTP) instead:** `npm install nodemailer`, `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-letter App Password>`, `EMAIL_FROM=you@gmail.com`.

> 🔒 `.env` holds secrets. It is in `.gitignore`: **never upload it to GitHub** and never put the key in
> frontend JavaScript.

### Test the e-mails
1. **Check the settings:** `npm run email:test -- your-address@example.com`
   → `Result: sent → Accepted by the provider`. Then **open the inbox (and spam folder)**: the e-mail
   is only proven to work when it has actually arrived.
   `failed` = see the reason (wrong key, sender not verified); `not_configured` = `.env` missing.
2. **Registration:** create an account with your own address → the page says "A confirmation e-mail
   was sent to yo***@…" → check the inbox for **"Welcome to Blood Donation and Blood Camp Tracker!"**.
3. **Forms (logged in):** register as a donor, post an emergency request, and (as organizer) add a camp.
   Each page shows a **reference number** and the e-mail note; each e-mail has the same reference.
4. **No duplicates:** double-click the submit button: one record and one e-mail.
5. **Your e-mail history:** Dashboard → **My profile → E-mail notifications** shows recent e-mails and
   their status. Admin view: `http://localhost:5000/api/admin/email-log?key=YOUR_ADMIN_KEY`.
6. **Optional updates:** tick "e-mail me when a new camp is added near my PIN code", then (as admin) approve
   a camp near that PIN → "New blood donation camp near you" arrives, with an Unsubscribe link.
7. **Failure:** put a wrong `RESEND_API_KEY` and submit a form → it is still saved; the page says the
   e-mail could not be sent; `data/email-log.json` shows `failed`.

### The online preview vs. the real server
The hosted Claude preview is a single web page with **no secure server**: it cannot keep an API key
secret, and it may not call outside services, so **it does not send e-mails**. It shows the same
e-mails as **previews** (Profile → E-mail notifications → View preview), clearly marked "not sent".

To send real e-mails online, **deploy the Node.js backend** (it also serves the website):
1. Upload the project to GitHub (`.env` is ignored automatically).
2. On **Render** (render.com → New → Web Service) or **Railway**: root directory `backend`,
   build command `npm install`, start command `node server.js`.
3. Add the environment variables there (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL=https://your-app.onrender.com`,
   `ADMIN_KEY`, `EMAIL_LINK_SECRET`, `SUPPORT_EMAIL`). The server reads `PORT` from the host.
4. Open your `https://…` address: login, forms and e-mails all work there.
> Free hosts may erase local files when they restart. For a real site move `data/*.json` to a database
> (MongoDB Atlas, Supabase Postgres…). Serverless alternative: a function (e.g. Vercel / Netlify /
> Supabase Edge Function) that calls Resend with the key from its environment, called by your backend
> after each save. Never call Resend directly from the browser.

---

## 🏕 Blood Donation Camp Tracker (`camps.html`)

A **Camps** page (in the navbar on every page) to find blood donation camps, blood banks and hospitals.

**Location-based search with map pins and PIN code search**
- **Search by PIN code**: type a 6-digit Indian PIN and click Search (`GET /api/pincode/:pin`).
  Wrong input gets a friendly message ("Please enter a 6-digit PIN code…", "Indian PIN codes don't start
  with 0…", "We couldn't find PIN code …"). Results with the same PIN get a **Same PIN code** label.
- **Search a city, locality or address** (OpenStreetMap). Typing only digits there runs a PIN search.
- **Use my current location**: the browser asks for permission only when you click it. If you deny it,
  the page asks you to search with your PIN code instead.
- **Clear search** resets the location and filters.
- Map pins: 🩸 **green pulsing = ongoing camp**, **red = upcoming camp**, grey = completed/cancelled,
  **red "+" square = blood bank**, **purple "H" square = hospital** (a hospital-run blood bank).
  Click a pin for the name, full address, PIN, date, time, contact, distance, **View details** and
  **Get directions**. Every item sits at its own real coordinates.
- Filters: **Upcoming**, **Ongoing**, Completed, Cancelled, **Blood banks**, **Hospitals**, distance.
  The list and the pins update together whenever the location or a filter changes; with a location,
  everything is sorted nearest first. Blood banks and hospitals need a location or a state (there are
  over 2,600 of them), and at most 60 are listed at once.
- **View details** opens a window with all fields: name, status, date, time, organiser, full address,
  PIN code, latitude/longitude, contact, distance, registration link, last updated, Get directions.
- Loading states (spinner on the buttons), server/geocoder failures and empty results all show a message.

**Where do PIN codes and blood banks come from?**
- PIN / place → coordinates: **OpenStreetMap Nominatim** (backend, no API key). If it can't be reached
  or doesn't know the PIN, the server uses a **built-in PIN list** made from the blood bank directory:
  the exact PIN, otherwise the area of PIN codes with the same first 4 or 3 digits (marked "approximate").
- Blood banks and hospitals: the official National Health Portal directory (`blood-banks.json`).
  "Hospital" means a blood bank whose official name shows it is run by a hospital or medical college
  (`backend/utils/places.js`). **Blood stock is never shown**: the page says to call first.

**For visitors**
- Map (Leaflet + OpenStreetMap) with a marker per camp: **green pulsing = ongoing**,
  **red = upcoming**, grey = completed / cancelled. Click a marker or card for the details.
- Find a location by **searching a city, address or PIN code**, **Use my current location** (GPS), or
  **State + City** dropdowns (choosing only a state lists that state's camps).
- Distance filter: 5 / 10 / 25 / 50 km, more than 50 km, all distances (+ 75 / 100 / 150 km when
  searching farther). Status filter: Upcoming, Ongoing, Completed, Cancelled. Sort by date or distance.
- Each card: camp name, organiser (and type), full venue address, city, state, PIN, date, start and end
  time (IST), status, **contact only if verified**, registration link (if any), distance, **Get directions**.
- If nothing is near: *"No verified blood donation camps found nearby. Try expanding your search or
  selecting another city."* with buttons to search farther.
- "Camp information last updated …" is shown under the list. The page refreshes every 5 minutes, so
  a camp moves from Upcoming → Ongoing → Completed by itself.

**Status is calculated, never typed in.** `backend/utils/camps.js` compares the camp's date, start and
end time (Indian time) with the current time. A camp with a missing or wrong schedule is "unscheduled"
and is never shown as ongoing. A cancelled camp stays "Cancelled" with the reason.

**For organisers: Register a Blood Donation Camp** (form at the bottom of the page)
- Camp name, organiser and type, venue address, state, city, PIN, date, start/end time, contact person,
  phone/e-mail, registration link, coordinates (or **Find the venue's coordinates** from the address).
- Saved with `"reviewStatus": "pending"`. **It is NOT shown publicly** until an admin approves it.

**For the admin: Organiser review**
- Open "Organiser review (admin only)" at the bottom of the Camps page and enter the admin key.
- **Approve** (the venue's latitude/longitude are required; tick "I checked the contact details" to
  show them publicly), **Reject**, **Mark as cancelled** (with a reason) or **Save new date/time**.

### Configuration: the admin key
The admin key protects the review actions. Set your own before showing the site to anyone:
```bash
# Windows (Command Prompt)
set ADMIN_KEY=my-secret-key
node server.js

# Mac / Linux
ADMIN_KEY=my-secret-key node server.js
```
Without it the key is `change-this-admin-key` and the server prints a warning.

### Where do real camps come from?
There is **no free public API for blood donation camps in India**. The government's
[e-RaktKosh](https://eraktkosh.mohfw.gov.in/) portal lists camps on its website but does not offer an
API. So this project uses **its own database** (`backend/data/camps.json`), filled by:
1. organisers using the "Register a Blood Donation Camp" form, checked by the admin, or
2. the admin adding camps they have confirmed (e.g. from e-RaktKosh, a hospital or a blood bank).

**Demo camps:** `npm run seed` adds 12 camps labelled **"SAMPLE DATA — NOT A REAL CAMP"** with a
fictional organiser, a city-centre test location, a fictional phone number `00000 009xx` shown as
"demo number, not callable", the real PIN code of the area (taken from the nearest listed blood bank)
and dates **relative to today**
(so you can see Upcoming, Ongoing, Completed and one Cancelled camp). They say "Do not travel to this
camp". Run `npm run seed` again any day to move their dates. Real camps are never deleted by the seed.

| Needed for the camps | What this project uses |
|---|---|
| Database | `backend/data/camps.json` (use MongoDB/MySQL for a real website) |
| Map | Leaflet + OpenStreetMap (free, no key) |
| Address / PIN → coordinates | OpenStreetMap Nominatim through `/api/places` and `/api/pincode/:pin` (free, no key, 1 request/second), with a built-in PIN list as fallback |
| Blood banks + hospitals on the map | `blood-banks.json` through `/api/map-places` |
| Directions | Google Maps link (no key) |
| Real camp listings | Your own verified submissions. No external API |

### Camp API
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/camps?lat=&lng=&minKm=&maxKm=&status=upcoming,ongoing&sort=distance\|date&state=&city=&q=` | Approved camps only, with `status` and `distanceKm` |
| GET | `/api/pincode/575001` | PIN code → `{ lat, lng, label, exact, source }` (400 = invalid, 404 = not found) |
| GET | `/api/map-places?lat=&lng=&minKm=&maxKm=&kinds=bank,hospital&state=&city=&limit=60` | Blood banks and hospitals for the map, nearest first |
| POST | `/api/camps` | Organiser submits a camp → `pending` |
| GET | `/api/camps/review?key=ADMIN_KEY` | Admin: pending + approved camps with full details |
| POST | `/api/camps/:id/review` | Admin: `{ key, action: approve \| reject \| cancel \| reschedule, ... }` |

### Testing the map pins and PIN code search
1. `npm run seed`, then `node server.js`, and open **http://localhost:5000/camps.html**.
2. Type **1234** → Search: "Please enter a 6-digit PIN code". Type **057500**: "don't start with 0".
   Type **999999**: "We couldn't find PIN code 999999…".
3. Type **575001** → Search: the map zooms to Mangaluru; the list shows the ongoing and upcoming sample
   camps, blood banks (red "+") and hospitals (purple "H"), nearest first, with **Same PIN code** labels.
4. Click a pin → pop-up with address, PIN, date/time, contact, **View details**, **Get directions**.
   Click **View details** on a card → the details window (close with ×, Esc or a click outside).
5. Untick **Hospitals**, then **Blood banks**, then **Upcoming**: the list and the pins change each time.
6. Click **Clear search**: back to all camps across India.
7. Click **Use my current location** and **Block**: the message asks you to use your PIN code instead.
   Click again and **Allow**: results near you, sorted by distance.
8. Search a locality such as **Hampankatta Mangaluru** (needs internet for OpenStreetMap) and pick it.

### Testing the camp tracker
1. `npm run seed`, then `node server.js` (or `ADMIN_KEY=test-key node server.js`).
2. Open **http://localhost:5000/camps.html**: upcoming and ongoing demo camps across India, soonest first.
3. Tick **Completed** and **Cancelled** to see all four statuses (the Hyderabad demo camp is cancelled).
4. Choose **Karnataka → Mangaluru → Show camps near this city** (or allow GPS): the nearest camps
   with distances; the one happening today has a green pulsing marker.
5. Search **Panaji** (or choose Goa → Panaji) with **Within 25 km**: you get "No verified blood donation
   camps found nearby…". Click **All distances** to see the nearest camps, sorted by distance.
6. Fill in **Register a Blood Donation Camp** and send it. It does **not** appear in the list.
7. Open **Organiser review**, enter the admin key, add coordinates if empty, tick the contact box, click
   **Approve**: the camp now appears, with its contact details.
8. Click **Mark as cancelled** or change the date and **Save new date/time**: the card updates.

## 🎓 Educational demo profiles (universal donors, recipients, rare groups)

A separate section at the bottom of **Find Donor** (`find-donor.html#demo-profiles`) shows
**15 fictional profiles** that explain blood compatibility:

| Category | Blood group | Profiles |
|---|---|---|
| Universal Red-Cell Donor (ABO/Rh) | O− | Tanvi Joshi (Pune), Harish Nair (Thiruvananthapuram), Pooja Rawat (Dehradun), Imran Siddiqui (Kanpur), Lalitha Reddy (Visakhapatnam), Gurpreet Sandhu (Ludhiana) |
| Universal Red-Cell Recipient (ABO/Rh) | AB+ | Ritu Agarwal (Indore), Sameer Kulkarni (Nagpur), Ayesha Rahman (Guwahati), Deepak Mohanty (Bhubaneswar), Neha Chauhan (Ahmadabad) |
| Rare Blood Group — Educational Demo | Oh (Bombay phenotype, hh) | Prakash Patil (Greater Mumbai), Shalini Rao (Mangaluru), Farhan Shaikh (Surat) |
| Rare Blood Group — Educational Demo | Rh-null | Anil Varghese (Kochi) |

How they are kept safe and accurate:
- Stored in **`backend/data/education-profiles.json`**, NOT in `donors.json`. So they are never in
  the distance search, the map, the donor list or the homepage numbers. They are reference data,
  read by `GET /api/education-profiles`.
- Every card shows **"DEMO ONLY — NOT A REAL DONOR"**, a non-callable phone (`00000 00201` to
  `00000 00215`) and "No donation history or medical eligibility is claimed".
- Locations are city-centre **test locations** (`testLatitude`/`testLongitude`), never plotted.
- A "Read this first" box explains that **"universal" means red cells in the ABO/RhD system only**:
  O− plasma is not universal (AB plasma is), other antigens (Kell, Duffy, Kidd) and antibodies still
  matter, and real compatibility is decided by a blood bank (grouping, antibody screen, crossmatch).
- Rare-group profiles say **"Educational example: requires laboratory confirmation"** and are
  described as **not universal**. A Bombay-phenotype person looks like group O in routine tests but
  can receive only Bombay blood.

API: `GET /api/education-profiles?category=universal-donor|universal-recipient|rare&q=words`

### Testing the educational profiles
1. Open **Find Donor**, click "Learn about universal donors and rare blood groups ↓" (or go to
   `http://localhost:5000/find-donor.html#demo-profiles`). You'll see 15 cards.
2. Choose each **category**: Universal Donor → 6, Universal Recipient → 5, Rare Blood Group Demo → 4.
3. Search `O-`, `AB+`, `Guwahati` (city), `Gujarat` (state), `Bombay`, `universal donor` (category).
4. Check that every card shows "DEMO ONLY — NOT A REAL DONOR", and rare cards show the lab-confirmation note.
5. Run a nearby search anywhere: none of these 15 people appear in the results or on the map.
6. Open `find-donor.html?category=rare#demo-profiles` to link straight to one category.

### Testing the location search
- Tick **Also show compatible donor groups** with blood group A+ to see O+/O- donors too.

### Testing the GPS map and place search (needs internet)
1. Open **Find Donor**. In **Search any place**, type `Kadri, Mangaluru` → **Search**.
   You'll see blood banks matching "Kadri" and places from OpenStreetMap. Click the place:
   a blue pin appears, its address/city/state/PIN is shown and the dropdowns change to Karnataka → Mangaluru.
2. Search `575001` (a PIN code) or `Wenlock` (a blood bank name) and pick a result.
3. Search nonsense like `zzqqxx`: you get "No place found…".
4. Click **Use my current location (GPS)** and allow it: blue dot, accuracy circle and your address.
   Try again with the permission **blocked** (lock icon in the address bar): the page tells you to search instead.
5. Click anywhere on the map: results update around that point.
6. Turn off Wi-Fi and search again: blood bank names still match, and a message says OpenStreetMap can't be reached.

**Testing GPS on your phone:** your phone can't use `localhost`. Run a free HTTPS tunnel such as
`npx localtunnel --port 5000` or ngrok, and open the `https://…` address it gives on your phone.

### More testing tips
On the Find Donor page choose **Karnataka → Mangaluru → Set this city as my location**, then try the
5, 10, 25 and 50 km filters: you'll see the demo donor Sneha Kamath and the real Mangaluru blood
banks. Choose **More than 50 km** to see Nikhil Shenoy (Udupi, about 53 km).

In the **All registered donors** section, choose a state only (e.g. Delhi) to see the whole state,
or a state and city for an exact match.

---

## 🧭 Road navigation on the camp map

The **Find Camps** map (`camps.html`) has GPS-style road directions built into the same Leaflet map:

| Feature | How it works |
|---|---|
| **City markers** | Zoomed out (zoom ≤ 8) the map shows one round marker per city that has camps or ≥ 5 blood banks (green border = has camps). Click one to load that city's camps, blood banks and hospitals. Data: `GET /api/city-hubs`. |
| **Camp / bank pins** | Click a pin → popup with name, address, city, state, **View details**, **Show route**, **Get directions**. |
| **Use my location** | Browser Geolocation API (asks permission). Your position is only used in your browser and for the route request; it is not saved. |
| **Show route** | `GET /api/route?from=lat,lng&to=lat,lng` → the server asks **OSRM** for the real road route and returns the line, distance (km) and driving time. The map draws the route, highlights the destination and zooms to fit it. |
| **Distance & time** | From OSRM. Time is an **estimate without live traffic**. |
| **Get Directions** | Opens Google Maps: `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=driving` (origin is left out if location is unknown, so Google uses the phone's location). |
| **Clear / pick another** | **Clear route** or **×** in the floating route panel, or press **Show route** on another camp. |
| **Quick filter** | The box above the results filters by camp name, city, state or PIN code. |

**If routing fails** (no internet, OSRM down, no road found, location denied) no line is drawn. The panel says
what went wrong, shows the straight-line distance clearly labelled *"not a road distance"*, and offers
**Get Directions** in Google Maps. The site never draws a fake route, fake GPS movement or fake traffic.

**Server side** (`backend/routes/route.js`): checks the points are inside India, limits each visitor to
30 route requests per 10 minutes, caches 300 recent routes, keeps ≥ 1.1 s between calls to OSRM
(the public demo server allows 1 request/second) and sends a User-Agent. Set `OSRM_URL` in `.env`
to use your own OSRM server. Route data © OpenStreetMap contributors.

**Online preview link:** the hosted preview cannot contact outside services, so there the route
panel explains this and offers Google Maps. Real road routes work when you run this project with
`npm start` on a computer with internet, or host it on Render.

**Test it:** open Find Camps → zoom out → click a city marker → press **Show route** on a camp →
allow location. Then try: deny location (message + Google Maps button), turn Wi-Fi off (helpful
error, no line drawn), **Clear route**, and the Google Maps button (opens with both points).

---

## 📊 Dashboard (public statistics, `statistics.html`)

**Dashboard** is now in the main menu on every page (Home · Dashboard · Find Donor · Camps · Become a Donor ·
Emergency · Login). It shows **aggregated numbers only**: no names, phone numbers, e-mails or exact locations.
(Logged-in users still have their personal **My Dashboard** under the account link; the private admin
dashboard stays at `admin.html`.)

| Section | What it shows |
|---|---|
| 6 statistic cards | 🩸 Registered donors · 🆘 Blood requests · ❤️ Successful donations · 🤝 People helped / requests fulfilled · 🏕️ Upcoming camps · 👥 Registered users, each with "+N this month" |
| Blood Donation Overview (pie) | Registered donors, requests not fulfilled yet, fulfilled requests, successful donations: legend with values and %, % on each slice, exact value on hover/tap |
| Monthly Blood Donation Activity (bar) | New donors, requests received, successful donations, requests fulfilled. **Last 6 months** or **by year**, with axis titles and tooltips |
| Blood group analysis | Donors per blood group + the most common group (ties are shown together) |
| Location statistics | Top cities or states by donors, with requests and fulfilled requests, plus "most donors" / "most fulfilled" |

**Counting rules** (`computePublic()` in `js/analytics-core.js`, shared with the server):
* Duplicates are removed: the same phone number registered twice counts as **one** donor; the same request
  (phone + blood group + hospital + day) posted twice counts once; accounts are counted by e-mail.
* A donation counts as successful **only when marked completed** (verified in the admin dashboard).
* Fulfilled requests are counted **separately** from all requests; in the pie, requests are split into
  "not fulfilled yet" and "fulfilled", so no request is counted twice. Slices are records, not separate people.
* Sample (demo) records are never counted as real.

**Data:** `GET /api/public-stats?view=monthly|yearly&source=real|demo`. It is connected to the existing forms:
registering as a donor, posting a request, marking it fulfilled, creating an account, approved camps and
completed donations all change the numbers (the page refreshes every minute and when you come back to the tab).
On a fresh install with no records yet, the page shows **clearly labelled demo data** ("DEMO DATA: sample numbers
for demonstration only") with a button to switch to the real records, so demo numbers are never shown as real achievements.

**Online preview link:** the Dashboard is at `#stats`. There, "records in this browser" are the donors, requests and
accounts saved in that browser, plus camps approved on the page.

**Code:** `frontend/statistics.html`, `frontend/js/stats.js`, `css/style.css` sections 28 and 29 (menu with 7 items:
one line on desktop, hamburger menu below 1040 px).

---

## 📊 Admin Analytics Dashboard (`admin.html`)

A private dashboard for the LifeDrop team: impact charts, emergency analytics, record management and
CSV reports. It is **not linked** anywhere on the public website.

### 1. Create the first admin (on the server, once)

```bash
cd backend
npm run create-admin        # asks for name, e-mail and password (min 10 characters, letters + numbers)
```

Admins are stored in `backend/data/admins.json` (scrypt password hash, never the password).
Nobody can sign up as an admin on the website, and normal donor / finder / organizer accounts can't
log in to the dashboard. On a hosting service (no terminal needed) set the environment variables
`ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 10 characters) and optionally `ADMIN_NAME`: the server creates that
admin at start-up if it does not exist yet (see **DEPLOYMENT.md**).

### 2. Log in

Open **http://localhost:5000/admin-login.html**, then you land on `admin.html`.

| Security | How |
|---|---|
| Separate admin session | HttpOnly, SameSite=Strict cookie `lifedrop_admin`, 8 hours; only a SHA-256 of the token is stored |
| Server-side checks | `admin.html` redirects to the login page without an admin session; **every** `/api/admin/...` route checks the session again (`utils/admin-auth.js`) |
| Brute force | 5 wrong passwords lock that e-mail for 15 minutes |
| Cross-site requests | changes are refused when the `Origin` is another website |
| Audit log | `data/admin-audit.json`: who did what and when (no personal details) |
| Private data | names and phone numbers only in the admin tables (phones masked until clicked); charts and CSV contain **counts only**; exact donor locations are never sent |

### 3. What's on the dashboard

| Section | Contents |
|---|---|
| Key statistics | 🩸 donors · ❤️ donations (verified) · 🤝 people helped (confirmed) · 🆘 requests · ✅ fulfilled · ⏳ pending · 🏥 approved camps · 📍 available donors, with "this month vs last month" when dates exist |
| Impact charts | **Our Life-Saving Impact** doughnut (helped / fulfilled awaiting confirmation / pending / not fulfilled), blood groups requested (pie), donor activity |
| Trends | monthly donations (bar), people helped over time (line), requests vs fulfilled (bar), blood camp activity (camps held + camp donations), yearly impact with a year picker |
| Emergency analytics | total, matched, fulfilled, not fulfilled, pending, **average response time** (from real timestamps only), **success rate**, chart by urgency |
| Our Impact in Saving Lives | people helped, confirmed matches, verified donations, camps held, cities covered, requests fulfilled, a yearly timeline and a growth chart |
| Manage | donors (search, filter, **verify**), requests (**confirm help received**, close as not fulfilled, reopen), record **confirmed matches** (compatible blood groups only) and **donations** (verify), **approve / reject camp submissions** |
| Reports | **Export CSV** with the current filters (totals only, safe against spreadsheet formula injection) |

Filters (date range, year, month, city, blood group) recalculate every number and chart.
Loading spinners, empty states ("No data for these filters yet") and error messages with **Try again** are built in.

### 4. Honest counting rules

* **People helped** = requests where an admin **confirmed** with the requester or hospital that the patient received blood.
  Posting a request or registering as a donor is never counted as help.
* **Successful match** = a donor-recipient match an admin **confirmed**. A match does **not** prove that a transfusion took place.
* **Completed donation** = counted only when **verified** against a blood bank or camp record.
* Sample (demo) donors, requests and camps are never counted as real.

### 5. Real records vs demo data

The switch at the top chooses the data source:

* **Real records**: your JSON database (`donors.json`, `requests.json`, `camps.json`, `matches.json`, `donations.json`).
  On a fresh install this is empty: the dashboard says so instead of inventing numbers.
* **Demo sample data**: two years of generated, clearly labelled sample data (no names or contacts) for
  presentations. A striped "DEMO SAMPLE DATA. These numbers are not real." banner is always shown.

**Code:** `backend/routes/admin.js` (API), `backend/utils/admin-auth.js` (admin login),
`frontend/js/analytics-core.js` (all calculations, shared by server and browser),
`frontend/js/admin.js` (dashboard UI, Chart.js 4.4.0 from cdnjs), `css/style.css` section 26.

**Online preview link:** the dashboard is at `#admin` (not in the menu). Only people who can edit the page in
Claude can open it (checked by Claude, no password in the page). It opens on demo data; "real records" there
are the records saved in that browser plus camps approved on the page.

**Moving to a real database later (MySQL / MongoDB / Firebase):** keep the same record fields, replace
`readData()` in `routes/admin.js` with database queries, and the analytics code stays the same.

---

## 💌 Feedback form ("❤️ Help Us Save More Lives!")

A short, anonymous form at the bottom of the home page (`index.html#feedback`), also linked as
**Give feedback** in the footer. Four one-tap questions plus an optional suggestion (max 200 characters):

| # | Question | Answers |
|---|---|---|
| 1 | What did you use our website for? | 🩸 Finding a blood donor · ❤️ Requesting blood · 🤝 Registering as a donor · 🏥 Finding a blood camp or blood bank |
| 2 | Did our website help you? | ✅ Yes · 👍 Partially · 🔍 Not yet |
| 3 | How easy was the website to use? | 😍 Very easy · 🙂 Easy · 😐 Average · 😕 Difficult |
| 4 | Would you recommend our website to others? | 💚 Definitely · 👍 Maybe · 👎 No |
| 5 | Any suggestions? (optional) | free text, 200 characters |

* Selectable cards are real radio buttons (keyboard and screen-reader friendly); answers can be changed until you submit.
* Questions 1 to 4 are checked in the browser **and** on the server; the first missing answer is highlighted.
* **Saved** to `backend/data/feedback.json` through `POST /api/feedback`. No name, e-mail, phone, IP address or
  location is stored (a short per-IP limit of 5 answers per 10 minutes is kept in memory only).
* **When it appears:** at the end of the home page, and as a small dismissible card after a process is finished:
  after registering as a donor and after marking a request as fulfilled. It is **never** shown while someone is posting
  an emergency request or looking for donors. Once a visitor has sent feedback, the card is not shown again.
* **Admin dashboard → Feedback:** total responses, "website helped" %, "easy to use" % and "would recommend" %,
  four charts, and the latest written suggestions (admins only; suggestions never appear in charts or the CSV).
  The demo data includes sample answers, but never sample written suggestions.

**Code:** `frontend/js/feedback.js`, `css/style.css` section 27, `POST /api/feedback` in `server.js`.

---

## 🔌 REST API

Base URL: `http://localhost:5000/api`

Road navigation: `GET /api/route?from=lat,lng&to=lat,lng` → `{ distanceKm, durationMin, coordinates, source }`
and `GET /api/city-hubs` → `{ count, hubs: [{ city, state, lat, lng, camps, demoCamps, banks }] }`.

| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | `/api/donors` | All donors. Optional `?bloodGroup=O%2B&state=Karnataka&city=Udupi` (exact match) and `?q=meera` (search name, blood group, city, state) |
| GET | `/api/search?lat=&lng=&minKm=&maxKm=&bloodGroup=&compatible=&type=` | **Donors + blood banks** by distance, nearest first (see below) |
| GET | `/api/bloodbanks?state=&city=&district=` | Blood banks registered in a state/city (no location needed) |
| GET | `/api/places?q=` | **Search any place**: address, city, state, 6-digit PIN code or blood bank name |
| GET | `/api/places/reverse?lat=&lng=` | Address, city, district, state and PIN code of a point |
| GET | `/api/donors/nearby?lat=&lng=&radius=&bloodGroup=` | Donors within `radius` km (older endpoint, still works) |
| GET | `/api/donors/:id` | One donor |
| POST | `/api/donors` | Register a donor |
| PUT | `/api/donors/:id` | Update a donor |
| DELETE | `/api/donors/:id` | Delete a donor |
| GET | `/api/requests` | Emergency requests. Optional `?status=Open&bloodGroup=O-` |
| POST | `/api/requests` | Create an emergency request |
| PATCH | `/api/requests/:id/fulfill` | Mark a request as fulfilled |
| DELETE | `/api/requests/:id` | Delete a request |
| GET | `/api/stats` | Counts for the homepage |
| GET | `/api/locations` | All 36 states/UTs with city counts |
| GET | `/api/locations?state=Goa` | Cities of one state (name, district, LGD code) |

> ⚠️ In a URL, `+` means "space", so send `A+` as `A%2B` (`encodeURIComponent("A+")`). The server also fixes `A ` back to `A+` just in case.

**Example: location search**

```
GET /api/search?lat=12.9141&lng=74.8560&maxKm=10&bloodGroup=A%2B&compatible=true
```

| Parameter | Meaning |
|---|---|
| `lat`, `lng` | the user's location (from Geolocation or the chosen city) |
| `maxKm` | `5`, `10`, `25`, `50`, `75`, `100`, `150` or `any` |
| `minKm` | `50` for "More than 50 km" (default `0`) |
| `bloodGroup` | patient's blood group (optional) |
| `compatible` | `true` = also donors of compatible groups |
| `type` | `all`, `donors` or `bloodBanks` |

```json
{
  "donors": [
    { "type": "donor", "name": "Sneha Kamath", "bloodGroup": "O-", "city": "Mangaluru",
      "distanceKm": 0.5, "approxLatitude": 12.87, "approxLongitude": 74.84,
      "isDemo": true, "demoLabel": "DEMO — NOT A REAL DONOR", "...": "..." }
  ],
  "donorsWithin50": 5,
  "nearestDonorKm": 0.5,
  "bloodBanks": [
    { "type": "bloodBank", "name": "A. J. Hospital and Research Centre Blood Bank",
      "address": "Kuntikana, NH- 66", "phones": ["0824 2225535"], "distanceKm": 2,
      "lat": 12.899478, "lng": 74.845975, "location": "verified" }
  ],
  "bloodBanksTotal": 7
}
```
Note that donors have **no** `latitude`/`longitude`, only a rounded approximate point.

**Example – register a donor (POST /api/donors)**

```json
{
  "name": "Your Name",
  "age": 21,
  "bloodGroup": "O+",
  "phone": "<your 10-digit mobile number>",
  "state": "Karnataka",
  "city": "Mangaluru",
  "district": "Dakshina Kannada",
  "latitude": 12.9141,
  "longitude": 74.8560,
  "availability": "Available",
  "otherInfo": ""
}
```

---

## ❓ Do I need a database, a map service or an API key?

| Part | What this project uses | Needed? |
|---|---|---|
| Database | JSON files in `backend/data` (donors, requests, blood banks) | A database server is **not** needed for the project. For a real website use MongoDB/MySQL. |
| Distance | Haversine formula in `utils/haversine.js` | No external API |
| User location (GPS) | Browser Geolocation API | No API. The browser asks the user's **permission** and works only on a **secure page**: `http://localhost:5000` or an `https://` address. On `http://192.168.x.x` (e.g. testing on your phone over Wi-Fi) or a double-clicked HTML file it is blocked, and the page says so |
| Map | Leaflet.js + OpenStreetMap tiles | Free, no API key, needs internet |
| Address / PIN / city → map position (geocoding), and back (reverse geocoding) | OpenStreetMap **Nominatim**, called by the backend (`backend/utils/geocoder.js`) | **No key.** Free, but its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) allows max 1 request per second and asks for an app name. The backend waits between requests, caches results and sends a User-Agent: **put your e-mail in `USER_AGENT`** in `geocoder.js`. For a busy public site use a paid provider (LocationIQ, MapTiler, Google). Only `geocoder.js` would change |
| Directions | A normal Google Maps link (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) | No API key; it opens Google Maps |
| Blood banks | Official directory, saved in `blood-banks.json` | No API at run time |
| Blood stock | **Not available** in this project. Links to [e-RaktKosh](https://eraktkosh.mohfw.gov.in/), the Government's blood stock portal | Real stock would need e-RaktKosh / hospital data access |

---

## 🔒 Donor privacy

- The donor's exact latitude/longitude is saved **only on the server** (`data/donors.json`) and used
  only to calculate distances.
- Every API response passes donors through `publicDonor()` in `utils/privacy.js`, which removes the
  exact coordinates and adds `approxLatitude`/`approxLongitude` rounded to 2 decimals (a ~1.1 km grid).
- Distances to donors are rounded to the nearest 0.5 km, so the exact position can't be calculated
  from several searches.
- The map shows a donor as a shaded **area**; "Directions to area" goes to that area, and the card
  asks the user to call and agree on a meeting place (usually the hospital).
- No home addresses are collected. Only the phone number, which donors agree to share, is shown.
- The edit page also only receives the approximate location. The saved location changes only if the
  donor moves the pin (`locationChanged: true`).
- The searcher's own location is used in their browser and sent only as the search point. It is not saved.
- For a real website you would also add **login**, so only a donor can edit or delete their own record.

---

## 🏥 The blood bank dataset

**Source:** "Blood Bank Directory", National Health Portal (Ministry of Health & Family Welfare),
published on the [Open Government Data Platform](https://data.gov.in) under the Government Open Data
License - India. Copy used: [atmajitg/bloodbanks](https://github.com/atmajitg/bloodbanks) (2,820 blood banks).

`tools/build-bloodbanks.py` cleans it into `backend/data/blood-banks.json` and **checks every location**:

| Location | Meaning | Used for distance? |
|---|---|---|
| `verified` (2,621) | passed all checks | ✅ |
| `approximate` (16) | several banks share one point (a city centre) | ✅ marked "Approximate location" |
| `unverified` (101) | e.g. same point used in different districts, or far from its own district | ❌ directions use the address |
| `missing` (82) | no coordinates | ❌ |

Limits to mention in the viva: the directory is several years old, so phone numbers or addresses may
have changed, and it has **no blood stock information**. That's why every blood bank card says
"Blood group stock is not listed here. Call the blood bank or check e-RaktKosh".

To refresh it:
```bash
git clone --depth 1 https://github.com/atmajitg/bloodbanks bb
python tools/build-bloodbanks.py bb/blood-banks.csv
```
(or download the latest "Blood Bank Directory" CSV from data.gov.in. It has the same columns.)

---

## 🗺 The State & City dataset

**Source:** India's [Local Government Directory (LGD)](https://lgdirectory.gov.in), the official
Government of India register of states, districts and local bodies. This project uses the CSV dump
of LGD from December 2022 published at
[planemad/india-local-government-directory](https://github.com/planemad/india-local-government-directory):

| LGD file | Used for |
|---|---|
| `administrative/1-state.csv` | 28 States + 8 Union Territories |
| `municipal/urban-local-body.csv` | every urban local body = the city list |
| `municipal-directory.csv` | the district of each city |
| `administrative/3-subdistrict.csv` | Lakshadweep only (it has no urban local body, so its 10 islands are listed) |

`tools/build-locations.py` turns those files into `frontend/js/india-locations.js`. It only tidies
names, it never invents places:
- ALL-CAPS / lowercase names are fixed (`MANGAON` → `Mangaon`)
- the body type is removed (`Municipal Council Kathua` → `Kathua`, `Wokha Town Council` → `Wokha`)
- a city and a cantonment with the same name in the same district (e.g. two "Pune") appear once
- four bodies listed only as an abbreviation get their place name: `BBMP` → `Bengaluru (BBMP)`,
  `GNIDA` → `Greater Noida (GNIDA)`, `YEIDA` → `Yamuna Expressway (YEIDA)`, `BKT` → `Bakshi Ka Talab`

Names follow LGD, so some differ from everyday spelling: **Ahmadabad**, **Haora** (Howrah),
**Bantval**, **Greater Mumbai**, **Hubballi-Dharwad**. The search box matches any part of a name, so "mumbai" finds Greater Mumbai.
Delhi is listed by its 2022 municipal bodies (New Delhi, North Delhi, South Delhi, East Delhi,
Delhi Cantonment). Places that are not urban local bodies (e.g. Noida, which is run by a
development authority) are not in the list.

**Updating to newer LGD data** (new districts and municipalities are added every year):
```bash
git clone --depth 1 https://github.com/planemad/india-local-government-directory lgd
python tools/build-locations.py lgd
```
For the very latest LGD files, see https://ramseraph.github.io/opendata/lgd/ (daily archive). Save the
same CSVs into a folder with the layout above and run the script on it.

**Viva tip:** the data file is plain JavaScript (`const INDIA_LOCATIONS = [...]`), loaded with a
normal `<script>` tag by the pages and with `require()` by `server.js`, so the frontend dropdowns
and the backend validation always use the same list.

---

## 📐 How the Haversine formula works

The Earth is a sphere, so we can't use simple Pythagoras on latitude/longitude. Haversine gives the great-circle distance:

```
a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)
c = 2 · atan2(√a, √(1−a))
d = R · c        (R = 6371 km)
```

See `backend/utils/haversine.js`. The `/nearby` route computes this for every donor, keeps those with `distance ≤ radius`, and sorts ascending.

---

## 🛠 Troubleshooting

| Problem | Fix |
|--------|-----|
| "Cannot reach the server" | Make sure `node server.js` is running in the `backend` folder |
| `EADDRINUSE: port 5000` | Another app uses port 5000. Close it or change `PORT` in `server.js` **and** `API_URL` in `frontend/js/common.js` |
| Location button says permission denied | Allow location in the browser's address bar, or type a city instead |
| Map is grey | Check your internet connection (map tiles come from OpenStreetMap) |
| "The map search service could not be reached" | Internet is needed for address search; blood bank names and PIN codes from the directory still work |
| "Location only works on a secure page" | Open `http://localhost:5000` (not the file, not `http://192.168…`) or use an https tunnel |
| Want fresh demo data | `npm run seed` then restart the server (real donors are kept) |

---

## 💡 Ideas for extension
- Replace the JSON files with MongoDB or MySQL
- Login for donors so only they can edit their own record
- Send SMS/email alerts to nearby donors when an emergency request is created
- Track "last donation date" and hide donors who donated in the last 3 months
