// src/lib/googleAuth.js
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const __dirname = process.cwd(); // Next.js root

//const CREDENTIALS_PATH = path.join(__dirname, 'secrets', 'oauth_client.json');
//const TOKEN_PATH = path.join(__dirname, 'secrets', 'token.json');

function loadOAuthCredentials() {
  // Support multiple env var names (uppercase/lowercase) and optionally base64-encoded JSON
  let content = process.env.OAUTH_CLIENT_JSON || process.env.oauth_client_json || null;
  const b64Content = process.env.OAUTH_CLIENT_JSON_B64 || process.env.oauth_client_json_b64 || null;

  if (!content && b64Content) {
    try {
      content = Buffer.from(b64Content, 'base64').toString('utf8');
    } catch (err) {
      throw new Error('Failed to decode OAUTH_CLIENT_JSON_B64: ' + err.message);
    }
  }

  // Fallback to reading from secrets/oauth_client.json in project root
  if (!content) {
    const filePath = path.join(__dirname, 'secrets', 'oauth_client.json');
    if (!fs.existsSync(filePath)) {
      throw new Error('OAuth client credentials not provided via OAUTH_CLIENT_JSON and file not found at ' + filePath);
    }
    content = fs.readFileSync(filePath, 'utf8');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error('Invalid OAuth client JSON: ' + err.message);
  }

  // Support both installed and web credential formats
  return parsed.installed || parsed.web || parsed;
}

export function getUserOAuthClient() {
  const { client_id, client_secret, redirect_uris } = loadOAuthCredentials();
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  // Load token — prefer B64 variants (safer in .env files) over raw JSON
  const tokenB64 = process.env.OAUTH_TOKEN_JSON_B64 || process.env.oauth_token_json_b64 || null;
  let tokenContent = null;

  if (tokenB64) {
    try {
      tokenContent = Buffer.from(tokenB64, 'base64').toString('utf8');
    } catch (err) {
      throw new Error('Failed to decode OAUTH_TOKEN_JSON_B64: ' + err.message);
    }
  }

  if (!tokenContent) {
    tokenContent = process.env.OAUTH_TOKEN_JSON || process.env.oauth_token_json || null;
  }

  if (!tokenContent) {
    const tokenPath = path.join(__dirname, 'secrets', 'token.json');
    if (!fs.existsSync(tokenPath)) {
      throw new Error('OAuth token not provided via OAUTH_TOKEN_JSON (or variants) and file not found at ' + tokenPath);
    }
    tokenContent = fs.readFileSync(tokenPath, 'utf8');
  }

  let token;
  try {
    token = JSON.parse(tokenContent);
  } catch (err) {
    throw new Error('Invalid OAuth token JSON: ' + err.message);
  }

  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}
