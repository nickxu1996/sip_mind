# Sip Mind Project Profile

## Project Purpose

Sip Mind helps users generate AI drink recipes from home inventory, preferences, optional required ingredients, and optional frugal-use rules. It supports public food-library sharing, personal inventory, favorites, bilingual UI, contact messages, admin settings, and public deployment.

## Current Status

The project is live at `https://sipmind.xyz/`.

Implemented foundations:

- React + Vite + TypeScript frontend.
- Express + TypeScript backend.
- SQLite persistence for users, sessions, inventory, favorites, food library, invite codes, limits, and usage logs.
- Account login, registration, invite-code login, admin role, and admin invite generation.
- AI recommendation generation with Gemini provider support and strict JSON parsing.
- Public and personal food library support.
- Guest inventory persistence by device id.
- Daily generation limits for whole site, logged-in users, and guest IP/device combinations.
- Contact form with backend SMTP sending and anti-harassment limits.
- GitHub upload and Vultr pull/deploy BAT helpers.
- Public Nginx/HTTPS deployment for `sipmind.xyz`.

## Main Directory Structure

```text
src/
  App.tsx
  main.tsx
  styles.css
  i18n/
    en.ts
    zh.ts
  server/
    aiProvider.ts
    app.ts
    index.ts
    recommendation.ts
    storage.ts
tests/
scripts/
meetings/
README.md
PROJECT_BRIEF.md
REQUIREMENTS_INBOX.md
PROJECT_PROFILE.md
PROJECT_CONFIG.example.env
```

## Backend Entry Point

- `src/server/index.ts`
- Local API command: `npm run server:dev`
- Production command: `npm start`
- Health endpoint: `GET /api/health`

Main API areas:

- Auth: login, register, logout, captcha.
- User data: inventory and favorites.
- Food library: public library plus per-user library.
- Recommendations: AI-backed recipe generation with quota enforcement.
- Admin: config limits, invite codes, categories, food-library deletion.
- Contact: email-backed contact form with limits.

## Frontend Entry Point

- `src/main.tsx`
- Main UI component: `src/App.tsx`
- Local frontend command: `npm run dev`

Core visible flows:

- Inventory and food library selection.
- Preference controls and generation count.
- Independent drinks, frugal mode, and ignore-inventory generation.
- Recommendation cards with score, dimensions, volume, kcal, tags, ingredients, steps, and per-drink leftovers.
- Favorites/history panel.
- Login/register/contact/settings modals.

## Environment Variables

Private values should be stored only in `.env`, never committed.

Important variables:

- `NODE_ENV`
- `HOST`
- `PORT`
- `PUBLIC_APP_URL`
- `CORS_ORIGIN`
- `TRUST_PROXY`
- `DATABASE_PATH`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `AI_PROVIDER`
- `AI_MODEL`
- `GEMINI_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `CONTACT_TO_EMAIL`

## Local Run Commands

```bash
npm install
npm run server:dev
npm run dev
```

## Test Commands

```bash
npm test
npm run build
```

## Deployment Notes

- GitHub repo: `https://github.com/nickxu1996/sip_mind.git`
- Public domain: `sipmind.xyz`
- Server path: `/opt/sip_mind`
- systemd service: `sip-mind`
- Local service port: `8787`
- Nginx proxies the public domain to `127.0.0.1:8787`.

Use:

- `upload_github.bat` for GitHub upload.
- `pull_to_vultr.bat` for GitHub upload plus remote pull/build/restart.
- `backup_vultr.bat` to create a remote `.env` and SQLite backup under `/opt/sip_mind_backups`.

## Operations Notes

Useful server commands:

```bash
systemctl status sip-mind
journalctl -u sip-mind -n 80 --no-pager
curl -fsS http://127.0.0.1:8787/api/health
nginx -t
```

Rollback can be done by reverting the Git commit locally and running `pull_to_vultr.bat`, or by checking out a known-good commit on the server, rebuilding, and restarting `sip-mind`.

## Public Readiness Checklist

- `.env`, databases, logs, and build outputs are ignored by Git.
- `/api/health` is available.
- Admin APIs require admin authorization.
- Expensive AI generation has global, user, and guest limits.
- Contact form has site-wide and user/IP limits.
- SMTP credentials remain backend-only.
- CORS is configurable through `PUBLIC_APP_URL` and `CORS_ORIGIN`.
- JSON request body size is limited.
- Basic security headers are set by the API.
- Backup helper exists for `.env` and SQLite data.

## Known Follow-Up Opportunities

- Move remaining inline user-facing strings from `App.tsx` into locale files.
- Add explicit tests for public CORS behavior and contact quota edge cases.
- Add traffic statistics views in admin settings.
- Add a one-command restore helper for a selected backup archive.
