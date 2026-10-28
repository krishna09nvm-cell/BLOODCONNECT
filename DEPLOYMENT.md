# 🌐 Deploying LifeDrop: put the website online

This guide covers the **complete LifeDrop project** (the Node.js version in this folder). It tells you how to run it on
your computer and how to host it so that anyone can open it with a normal public link, without Claude.

> The `claude.ai/artifact/...` link is only an online *preview* that runs inside Claude. The real website is this
> project. It is one Node.js server that serves the pages **and** the REST API.

---

## 1. What the project is made of

| Part | Technology | Notes |
|---|---|---|
| Front end | Plain **HTML5, CSS3, JavaScript (ES6)**, no framework or build step | `frontend/` has 15 pages, `css/style.css` and 21 scripts in `js/` |
| Map | **Leaflet 1.9.4** + OpenStreetMap tiles | loaded from `unpkg.com` (CDN) |
| Charts | **Chart.js 4.4.0** | loaded from `cdnjs.cloudflare.com` (CDN) |
| Fonts | Bricolage Grotesque, Plus Jakarta Sans | Google Fonts |
| Back end | **Node.js (18 or newer; tested on 22) + Express.js 5** | `backend/server.js`, `backend/routes/`, `backend/utils/` |
| npm dependencies | `express` 5.2.1, `cors` 2.8.6 | exact versions are fixed in `backend/package-lock.json` |
| Storage | **JSON files** (no database server) | saved in `backend/data/` or in the folder named by `DATA_DIR` |
| Outside services (no key needed) | Nominatim (place search), OSRM (road routes), OpenStreetMap tiles | free public servers, light use only |
| Optional services (key needed) | Resend / SendGrid / SMTP (e-mail), Anthropic Claude API (AI assistant) | turned off until you add keys |

**Deployment files in this folder:**

| File | Purpose |
|---|---|
| `render.yaml` | One-click "Blueprint" for Render |
| `Dockerfile`, `.dockerignore` | Container image for Railway, Fly.io or any Docker host |
| `backend/.env.example` | List of all settings (copy it to `backend/.env` on your computer) |
| `GET /api/health` | Health-check URL for the host (returns `{"ok":true}`) |

---

## 2. Run it on your computer

1. Install **Node.js LTS** (version 18 or newer) from https://nodejs.org.
2. Unzip the project, open a terminal in the `backend` folder and run:
   ```bash
   npm install          # installs express and cors
   npm start            # starts the server
   ```
3. Open **http://localhost:5000** in your browser.
4. Optional, but needed for the admin dashboard: create an admin account:
   ```bash
   npm run create-admin
   ```
   Then open http://localhost:5000/admin-login.html.
5. Optional: copy `backend/.env.example` to `backend/.env` and fill in e-mail or AI keys. `.env` is secret and is never uploaded.

GPS location only works on `http://localhost` or an `https://` address. It does not work on `http://192.168.x.x`.

---

## 3. ⚠️ Important: where your data is saved

LifeDrop saves accounts, donors, requests, camps and feedback as **files**. On a hosting service, files survive
restarts **only on a persistent disk (volume)**:

| Option | Cost | Do the data survive? | Best for |
|---|---|---|---|
| **Render – Free** | $0 | ❌ **No.** Everything registered is lost on every restart, redeploy or spin-down. Free services sleep after 15 minutes with no visitors and take about 1 minute to wake up. | A demo or viva |
| **Railway – Hobby + Volume** (recommended) | about $5/month | ✅ Yes, the volume is mounted at `/data` | A real public website |
| **Render – paid instance + Disk** | about $7/month + $0.25/GB disk | ✅ Yes | A real public website |

Prices and limits are set by the hosting companies and can change; check their pricing pages. With **Render Free**,
the demo donors and demo camps come back after each restart, but real sign-ups do **not**. Tell your users this, or
choose a plan with a disk.

---

## 4. First: put the code on GitHub

Both hosts deploy from a GitHub repository (yours is `ankushshetty2007-code/Blood-Donation`).

1. Unzip this project and replace the files in your repository with these files, keeping the same folder layout
   (`backend/`, `frontend/`, `render.yaml`, `Dockerfile`, …).
2. **Never upload** `backend/.env` or the files in `backend/data/` that hold real records (users, donors, sessions, …).
   `.gitignore` already excludes them.
3. Commit and push:
   ```bash
   git add .
   git commit -m "Prepare LifeDrop for deployment"
   git push
   ```

---

## 5A. Deploy on Railway (data is kept, recommended)

1. Go to https://railway.com, sign in with GitHub and choose **New Project → Deploy from GitHub repo**, then pick your repository.
   Railway finds the `Dockerfile` and builds it automatically.
2. Open the service, go to **Variables** and add:

   | Variable | Value |
   |---|---|
   | `ADMIN_EMAIL` | your admin e-mail |
   | `ADMIN_PASSWORD` | a strong password (10+ characters, letters + numbers) |
   | `ADMIN_NAME` | e.g. `Admin` |
   | `EMAIL_LINK_SECRET` | any long random text |
   | `ADMIN_KEY` | any long random text |

   `NODE_ENV=production`, `PORT` and `DATA_DIR=/data` are already set by the Dockerfile.
