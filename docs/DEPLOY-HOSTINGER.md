# Deploying MATHEMA on Hostinger (Node.js + MySQL)

The same repository produces two things:

* **Static demo** (GitHub Pages): no server, no accounts, local analyzer only. Already wired by `.github/workflows/pages.yml`.
* **Full app** (Hostinger Node.js): accounts, cloud sync, AI via your API keys, plans, admin and finance panel.

> Hostinger's panel names and plan features change. The steps below are the standard flow; if a label differs, look for the equivalent in hPanel. Confirm that your plan includes **Node.js Web Apps** (Business / Cloud / VPS tiers do; basic shared hosting may not).

## 1. Create the database
hPanel → **Databases → MySQL** → create a database + user. Note: database name, user, password. The host is normally `localhost` (the Node app runs on the same account). Tables are created automatically on first start (`server/schema.mjs`); nothing to import.

## 2. Create the Node.js app from GitHub
hPanel → **Websites → Add website → Node.js Apps** → import the GitHub repository → branch `main`.

| Setting | Value |
|---|---|
| Node version | 20 or 22 |
| Install / build command | `npm install && npm run build` (the build also type-checks) |
| Start command | `npm start` |
| Entry file | `server.js` (in the repo root; it just loads `server/index.mjs`) |
| Framework preset | `Express.js` (or `Other`) — **not** a static/Vite preset, or the panel looks for a build output instead of the server |

> If the build fails with **"Entry file not found"**: the *Entry file* field must be exactly `server.js` and the preset must not be a static one. Also make sure the branch you selected is the one that contains `server.js` (it is in `main`).

## 3. Environment variables
Set these in the app's environment settings (see `.env.example`). **Never commit them.**

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (enables Secure cookies, HSTS, stricter rate limits) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | from step 1 |
| `APP_SECRET` | 32+ random chars; encrypts API keys stored in MySQL. **Back it up**: if you lose or change it, saved keys must be re-entered |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | creates the first admin on first start (password is never overwritten later). Use a long unique password |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | optional fallbacks; prefer the Admin panel |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## 4. First run checklist
1. Open the site → **Sign in** with `ADMIN_EMAIL`.
2. **Admin → AI & keys**: paste your Anthropic and/or OpenAI key (tick "verify"). Keys are AES-256-GCM encrypted before storage and never sent back to a browser.
3. **Models and prices**: check/edit the USD-per-million-token prices against each provider's pricing page (Anthropic prices are pre-filled as published on 2026-10-06; OpenAI is intentionally empty). A model without a price is logged at $0 and flagged in Finance.
4. **Routing and limits**: choose the default and research models, daily cap per user. Plans (free quota) are under **Users & plans**.
5. Register a test user, analyze an idea (one without equations or a table, since those are solved deterministically and cost nothing) and watch it appear in **Finance**.

## 5. Operations
* **Backups**: enable Hostinger's automated backups and export MySQL periodically. User models live in `user_data` (one JSON document per user).
* **Updates**: push to `main` → redeploy from the panel (or enable auto-deploy). Schema changes are additive (`CREATE TABLE IF NOT EXISTS`).
* **Cost control**: set low free quotas, a daily cap, and a monthly spend limit in each provider's console. The finance panel only knows about calls made through this server.
* **Security notes**: HTTPS is required in production (cookies are `Secure`). Mutating API calls must be same-origin JSON (CSRF defence). Login/register are rate limited. Do not expose phpMyAdmin publicly.

## Local development
```bash
# MySQL/MariaDB running locally with an empty database
cp .env.example .env     # then export the variables, or prefix them to the command
npm install
npm run dev:server       # API on :3001
npm run dev              # Vite on :5173, proxies /api to :3001
npm test                 # engine + server tests (server integration tests need MySQL, see TEST_DB_* in server/server.test.mjs)
```
