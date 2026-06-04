# Sip Mind

Sip Mind is a web app for asking AI to recommend drink recipes based on home inventory, drink preferences, required ingredients, and frugal-use constraints.

## Current Status

Initial project scaffold is created with:

- React + Vite + TypeScript frontend
- Express API scaffold
- Zod validation and AI prompt builder for recommendation requests
- English and Chinese UI localization files
- Vitest tests for recommendation request validation and prompt generation

The live AI provider integration is intentionally not connected yet. Add private credentials in a local `.env` file before enabling Gemini or DeepSeek calls.

## Core Features Planned

- Manage home inventory with optional per-item amounts in ml, g, or pieces.
- Show inventory at the top of the page.
- Randomize and manually adjust alcohol, caffeine, temperature, and calorie preferences.
- Frugal mode that asks AI to use selected ingredients as completely as possible without exceeding inventory.
- Required ingredients selected from inventory chips.
- Configurable recommendation count.
- AI recommendation output with drink name, ingredients, steps, and metadata.
- History of each recommendation session, selected result, and 1-5 star rating.
- My Favorite panel sorted by rating, with filters for alcohol, caffeine, temperature, and calories.
- Settings for calorie thresholds and AI model selection.
- English and Chinese UI language selection.
- Login by invite code or username/password, with admin invite-code generation.

## Local Development

```bash
npm install
npm run dev
```

The frontend runs through Vite. The API scaffold can be run separately:

```bash
npm run server:dev
```

## Verification

```bash
npm test
npm run build
```

## Safety Notes

- Do not commit `.env` or `PROJECT_CONFIG.env`.
- Do not expose API keys.
- Do not deploy to Vultr until the project owner confirms.
- Do not push to GitHub until the project owner confirms.
