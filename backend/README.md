# Rehabilitation Farm App — Backend (Next.js)

This folder contains a minimal Next.js backend (App Router) used for development and demo API endpoints.

Quick steps

1. Install dependencies

```powershell
# from the project root:
cd backend
npm install
# if PowerShell blocks scripts, use the cmd wrapper:
npm.cmd install
```

2. Run the dev server

```powershell
npm run dev
# server will start on http://localhost:3000 by default
```

API endpoints

- GET /api/hello — returns { message: 'Hello from Next.js backend' }
- GET /api/treatments — returns an array of stored treatment objects
- POST /api/treatments — accepts JSON body, returns stored item with generated id

CORS and connecting from your Vite frontend

During development the frontend (Vite) usually runs on a different port (e.g. http://localhost:5173). The example endpoints in this backend include permissive CORS headers (Access-Control-Allow-Origin: *), which makes it trivial to fetch across origins.

Recommended options to connect your frontend:

1) Direct fetch (simple)

From your React code (replace host/port if different):

```js
// GET
const res = await fetch('http://localhost:3000/api/hello');
const data = await res.json();

// POST
await fetch('http://localhost:3000/api/treatments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ animalId: 123, description: 'Checkup' })
});
```

2) Vite proxy (recommended to avoid CORS and use relative paths)

Edit your `vite.config.ts` and add a dev server proxy so requests to `/api` are forwarded to the Next server:

```ts
// vite.config.ts (snippet)
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
```

Then from your React app simply call `/api/hello` (no host) and the dev server will forward to Next.

Google Sheets Setup

This backend uses multiple Google Sheets as a database:
- One sheet for the animals list
- Individual sheets for each animal's treatment history

Setup steps:

1. Share your Google Drive folder with the service account:
   - Email: test-startingover@test-441809.iam.gserviceaccount.com

2. Set up the sheets:
   - Animals list sheet with the columns your app expects. Example (English keys shown):
     - id (שבב)
     - id2 (שבב נוסף)
     - name (שם)
     - sex (מין)
     - description (תיאור)
     - arrival_date (תאריך הגעה)
     - birth_date (תאריך לידה)
     - location (מתחם)
     - special_trimming (טילוף מיוחד)
     - notes (התנהגותי/ הארות)
     - drugs (טשטוש)
     - castration (ת.סירוס)
     - worming (תאריך תילוע)
     - source (מקור)
     - status (סטטוס)
     - friends (חברויות)

   - Treatment sheets: your existing treatment sheets are supported. There are two common layouts and this backend supports both:
     1) Single spreadsheet with multiple tabs (each tab named like `treatments_<animalId>`) — in this case set `TREATMENTS_FOLDER_ID` to that spreadsheet's ID.
     2) A Google Drive folder containing multiple spreadsheet files (one per animal) — in this case set `DRIVE_FOLDER_ID` to the Drive folder ID and enable Drive-folder mode (see below).

