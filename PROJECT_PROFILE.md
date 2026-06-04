# Sip Mind Project Profile

## Project Purpose

Sip Mind is a web app that helps users ask AI for drink recipe recommendations based on home inventory, required ingredients, alcohol/caffeine/temperature/calorie preferences, and a frugal-use mode.

## Current Status

Initial local scaffold is created. The app currently includes a React + Vite + TypeScript frontend, an Express API scaffold, validation for recommendation requests, and prompt construction for future Gemini or DeepSeek integration. Live AI calls, persistence, authentication, history, ratings, and deployment are not implemented yet.

## Main Directory Structure

```text
.
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  ├─ i18n/
│  │  ├─ en.ts
│  │  └─ zh.ts
│  └─ server/
│     ├─ index.ts
│     └─ recommendation.ts
├─ tests/
│  └─ recommendation.test.ts
├─ scripts/
├─ README.md
├─ PROJECT_BRIEF.md
├─ REQUIREMENTS_INBOX.md
├─ PROJECT_PROFILE.md
├─ HERMES_WORKFLOWS.md
├─ PROJECT_CONFIG.example.env
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## Backend Entry Point

- `src/server/index.ts`
- Local API command: `npm run server:dev`
- Current API endpoints:
  - `GET /api/health`
  - `POST /api/recommendations` returns a prompt preview, not live AI output.

## Frontend Entry Point

- `src/main.tsx`
- Main UI component: `src/App.tsx`
- Local frontend command: `npm run dev`

## Database / Storage Notes

Unknown / not implemented yet. SQLite is a likely simple first choice for users, inventory, recommendation history, selected results, ratings, favorites, and invite codes.

## Environment Variables Needed

Private values should be stored only in `.env` or `PROJECT_CONFIG.env`, not committed.

- `PORT`
- `AI_PROVIDER`
- `AI_MODEL`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GITHUB_REPO_URL`
- `GITHUB_BRANCH`
- `VULTR_HOST`
- `VULTR_USER`
- `VULTR_PROJECT_PATH`
- `SYSTEMD_SERVICE_NAME`

## Local Run Commands

```bash
npm install
npm run dev
npm run server:dev
```

## Test Commands

```bash
npm test
npm run build
```

## Deployment Notes

Deployment target is expected to be Vultr Ubuntu + systemd after project owner confirmation. Do not deploy automatically. Confirm GitHub repository URL, branch, host, server path, and service name first.

## Required Scripts Status

- `scripts/upload_to_github.bat`: Present
- `scripts/pull_from_github.bat`: Present
- `scripts/deploy_to_vultr.bat`: Present
- `scripts/restart_local.bat`: Present
- `scripts/server_restart.bat`: Present / Optional helper
- `scripts/server_logs.bat`: Present / Optional helper

Deployment service:

- Vultr host: Unknown / placeholder only
- Server project path: Unknown / placeholder only
- systemd service name: Unknown / placeholder only

## Dangerous Files Not To Modify Casually

- `.env`
- `PROJECT_CONFIG.env`
- database files such as `*.sqlite`, `*.sqlite3`, or `*.db`
- generated folders such as `node_modules/`, `dist/`, and `coverage/`
- credentials, keys, and deployment secrets

## Recent Requirements

Initial requirements came from `C:/Users/nickx/codex_project/00_project_info/sip_mind/PROJECT_BRIEF.md.md`:

- Inventory with optional amounts.
- Randomized and manually adjustable drink preference controls.
- Frugal mode with inventory usage constraints.
- Required ingredients from inventory chips.
- AI drink recommendation generation.
- History, selected option, and 1-5 star ratings.
- My Favorite panel sorted by rating and filterable by metadata.
- Settings for calorie thresholds and AI model.
- English/Chinese UI selection.
- Invite-code or account/password login with admin invite generation.
- Future GitHub repo and Vultr deployment only after project owner confirmation.

## Open Questions

1. Should the initial database be SQLite?
2. Which AI provider should be connected first: Gemini or DeepSeek?
3. What exact calorie thresholds should be the defaults?
4. Should login be required before using the app, or only before saving history/favorites?
5. What should the first public domain or Vultr service name be?

## Recommended Next Actions

1. Add a database schema and persistence layer using TDD.
2. Implement recommendation result cards and history/rating flow.
3. Add real AI provider integration behind private environment variables.
4. Add authentication and admin invite-code management.
5. Run a pre-deploy check before any GitHub upload or Vultr deployment.
