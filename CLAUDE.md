# ETST Holiday Soirée RSVP site

RSVP site for ETST's Annual "A Very Merry Soirée", Fri Dec 11, 2026, 7–11 PM, Miami Springs Country Club
(650 Curtiss Pkwy, Miami Springs, FL 33166). After party to follow. Cocktail attire. Every guest gets a plus one (max 2 people).

## Two invitation groups
- `florida`: RSVP by Dec 1, 2026 (form closes 11:59 PM ET)
- `travel` (out of state): ETST covers airfare + hotel. RSVP no later than Nov 16, 2026 (closes 11:59 PM ET).
  The form also collects ID names for the guest and plus one, home airport, arrival/departure dates, hotel, and phone.
- The travel artwork image (`public/invite-travel.jpg`) still prints the old "Nov 13" date, so the RSVP page hides it
  (`inviteThumb` in views.js). Put the thumbnail back once new artwork arrives.

## Stack
- Node 20+, plain `http` server (no Express). Only dependency: `pg`.
- `src/server.js` routes · `src/views.js` HTML · `src/db.js` schema (created on boot) and queries · `src/mail.js` email templates and Resend API
  · `src/auth.js` signed-cookie admin session · `src/csv.js` · `src/config.js` event text and deadlines
- Guest pages are built from the invitation artwork: `public/hero.jpg` (top), `public/paper.jpg` (tiled middle), `public/footer.jpg`.
  No white backgrounds on guest pages except text inputs.
- Each guest has a personal link `/i/<token>`. The home page also has a "Find your invitation" lookup (POST /find): name + email must both match,
  failed tries are throttled per IP (8 per 15 min). Admin pages are at `/admin`, behind the shared `ADMIN_PASSWORD`.

## Hosting
- Render (workspace "Mario's workspace"): web service `etst-soiree` (starter, virginia), Postgres `etst-soiree-db` (basic_256mb).
  Defined in `render.yaml`. Auto-deploys on every push to `main` of github.com/mtabbs79/etst-soiree.
- Env vars: ADMIN_PASSWORD, SESSION_SECRET, DATABASE_URL, RESEND_API_KEY, MAIL_FROM (rsvp@etstevent.com),
  MAIL_REPLY_TO / CONTACT_EMAIL (info@etstevent.com), optional BASE_URL (set to https://etstevent.com once the custom domain works).
- Email: Resend, domain etstevent.com (DNS at GoDaddy). The free plan allows 100 emails/day.

## Status as of Nov 7, 2026
- Live at https://etst-soiree.onrender.com. The database is connected. Render auto-deploys `main`; the live commit matched the repo on Nov 7.
- Resend: etstevent.com is fully VERIFIED (sending enabled) as of Nov 7.
- Import now rejects rows with a blank location and treats anything mentioning Florida/FL/Miami as Florida. The bulk send asks for confirmation.
- RESEND_API_KEY, MAIL_FROM, MAIL_REPLY_TO and CONTACT_EMAIL are already set in Render. Never commit keys to the repo.
- Resend domain etstevent.com: DKIM and the rsend CNAME are verified. The SPF MX/TXT records on the `send` subdomain were
  still pending, which is normal DNS propagation. Re-check in Resend. Sending only works once the domain is fully verified.
- No real guest list has been imported yet.

## Open items (roughly in order)
1. ~~Confirm Resend shows etstevent.com fully verified.~~ Done Nov 7.
2. Send test emails from /admin → Email guests → Preview → "Send a test to yourself". The test sends one Florida and one travel version.
3. Import the real guest list (admin page, paste from Excel: first, last, email, location).
4. Send travel invitations first (deadline Nov 16), then Florida (deadline Dec 1).
5. Optional: add etstevent.com as a custom domain in Render (Settings → Custom Domains, DNS records at GoDaddy), then set
   BASE_URL=https://etstevent.com so links in emails use it.
6. Replace public/invite-travel.jpg with artwork showing Nov 16, then remove the travel guard in inviteThumb().
7. Nice-to-haves: per-admin logins, automatic reminder a few days before each deadline, day-of update email.

## Working style for this project
- The owner (Mario) is not a developer. Explain results in plain language and keep changes small and safe.
- Guest data is personal (ID names, phone numbers). Don't log it or put it in commits.
- Pushing to `main` deploys to production immediately. Run `node --check src/*.js` before pushing.

## Local dev
`npm install && DATABASE_URL=postgres://localhost/etst_soiree ADMIN_PASSWORD=secret npm start` → http://localhost:3000
