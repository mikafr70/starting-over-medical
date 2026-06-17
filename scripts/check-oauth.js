// scripts/check-oauth.js
// Utility to inspect OAuth client and token used by the app.
// Usage (PowerShell):
//   node scripts/check-oauth.js
// It will read from env vars or fallback to secrets files.

const fs = require('fs');
const path = require('path');

function readJsonFromEnvOrFile(envName, envB64Name, filePath) {
  let content = process.env[envName] || process.env[envName.toLowerCase()];
  const b64 = process.env[envB64Name] || process.env[(envB64Name || '').toLowerCase()];
  if (!content && b64) {
    try {
      content = Buffer.from(b64, 'base64').toString('utf8');
    } catch (err) {
      console.error(`Failed to decode ${envB64Name}:`, err.message);
      process.exit(2);
    }
  }
  if (!content && filePath) {
    const p = path.resolve(filePath);
    if (fs.existsSync(p)) content = fs.readFileSync(p, 'utf8');
  }
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error(`Invalid JSON for ${envName} / ${filePath}:`, err.message);
    process.exit(2);
  }
}

const root = process.cwd();
// Load .env.local into process.env if it exists (so running this script directly picks up variables)
const dotEnvPath = path.join(root, '.env.local');
if (fs.existsSync(dotEnvPath)) {
  try {
    const dotEnv = fs.readFileSync(dotEnvPath, 'utf8');
    dotEnv.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.substring(0, eq).trim();
      let val = trimmed.substring(eq + 1).trim();
      // Remove optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      // Only set if not already present in environment
      if (!process.env[key]) process.env[key] = val;
    });
  } catch (err) {
    console.warn('Could not load .env.local:', err.message);
  }
}

const oauthClient = readJsonFromEnvOrFile('OAUTH_CLIENT_JSON', 'OAUTH_CLIENT_JSON_B64', path.join(root, 'secrets', 'oauth_client.json'));
const token = readJsonFromEnvOrFile('OAUTH_TOKEN_JSON', 'OAUTH_TOKEN_JSON_B64', path.join(root, 'secrets', 'token.json'));

console.log('\n=== OAuth Client ===');
if (!oauthClient) {
  console.log('No OAuth client found (env or secrets file)');
} else {
  const client = oauthClient.installed || oauthClient.web || oauthClient;
  console.log('client_id:', client.client_id || '(missing)');
  console.log('client_secret present:', !!client.client_secret);
  console.log('redirect_uris:', (client.redirect_uris || []).slice(0,5));
}

console.log('\n=== OAuth Token ===');
if (!token) {
  console.log('No token found (env or secrets file)');
  process.exit(0);
}

console.log('has refresh_token:', !!token.refresh_token);
if (token.expiry_date) {
  const d = new Date(Number(token.expiry_date));
  console.log('expiry_date (ms):', token.expiry_date);
  console.log('expiry_date (UTC):', d.toISOString());
  console.log('expired?:', Date.now() > Number(token.expiry_date));
}
if (token.refresh_token) console.log('refresh_token length:', token.refresh_token.length);
console.log('\nFull token keys:', Object.keys(token));

console.log('\nIf you see `has refresh_token: false` or `expired?: true`, re-run the authorization flow:');
console.log('  node scripts/authorize.js');
console.log('or refresh token (if supported):');
console.log('  node scripts/refresh-token.js');

process.exit(0);
