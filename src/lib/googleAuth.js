// src/lib/googleAuth.js
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const __dirname = process.cwd(); // Next.js root

//const CREDENTIALS_PATH = path.join(__dirname, 'secrets', 'oauth_client.json');
//const TOKEN_PATH = path.join(__dirname, 'secrets', 'token.json');

function loadOAuthCredentials() {
  const content = process.env.OAUTH_CLIENT_JSON;

  const { installed } = JSON.parse(content);
  return installed;
}

export function getUserOAuthClient() {
  const { client_id, client_secret, redirect_uris } = loadOAuthCredentials();
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  const token = JSON.parse(process.env.OAUTH_TOKEN_JSON);

  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}