3. Create a `.env.local` file with (example):
   ```env
   # The spreadsheet ID that contains the animals list
   ANIMALS_SHEET_ID=1ASVemXwtO7e6t5xc9hi1nEzZnIWqbtKUT666MAOdZbs

   # If all treatment tabs live inside a single spreadsheet, put that spreadsheet ID here
   TREATMENTS_FOLDER_ID=your-treatments-spreadsheet-id-here

   # If instead you keep one spreadsheet per animal inside a Drive folder, leave TREATMENTS_FOLDER_ID empty
   # and set DRIVE_FOLDER_ID to the Drive folder ID
   DRIVE_FOLDER_ID=116Jvjv_-iwRcf7nXIv5OuAdyMkad5abB

   # Service account
   GOOGLE_SERVICE_ACCOUNT_EMAIL=test-startingover@test-441809.iam.gserviceaccount.com
   GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDu04O7R272278u\nQd50soQ8TlhZZo9JM10FGur4zCGX/3OgTkH5nzPSXPGsH0bA+7+lYuviICIsAxCV\nnGaSiQIcL1EOzigJ+AEyPSKoWfHoPm3HS6sfb0AC849Zbo+7uR6kchQckJomBOB/\nTMB0o3EIBT1AMTyhWTopmik5rr1hirVA1n7kZCkioXFxgjNRSMgMTDlQqT3OkAa+\ntC8CT+87EjTT5aY/RhRKMMt7a6wEx+rAy0QwcpEAcojOXAAMX1T+W5SvhaXup5xQ\nb06oQYXWHDVLVWGjIhor2/xBThxBfJMMv0uWKR6lOvGB6nBwJiYV7OjUFhYRqCb6\nZnjFyXgtAgMBAAECggEAce1Gdu1BmtMC5S8YznRmLlp1PNh228V7xzarBlpiYB7E\n6qDKSijO0LfztVcKKn8tUdjZi3omsvYXUDdWmupurkFIGpbvdKnw8CVHxiV6B37Y\nYWzQSeOJFp9XL6NVP4i0fF/LBkFYt3A2I6PaXwmknt3Y9SlHsfRdkYDvz4ty3fcg\nLLjk0xFI7cmes/TxiwCllK/lbNe/cPnyaaAQHsry2+6hq2gZAp8jNw+dnasl0Grr\nraqnsDIt6smeGqIF1EOgZoFTRlXpFHu+o4QVb9K/OVcscMCBdMN2ykuRB+6jQIx9\nCZ3DIzGu1IWdBF37m+D7+IrtHKWCK/fPR5RR46pN5QKBgQD/iLl1vXxQsukH0qLK\ninf+o3cI/0QRSbpyn6uQITcGo9jAGrGL2UnIDQ3e4rcfyCUngEcjIE5yHLFwT2k1\n6x+xMy7HT2+99G/JftZzKYK0D0XGD0ilbNNedaHzAieeFLr4mfwdKIxfGqFtUj/Y\nvb3pjoRpfeY5/GWrTvm3CRKqYwKBgQDvQv3My06g8yzwwJJXo2ors+CYM1mPZf4s\nqW7yhuY9ikhOHSnhXfvsJvimLjK65iZo8YKFcr/NIHfj+vrgSS495uMwR6ppPUSH\n/T6cfimZKxIp9a1rE80tTlOwNUDI8X9egcYVBwsfP32Bx2apAjugT5IuIC2Xy2Hi\nYlhMP1IQLwKBgCs1qXa5Ze4XcsQ54AEzzPqoFZbV42Kw/vAnA9HJbA6ZYiuJ1//3\n7DwByRipaaHcLDwzutO7wMgXBgIhy36slZ1XNE/LpO+QB98grY6ntExSUNAfAX/H\nmS5d4da/xIc8piknkLQ1iRcD38wmnlk+LIDz8nwMKAQiI+cF4cALrrZVAoGATzQv\nDl9zHQbDJsOo7kgTenombFv7VuQdmy1PpAuSJmcjfnBbD9br8YYJJAIBGyvbJTxl\nx8Vvxvjrl1XbPOoc27MWHEJtID9+80GbO3TsUl8WuTsx+FNqxYe7XoaSdrKzRlbR\net6FCQgchRy8WFB76prMumY+kZRrR+TkdAE2KlMCgYBJgLSI3T9wn+rQdiugsYl6\nez+NYYOPN9BPbv4MCXpnUksWd/j0QZ1b79rsJpTn1ZYOOwqk3N/uECyjFxMGDi6G\n8Omi1bqiuR+kJTxfncrBb/KZXUwiuhgDjNAO2uXmQq4+Xeqk8j8eetwFINzTX1wr\nhaTTfI3aG7R71F6rpYWawg==\n-----END PRIVATE KEY-----\n"
   ```

   (Get these IDs from the URLs of your Google Sheets / Drive folder.)

API Endpoints

1. Animals:
   - GET /api/animals - Get list of all animals

2. Treatments:
   - GET /api/treatments?animalId=123 - Get treatments for a specific animal
   - POST /api/treatments?animalId=123 - Add a treatment for an animal
     ```json
     {
       "description": "Regular checkup",
       "notes": "All good",
       "veterinarian": "Dr. Smith"
     }
     ```

Notes

- The app now uses Google Sheets as a database - make sure to set up the environment variables before starting
- To build for production: `npm run build` and start with `npm start`
