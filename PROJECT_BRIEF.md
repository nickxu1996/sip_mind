# Project Brief

## Project Name

Sip Mind

## One-sentence Description

Sip Mind lets users ask AI for drink-making suggestions based on home inventory and personal drink preferences.

## Why I Want to Build This

The project should help users discover suitable drink recipes from ingredients they already have at home, with controls for alcohol, caffeine, temperature, calories, required ingredients, and frugal inventory usage.

## Target Users

- Primary user: project owner and invited users.
- UI users may use English or Chinese.
- Internal project files, code, comments, and developer documentation should remain in English.

## Core Features

1. Inventory management
   - Users can select home inventory items.
   - Each item can optionally include an amount and unit such as ml or g.
   - Inventory is displayed at the top of the page.

2. Preference controls
   - Alcohol: any, high alcohol, low alcohol, no alcohol.
   - Caffeine: any, high caffeine, low caffeine, no caffeine.
   - Temperature: any, hot, room temperature, cold.
   - Calories: any, high above 200 kcal, medium 100-200 kcal, low below 100 kcal, very low close to 0 kcal.
   - Random switch to randomize alcohol, caffeine, temperature, and calorie settings while still allowing manual adjustment.

3. Frugal mode
   - When enabled, AI should recommend recipes that use selected inventory as completely as possible.
   - Recipes must not exceed available inventory amounts.
   - Leaving up to 10% unused is acceptable.
   - If enabled, recommendation count must be greater than 1.

4. Required ingredients
   - Users can click inventory items to mark them as required.
   - Required ingredients must appear in generated recipes.

5. AI recommendations
   - AI returns drink name, ingredients, and preparation steps.
   - User can choose which recommendation they used.
   - User can rate the chosen item from 1 to 5 stars.

6. History and favorites
   - History records date, time, returned options, selected option, and rating.
   - A right-side My Favorite panel sorts by star rating.
   - Items with the same rating are sorted by time.
   - Favorites can be filtered by alcohol, caffeine, temperature, and calories.

7. Settings and account
   - Settings can configure calorie thresholds and the AI model.
   - UI language can switch between English and Chinese.
   - Login can use invite code or username/password.
   - Only admin can generate invite codes.

## Technical Preferences

- Frontend: React + Vite + TypeScript.
- Backend: Express + TypeScript initially; can migrate to a more structured backend later if needed.
- Database: Unknown; likely SQLite for a simple initial deployment.
- Deployment: Vultr Ubuntu + systemd after project owner confirmation.
- AI API: Gemini and/or DeepSeek, using private environment variables only.

## Important Constraints

- Do not expose API keys.
- Do not delete user data.
- Prefer simple and maintainable architecture.
- Prefer small incremental changes.
- Avoid over-engineering.
- Do not deploy to Vultr until confirmed by the project owner.
- Do not push to GitHub until confirmed by the project owner.

## Current Status

Initial local scaffold created.

## Next Things to Try

1. Decide the database layer and schema for users, inventory, history, ratings, favorites, and invite codes.
2. Connect the recommendation endpoint to Gemini or DeepSeek through private environment variables.
3. Add real recommendation result cards, history persistence, and rating flow.
