# Ndi Igbo

Login/sign-up wall, onboarding (why you are here, state, Igbo/Yoruba/Hausa/other, music genres), Spotify music, events, roommates, market, notices, map, Ask chat, admin insights. Node 22+, Express 5, SQLite or PostgreSQL. Responsive.

## Run
    npm install
    npm start                              # http://localhost:3000 (SQLite in ./data)
    npm run make-admin -- you@email.com    # after you sign up once
    npm test

## Host
- Render/Railway: new Web Service from this folder. Build `npm install`, start `npm start`. Add PostgreSQL and set `DATABASE_URL`, `DATABASE_SSL=on`, `TRUST_PROXY=1`, `COOKIE_SECURE=true`. Run make-admin from the service shell.
- VPS: `npm install --omit=dev`, `pm2 start server/index.js`, nginx with HTTPS and `proxy_buffering off` for `/api/stream`.
- Docker: `docker compose up --build` (COOKIE_SECURE=false unless on https).
Run ONE instance only (live updates are in memory).

## Music (Spotify)
As admin open Admin > Music and paste a Spotify playlist link per genre. People hear their picked genres in Spotify's player. Optional SPOTIFY_CLIENT_ID/SECRET fills missing genres by search (Spotify API limits may change). A built-in tune is the fallback.

## Visitors
Admin > Insights: counts by purpose, group, state, and visitors by state/group. Counts only. Group is optional and consent-based (NDPA 2023 treats ethnic origin as sensitive).

## Roles and verification
Anyone can request a verified badge in Profile (school, church, business, group). Admin > Verify approves or rejects; nobody can verify themselves. Admins can suspend accounts (Admin > Accounts); every admin action is listed in Admin > Activity.

## Not done yet
Google place autocomplete (search is a simple list filter plus a Google Maps search link), push or email event reminders (events offer a calendar file with a 1 hour alert), volume for Spotify songs (Spotify's own control is used), organiser dashboards beyond Profile and Admin. PDFs (3 MB, checked by content, scripts refused) are stored in the database, so they survive restarts on any host.

## Not done / untested
- No email verification or emailed password reset (use `npm run reset-password`).
- Not tested against real Spotify, Google Maps or Anthropic APIs.
- privacy.html and terms.html are drafts: fill the brackets and have a lawyer review.
- Backend tests pass on SQLite and PostgreSQL. UI checked in Chromium at phone and desktop widths.
