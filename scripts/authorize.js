// scripts/authorize.js
// Run this script to generate the OAuth token for creating spreadsheets
// Usage: node scripts/authorize.js

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

//const CREDENTIALS_PATH = path.join(rootDir, 'secrets', 'oauth_client.json');
//const TOKEN_PATH = path.join(rootDir, 'secrets', 'token.json');

// The scopes needed for creating and managing spreadsheets
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

async function authorize() {
  // Load client credentials
  let credentials;
  try {
    //const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    //credentials = JSON.parse(content);
    credentials = JSON.parse(process.env.OAUTH_CLIENT_JSON);
  } catch (err) {
    console.error('Error loading client secret file:', err);
    console.error('\nPlease ensure you have downloaded OAuth credentials from Google Cloud Console');
    //console.error('and saved them to:', CREDENTIALS_PATH);
    process.exit(1);
  }

  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we already have a token
  try {
    //const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    const token = process.env.OAUTH_TOKEN_JSON;
    
    oAuth2Client.setCredentials(JSON.parse(token));
//    console.log('✓ Token already exists at:', TOKEN_PATH);
    console.log('✓ Authorization complete!');
    return;
  } catch (err) {
    // Need to get new token
    return getNewToken(oAuth2Client);
  }
}

function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n📋 Authorize this app by visiting this URL:');
  console.log('\n' + authUrl + '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('Error retrieving access token:', err);
        return;
      }
      
      oAuth2Client.setCredentials(token);
      
      // Store the token
      //fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
      //console.log('\n✓ Token stored to:', TOKEN_PATH);
      process.env.OAUTH_TOKEN_JSON = JSON.stringify(token, null, 2);
      console.log('✓ Authorization complete! You can now create spreadsheets.');
    });
  });
}

// Run the authorization
authorize().catch(console.error);