3. Add the persistent volume: right-click the service (or use the command palette) → **Attach Volume**, mount path **`/data`**.
4. Go to **Settings → Networking → Generate Domain**. You get a public address such as
   `https://lifedrop-production.up.railway.app`.
5. Add one more variable, `APP_URL` = that address (used in e-mail links). Railway redeploys automatically.
6. Open the address. Log in as admin at `/admin-login.html`.

## 5B. Deploy on Render

1. Go to https://render.com, sign in with GitHub and choose **New → Blueprint**, then pick your repository.
   Render reads `render.yaml` and creates the web service `lifedrop` (root directory `backend`,
   build `npm ci --omit=dev`, start `node server.js`, health check `/api/health`).
2. Render asks for the variables marked `sync: false`:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: your first admin account
   - `APP_URL`: leave it empty at first
3. Click **Apply**. After the build you get an address such as `https://lifedrop.onrender.com`.
4. Open the service → **Environment**, set `APP_URL` to that address and save. Render redeploys.
5. **To keep data:** change the instance type to a paid plan, then open **Disks → Add disk** with mount path `/var/data`,
   and add the variable `DATA_DIR=/var/data`. The commented lines in `render.yaml` show the same thing.

Without a Blueprint, you can set it up by hand instead: **New → Web Service**, root directory `backend`, build command `npm install`, start
command `node server.js`, and the same variables plus `NODE_ENV=production`.

## 5C. Any other Docker host (Fly.io, a VPS, …)

```bash
docker build -t lifedrop .
docker run -d -p 80:5000 -v lifedrop-data:/data \
  -e APP_URL=https://your-domain -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='...' lifedrop
```
Put HTTPS in front of it (for example with Caddy or Nginx), because GPS location needs `https://`.

---

## 6. Settings (environment variables)

Set these on the host's **Environment / Variables** page, never in frontend code.

| Variable | Needed? | What it does |
|---|---|---|
| `NODE_ENV=production` | yes (on hosts) | Production mode: trusts the host's proxy, refuses the default `ADMIN_KEY` |
| `APP_URL` | yes | Your public address, used in password-reset and e-mail links |
| `DATA_DIR` | for kept data | Folder on the persistent disk or volume (`/data` on Railway, `/var/data` on a Render disk) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | for the admin panel | Creates the first admin at start-up if it doesn't exist yet. The password is stored only as a scrypt hash. You can delete these variables afterwards. |
| `EMAIL_LINK_SECRET` | recommended | Signs "unsubscribe" links |
| `ADMIN_KEY` | optional | Key for the older key-based camp review route. In production the default key is never accepted. |
| `TRUST_PROXY` | optional | Defaults to `1` in production, so rate limits see each visitor's real IP |
| `PORT` | set by the host | The server listens on it automatically |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` / `SENDGRID_API_KEY` / `SMTP_*`, `SUPPORT_EMAIL` | optional | Real e-mails. Until a provider is configured **and** a test e-mail has arrived, e-mails are **not** sent; previews are saved in `DATA_DIR/outbox/`. |
| `ANTHROPIC_API_KEY`, `CHAT_MODEL` | optional | Turns on the AI assistant |
| `OSRM_URL` | optional | Your own routing server, for heavy use |
| `DEMO_DATA` | optional | `off` = remove the fictional demo donors, requests and camps at start-up (real records are kept) |
| `SHOW_RESET_LINK` | keep `false` | `true` would show reset links on the page (local demos only) |

---

## 7. Checklist after deploying

1. `https://your-address/api/health` shows `{"ok":true}`.
2. The home page, Find Donor, Camps, Emergency and Dashboard open, and the map shows tiles.
3. **Find Donor → Use my location** asks for permission (this works because the site is on HTTPS).
4. Sign up with a test account, log out and log in again.
5. Log in at `/admin-login.html` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
6. **Persistent disk only:** restart the service and check that the test account still exists.
7. To test e-mail, see "Test the e-mails" in `README.md`.
8. Remove the test records, and delete `ADMIN_PASSWORD` from the variables once the admin can log in.

## 8. Before real people use it

- Demo donors, requests and camps are fictional and always labelled **Demo**. To launch without them, set **`DEMO_DATA=off`**. At start-up the server then deletes **only** the demo records; real records are never touched. You can do the same on your computer with `npm run remove-demo`. Never present demo records as real people or events.
- The site never shows blood stock, because no verified stock data is available.
- A registered donor's phone number is visible to people who search. The donor form does not yet have a separate consent checkbox, so make sure donors understand this before they register (consider adding a consent checkbox, see "Ideas for extension" in the README).
- The public map, place search and routing servers are free for **light use only**. For heavy traffic, use your own servers or paid providers.
- Back up the data folder (`DATA_DIR`) regularly.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Accounts disappear | You are on a plan without a disk, or `DATA_DIR` doesn't point to the mounted disk |
| "Location only works on a secure page" | Open the `https://` address |
| Admin login fails | Check `ADMIN_EMAIL` / `ADMIN_PASSWORD` (10+ characters) and read the start-up log: "Admin account created …" or the reason it wasn't |
| First visit takes about 1 minute (Render Free) | The free service was asleep; it wakes up on the first request |
| E-mails not arriving | The provider isn't configured or the sender isn't verified. See the start-up log line "E-mail notifications: …" |
