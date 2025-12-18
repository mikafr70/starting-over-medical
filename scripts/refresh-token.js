// Simple script to refresh OAuth token
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Read .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

// Extract OAuth credentials
const clientMatch = envContent.match(/OAUTH_CLIENT_JSON=(.+)/);
const tokenMatch = envContent.match(/OAUTH_TOKEN_JSON=(.+)/);

if (!clientMatch) {
  console.error('❌ OAUTH_CLIENT_JSON not found in .env.local');
  process.exit(1);
}

const credentials = JSON.parse(clientMatch[1]);
const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n📋 Authorize this app by visiting this URL:\n');
console.log(authUrl);
console.log('\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', async (code) => {
  rl.close();
  
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    
    console.log('\n✅ New token generated successfully!\n');
    console.log('📋 Copy this entire token (including the curly braces):\n');
    console.log(JSON.stringify(tokens));
    console.log('\n');
    console.log('⚠️  Now update your .env.local file:');
    console.log('   Replace the OAUTH_TOKEN_JSON value with the token above');
    console.log('   Then restart your dev server\n');
    
  } catch (err) {
    console.error('❌ Error retrieving access token:', err.message);
    process.exit(1);
  }
});
