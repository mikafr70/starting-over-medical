// Run this script to generate a fresh OAuth token for creating spreadsheets.
// Usage:  node scripts/refresh-token.js
// Then copy the printed token into .env.local as OAUTH_TOKEN_JSON and restart the dev server.

const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found in', process.cwd());
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse a multi-line .env.local safely by reading key=value pairs
function getEnvVar(content, key) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(key + '=')) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return null;
}

// Support both plain JSON and base64-encoded variants
let credentialsJson = getEnvVar(envContent, 'OAUTH_CLIENT_JSON') || getEnvVar(envContent, 'oauth_client_json');
const credentialsB64 = getEnvVar(envContent, 'OAUTH_CLIENT_JSON_B64') || getEnvVar(envContent, 'oauth_client_json_b64');

if (!credentialsJson && credentialsB64) {
  credentialsJson = Buffer.from(credentialsB64, 'base64').toString('utf8');
}

if (!credentialsJson) {
  console.error('❌ Neither OAUTH_CLIENT_JSON nor OAUTH_CLIENT_JSON_B64 found in .env.local');
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(credentialsJson);
} catch (err) {
  console.error('❌ Failed to parse OAuth client JSON:', err.message);
  process.exit(1);
}

const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || credentials;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // force refresh_token to be included
});

console.log('\n📋 Open this URL in your browser and sign in with the Google account that owns the Drive folders:\n');
console.log(authUrl);
console.log('\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the code from the redirect URL here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());

    const tokenB64 = Buffer.from(JSON.stringify(tokens)).toString('base64');

    console.log('\n✅ Token generated successfully!\n');
    console.log('📋 Add/replace this line in your .env.local (no quotes needed):\n');
    console.log('OAUTH_TOKEN_JSON_B64=' + tokenB64);
    console.log('\n⚠️  Then restart the dev server (Ctrl+C → npm run dev).\n');
  } catch (err) {
    console.error('❌ Error retrieving access token:', err.message);
    process.exit(1);
  }
});
