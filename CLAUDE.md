# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start development server
npm run build    # production build
npm run start    # run production build
```

No linter or test suite is configured. There is no `npm test` command.

To re-generate the Google OAuth token when it expires:
```bash
node scripts/refresh-token.js
```
Follow the prompts, then paste the `OAUTH_TOKEN_JSON_B64=...` line into `.env.local` and restart the dev server.

## Architecture

### Overview

This is a **Next.js 14 App Router** application for managing animal treatments at a rehabilitation farm. The entire UI is a single-page React app (`src/App.tsx`) rendered by `app/page.tsx`. Navigation is handled by a `currentScreen` state string — there is no Next.js client-side routing.

### Key architectural split

| Layer | Location | Auth used |
|---|---|---|
| Frontend (React SPA) | `src/App.tsx`, `src/components/` | — |
| API routes | `app/api/**/route.js` | — |
| Google Sheets/Drive logic | `src/lib/sheets.js` | Service account (reads/writes) + OAuth user (file creation) |
| Google OAuth helpers | `src/lib/googleAuth.js` | OAuth2 tokens from env vars |

All API routes use `export const runtime = 'nodejs'` — they run on Node.js, not the Edge runtime, because `sheets.js` uses Node.js APIs.

### `src/lib/sheets.js` — the core backend module

This ~4500-line file is the single source of truth for all Google Sheets and Drive operations. Key concepts:

- **Config loading**: On module load, `readConfigurationSheet()` is called to populate environment variables from a Google Sheet (the "configuration sheet"). All other sheet IDs (DONKEYS_SHEET_ID, etc.) come from that sheet. Always `await ensureConfigLoaded()` before accessing `process.env` sheet IDs.

- **`ANIMAL_TREATMENT_SHEETS()`**: A *function* (not a constant) that returns a map of `{ donkey, horse, cow, dog, cat, goat, sheep, rabbit, chicken, pig }` to `{ displayName, emoji, sheetId, folderId }`. Must be called as a function since the env vars it reads are loaded at runtime.

- **In-memory cache** (`global.sheetCache`): All sheet reads are cached. Cache keys are `sheetId:tab:range`. Cache is invalidated per-sheet on writes, and fully cleared on login. The cache survives Next.js hot reloads via `global.sheetCache`.

- **Two auth clients**:
  - `getSheetsAuth()` — JWT service account, used for all reads and writes to existing sheets
  - `getDriveClient()` — service account Drive client, used for listing/searching files
  - `getUserOAuthClient()` (from `googleAuth.js`) — OAuth2 user auth, used **only** for `createAnimalTreatmentSheet` and `renameAnimalTreatmentSheet`, because those create/rename files in the user's Drive (the service account's 15 GB quota can be exhausted by owned files)

- **`createAnimalTreatmentSheet`** must use OAuth because files created by the service account count against its own storage quota. If OAuth tokens are invalid, this function fails — but callers in `saveArrivalData` and `saveBirthData` wrap it in try-catch so the main record is still saved.

### Data model

Each animal type has two Google Drive artefacts:
1. A **master list sheet** (e.g. `DONKEYS_SHEET_ID`) — one row per animal, Hebrew column headers matching `FIELD_TO_HEADER` in `sheets.js`
2. A **folder** (e.g. `DONKEYS_DRIVE_FOLDER_ID`) containing one spreadsheet per animal, named `<animalName> <chipId>` or `עותק של <animalName> <chipId>`

Treatment rows in individual animal sheets have Hebrew headers: `תאריך, יום, בוקר, צהריים, ערב, טיפול כללי, טיפול אישי, טיפול, מינון, מתן, משך, מתחם, סיבת טיפול, הערות`. Checkboxes in columns C–G (morning/noon/evening/general/personal) drive the daily schedule display.

### API routes

All routes are plain JS (`route.js`). The pattern is: validate inputs → `await ensureConfigLoaded()` → call a function from `sheets.js` → return a `new Response(JSON.stringify(...))`.

Key routes:
- `GET /api/treatments` (no params) — returns all animal types via `getAllAnimalTypes()`
- `GET /api/treatments?animalType=X` — returns animals list + protocols for that type
- `GET /api/treatments/today` — streams or returns today's scheduled treatments across donkeys, horses, sheep, goats only (hardcoded `allowedTypes`)
- `POST /api/animals` — adds animal to master list (`addAnimalToList`) then creates a treatment sheet (`createAnimalTreatmentSheet`, non-blocking)
- `POST /api/animal-action` — dispatches to `saveArrivalData`, `saveBirthData`, `saveAdoptionData`, `saveEuthanasiaData`, `saveDeathData` based on `actionType` (Hebrew strings: קליטה, המלטה, אימוץ, המתת חסד, פטירה)
- `POST /api/treatments` — adds a treatment row via `addTreatmentAtTop`
- `POST /api/treatments/complete` — marks a morning/noon/evening checkbox as done
- `POST /api/treatments/complete-general` / `complete-personal` — marks general/personal treatment checkboxes

### Frontend screens

`App.tsx` manages a `currentScreen` string. Screens: `login → dashboard → schedule | profile | medicalRecords | personalTreatments | addTreatment | addTreatmentFromSchedule`.

- **Dashboard** (`Dashboard.tsx`) — entry point after login; shows today's animals with treatments. Contains the "Add action" button which opens `AnimalAction` (for arrivals/births/adoptions/deaths) and `AddAnimal` (for direct animal registration).
- **DailySchedule** — shows morning/noon/evening treatment grid for today
- **PersonalTreatments** — filtered view for a specific caregiver's assigned animals
- **AnimalProfile** — full profile + treatment history for one animal
- **AddTreatment** — form to add a new treatment row to an animal's sheet

### Environment variables

All sensitive config is in `.env.local` (never committed). The configuration Google Sheet (`CONFIGURATION_SHEET_ID`) is the source of truth for all other sheet/folder IDs at runtime. OAuth credentials use two env var patterns:
- `OAUTH_CLIENT_JSON` or `OAUTH_CLIENT_JSON_B64` — OAuth2 app credentials
- `OAUTH_TOKEN_JSON` or `OAUTH_TOKEN_JSON_B64` — user token (**prefer the `_B64` variants** to avoid JSON-in-env quoting issues)

The service account credentials are `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY`.

### UI components

All UI primitives are in `src/components/ui/` — shadcn/ui components built on Radix UI. The app is RTL (Hebrew). `src/config/api.ts` contains `API_ENDPOINTS` — all fetch calls go through this object.
