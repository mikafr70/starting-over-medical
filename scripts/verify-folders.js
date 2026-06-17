#!/usr/bin/env node
// Verify Drive folder IDs for animal treatment folders
// Usage: node scripts/verify-folders.js

const fs = require('fs');
const path = require('path');
// Try to load dotenv if available to read .env.local
try { require('dotenv').config({ path: path.join(process.cwd(), '.env.local') }); } catch (e) {}

const { google } = require('googleapis');

function getCredentialsFromEnv() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';
  if (!email || !key) return null;
  key = key.replace(/\\n/g, '\n');
  return { client_email: email, private_key: key };
}

async function main() {
  const creds = getCredentialsFromEnv();
  if (!creds) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY in environment or .env.local');
    process.exit(2);
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  const drive = google.drive({ version: 'v3', auth });

  const mapping = {
    donkey: process.env.DONKEYS_DRIVE_FOLDER_ID,
    horse: process.env.HORSES_DRIVE_FOLDER_ID,
    cow: process.env.COWS_DRIVE_FOLDER_ID,
    dog: process.env.DOGS_DRIVE_FOLDER_ID,
    cat: process.env.CATS_DRIVE_FOLDER_ID,
    goat: process.env.GOATS_DRIVE_FOLDER_ID,
    sheep: process.env.SHEEPS_DRIVE_FOLDER_ID,
    rabbit: process.env.RABBITS_DRIVE_FOLDER_ID,
    chicken: process.env.CHICKENS_DRIVE_FOLDER_ID,
    pig: process.env.PIGS_DRIVE_FOLDER_ID,
    camel: process.env.CAMELS_DRIVE_FOLDER_ID,
    mule: process.env.MULES_DRIVE_FOLDER_ID
  };

  console.log('Verifying animal folder IDs...');

  for (const [animal, folderId] of Object.entries(mapping)) {
    if (!folderId) {
      console.warn(`- ${animal}: MISSING folder ID (env var not set)`);
      continue;
    }

    try {
      const res = await drive.files.get({ fileId: folderId, fields: 'id, name, mimeType' });
      console.log(`- ${animal}: OK -> ${res.data.name} (${res.data.id}) [${res.data.mimeType}]`);
    } catch (err) {
      console.error(`- ${animal}: ERROR checking folder ${folderId} -> ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error verifying folders:', err);
  process.exit(1);
});
