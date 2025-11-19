// sheets.js
// Ensure this file runs on the server (Node.js runtime), not on the Edge/client.

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { google } = require('googleapis');
import { env } from 'process';


 // Dictionary mapping animal types to their treatment sheets and animals
export const ANIMAL_TREATMENT_SHEETS = {
  "horse": {
    displayName: "סוס",
    emoji: "🐴",
    sheetId: process.env.HORSES_SHEET_ID,
    folderId: process.env.HORSES_DRIVE_FOLDER_ID,
  },
  "donkey": {
    displayName: "חמור",
    emoji: "🫏",
    sheetId: process.env.DONKEYS_SHEET_ID,
    folderId: process.env.DONKEYS_DRIVE_FOLDER_ID,
  }/*,
  "cow": {
    displayName: "פרה",
    emoji: "🐄",
    sheetId: process.env.COWS_SHEET_ID,
    folderId: process.env.COWS_DRIVE_FOLDER_ID, 
  },
  "dog": {
    displayName: "כלב",
    emoji: "🐕",
    sheetId: process.env.DOGS_SHEET_ID,
    folderId: process.env.DOGS_DRIVE_FOLDER_ID,
  },
  "cat": {
    displayName: "חתול",
    emoji: "🐈",
    sheetId: process.env.CATS_SHEET_ID,
    folderId: process.env.CATS_DRIVE_FOLDER_ID, 
  },
  "goat": {
    displayName: "עז",
    emoji: "🐐",
    sheetId: process.env.GOATS_SHEET_ID,
    folderId: process.env.GOATS_DRIVE_FOLDER_ID,
  },
  "sheep": {
    displayName: "כבשה",
    emoji: "🐑",
    sheetId: process.env.SHEEPS_SHEET_ID,
    folderId: process.env.SHEEPS_DRIVE_FOLDER_ID,
  },
  "rabbit": {
    displayName: "ארנב",
    emoji: "🐰",
    sheetId: process.env.RABBITS_SHEET_ID,
    folderId: process.env.RABBITS_DRIVE_FOLDER_ID,
  },
  "chicken": {
    displayName: "עופות",
    emoji: "🐔",
    sheetId: process.env.CHICKENS_SHEET_ID,
    folderId: process.env.CHICKENS_DRIVE_FOLDER_ID,
  }*/
};

// internal field name -> sheet header (Hebrew)
const FIELD_TO_HEADER = {
  name: 'שם',
  sex: 'מין',
  description: 'תיאור',
  weight: 'משקל',
  arrival_date: 'תאריך הגעה',
  birth_date: 'תאריך לידה',
  id: 'שבב',
  id2: 'שבב נוסף',
  location: 'מתחם',
  special_trimming: 'טילוף מיוחד',
  notes: 'התנהגותי/ הערות',
  drugs: 'טשטוש',
  castration: 'ת.סירוס',
  deworming: 'תאריך תילוע',
  source: 'מקור',
  status: 'סטטוס',
  friends: 'חברויות',
  in_treatment: 'בטיפול',
};


// Service account credentials (env vars)
const CREDENTIALS = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
    : ''
};

// Log credentials (without revealing the full private key)
console.log('Service Account Email:', CREDENTIALS.client_email);
console.log('Private Key exists:', !!CREDENTIALS.private_key);
console.log(
  'Private Key starts with:',
  CREDENTIALS.private_key ? CREDENTIALS.private_key.substring(0, 50) + '...' : 'No key found'
);

// Cache for loaded documents and Drive client
const docCache = new Map();
let driveClient = null;
let sheetsAuth = null;

// --- NEW: JWT auth for Google Sheets (replaces useServiceAccountAuth) ---
function getSheetsAuth() {
  if (!sheetsAuth) {
    if (!CREDENTIALS.client_email || !CREDENTIALS.private_key) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY env vars');
    }
    sheetsAuth = new google.auth.JWT(
      CREDENTIALS.client_email,
      null,
      CREDENTIALS.private_key,
      // Spreadsheets scope is required; Drive scope is NOT required for sheets,
      // we keep drive.readonly separately for the Drive search below.
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  }
  return sheetsAuth;
}

// Initialize Google Drive API client (unchanged)
function getDriveClient() {
  if (!driveClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

/*
*
*
*
*/
async function findSpreadsheetInFolder(animalType,animalId) {
  const drive = getDriveClient();
  const folderId = ANIMAL_TREATMENT_SHEETS[animalType].folderId;

  try {
    // Search for files in the specified folder that contain the animalId
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name contains '${animalId}'`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const files = response.data.files;
    if (files.length === 0) {
      console.log(`No treatment sheet found for animal ${animalId}`);
      return null;
    }

    // Use the first matching file
    return files[0].id;
  } catch (error) {
    console.error('Error searching Drive folder:', error);
    return null;
  }
}

async function getDoc(spreadsheetId) {
  if (!docCache.has(spreadsheetId)) {
    try {
      console.log('Creating new GoogleSpreadsheet instance...');
      console.log('GoogleSpreadsheet type:', typeof GoogleSpreadsheet);
      try {
        const pkg = require('google-spreadsheet/package.json');
        console.log('google-spreadsheet version:', pkg.version);
      } catch (e) {
        console.log('Could not read google-spreadsheet package.json:', e.message);
      }

      // --- CHANGED: build JWT and pass it into the constructor ---
      const auth = getSheetsAuth();
      const doc = new GoogleSpreadsheet(spreadsheetId, auth);

      console.log('Loading document info...');
      await doc.loadInfo();
      console.log('Document loaded:', doc.title);

      docCache.set(spreadsheetId, doc);
    } catch (error) {
      console.error('Error in getDoc:', error);
      throw error;
    }
  }
  return docCache.get(spreadsheetId);
}
export async function findSheetIdByName(folderId, animalName){
  const drive = getDriveClient();
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name contains '${animalName}'`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const files = response.data.files;
    if (files.length === 0) {
      console.log(`No treatment sheet found for animal ${animalName}`);
      return null;
    }

    // Use the first matching file
    return files[0].id;
  } catch (error) {
    console.error('Error searching Drive folder:', error);
    return null;
  }
}

/* 
    -----------------------------------------
    getAnimals(): Reads the main animals sheet and returns a list of animals with their details.
    ----------------------------------------
*/
export async function getAnimals(animalType) {
    console.log('Starting getAnimals...');
    console.log('Animals sheet ID:', ANIMAL_TREATMENT_SHEETS[animalType].sheetId);
    console.log('Service account:', CREDENTIALS.client_email);

    const doc = await getDoc(ANIMAL_TREATMENT_SHEETS[animalType].sheetId);
    console.log('Got doc, title:', doc.title);

    const sheet = doc.sheetsByIndex[0]; // Main animals list sheet
    console.log('Got sheet, title:', sheet.title);

    const rows = await sheet.getRows();
    console.log('Got rows, count:', rows.length);
    const headers = sheet.headerValues; // e.g. ["שם", "מין", "תיאור", ...]
    const headerMap = {};

    headers.forEach((name, idx) => {
        headerMap[name.trim()] = idx;
      });

    const animals = rows.map(row => ({
      id: row._rawData?.[headerMap['שבב']] || '',
      id2: row._rawData?.[headerMap['שבב נוסף']] || '',
      name: row._rawData?.[headerMap['שם']] || '', 
      sex: row._rawData?.[headerMap['מין']] || '',
      description: row._rawData?.[headerMap['תיאור']] || '',
      weight: row._rawData?.[headerMap['משקל']] || '',
      arrival_date: row._rawData?.[headerMap['תאריך הגעה']] || '',
      birth_date: row._rawData?.[headerMap['תאריך לידה']] || '',
      location: row._rawData?.[headerMap['מתחם']] || '',
      special_trimming: row._rawData?.[headerMap['טילוף מיוחד']] || '',
      notes: row._rawData?.[headerMap['התנהגותי/ הערות']] || '',
      drugs: row._rawData?.[headerMap['טשטוש']] || '',
      castration: row._rawData?.[headerMap['ת.סירוס']] || '',
      deworming: row._rawData?.[headerMap['תאריך תילוע']] || '',
      source: row._rawData?.[headerMap['מקור']] || '',
      status: row._rawData?.[headerMap['סטטוס']] || '',
      friends: row._rawData?.[headerMap['חברויות']] || '',
      in_treatment: row._rawData?.[headerMap['בטיפול']] || ''

    }));

    console.log('Mapped animals:', animals[1]);
    return animals;
}

/* 
    -----------------------------------------
    getAnimalTreatments(): Reads the treatment sheet for a given animal and returns its treatments.
    ----------------------------------------
*/
export async function getAnimalTreatments(animalType, animalId) {
  try {
    console.log(`Starting getAnimalTreatments for animalId: ${animalId}`);
    // Find the treatment sheet for this animal in the Drive folder
    const spreadsheetId = await findSpreadsheetInFolder(animalType,  animalId);
    if (!spreadsheetId) {
      return [];
    }

    // Load the spreadsheet and get the first sheet
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues; // e.g. ["שם", "מין", "תיאור", ...]
    const headerMap = {};

      headers.forEach((name, idx) => {
        headerMap[name.trim()] = idx;
      });

  
    const treatments = rows.map(row => ({
      date: row._rawData?.[headerMap['תאריך']] || row._rawData?.[0] || '',
      day: row._rawData?.[headerMap['יום']] || '',
      morning: row._rawData?.[headerMap['בוקר']] || '',
      noon: row._rawData?.[headerMap['צהריים']] || '',
      evening: row._rawData?.[headerMap['ערב']] || '',
      treatment: row._rawData?.[headerMap['טיפול']] || '',
      dosage: row._rawData?.[headerMap['מינון']] || '',
      administration: row._rawData?.[headerMap['מתן']] || '',
      duration: row._rawData?.[headerMap['משך']] || '',
      location: row._rawData?.[headerMap['מתחם']] || '',
      case: row._rawData?.[headerMap['סיבת טיפול']] || '',
      notes: row._rawData?.[headerMap['הערות']] || ''
    }));
    //console.log('Mapped 5 treatments:', treatments.slice(0, 5));

  return treatments

  } catch (error) {
    console.error(`Error fetching treatments for animal ${animalId}:`, error);
    return [];
  }
}


/*
    -----------------------------------------
    getAnimalsFromSheet(): Read animals from a given spreadsheet ID (first sheet)
    ----------------------------------------
*/
export async function getAnimalsFromSheet(spreadsheetId) {
  try {
    console.log('Starting getAnimalsFromSheet...');
    if (!spreadsheetId) return [];
    console.log(`Loading animals from sheetId: ${spreadsheetId}`);
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues; // e.g. ["שם", "מין", "תיאור", ...]
    const headerMap = {};

    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });


    const animals = rows.map(row => ({
      id:  row._rowNumber?.toString()  || '',
      name: row._rawData?.[headerMap['שם']] || '',
      gender:  row._rawData?.[headerMap['מין']] || '',
      id_number:  row._rawData?.[headerMap['שבב']] || '',      
      id_number2:  row._rawData?.[headerMap['שבב נוסף']] || '',
      location:  row._rawData?.[headerMap['מתחם']] || '',
      description: row._rawData?.[headerMap['תיאור']] || '',
      weight: row._rawData?.[headerMap['משקל']] || '',
      arrival_date: row._rawData?.[headerMap['תאריך הגעה']] || '',  
      birth_date: row._rawData?.[headerMap['תאריך לידה']] || '',
      special_trimming: row._rawData?.[headerMap['טילוף מיוחד']] || '',
      notes: row._rawData?.[headerMap['התנהגותי/ הערות']] || '',
      drugs: row._rawData?.[headerMap['טשטוש']] || '',  
      castration: row._rawData?.[headerMap['ת.סירוס']] || '',
      deworming: row._rawData?.[headerMap['תאריך תילוע']] || '',
      source: row._rawData?.[headerMap['מקור']] || '',
      status: row._rawData?.[headerMap['סטטוס']] || '',
      friends: row._rawData?.[headerMap['חברויות']] || '',
      in_treatment: row._rawData?.[headerMap['בטיפול']] || ''
      }));

      // console loge first 3 animals for verification
      //console.log('First 3 animals:', animals.slice(0, 3));

    console.log(`Found ${animals.length} animals in sheet ${spreadsheetId}`);
    return animals;
  } catch (error) {
    console.error(`Error reading animals from sheet ${spreadsheetId}:`, error);
    return [];
  }
}

// Read protocols for a given animal type from spreadsheet ID (first sheet)
export async function getProtocolsFromSheet(spreadsheetId, animalType) {
  try {
    if (!spreadsheetId) return [];
    console.log(`Loading protocols from sheetId: ${spreadsheetId}`);
    console.log(`animal type is: ${animalType}`);
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    console.log(`found rows: : ${rows.length}`);

    // Map possible headers (English or Hebrew)
    // Bidirectional mapping for animal types
    const typeMapping = {
        // English to Hebrew
        'horse': 'סוס',
        'donkey': 'חמור',
        'cow': 'פרה',
        'dog': 'כלב',
        'cat': 'חתול',
        'goat': 'עז',
        'sheep': 'כבשה',
        'rabbit': 'ארנב',
        'chicken': 'תרנגול',
        // Hebrew to English
        'סוס': 'horse',
        'חמור': 'donkey',
        'פרה': 'cow',
        'כלב': 'dog',
        'חתול': 'cat',
        'עז': 'goat',
        'כבשה': 'sheep',
        'ארנב': 'rabbit',
        'תרנגול': 'chicken'
    };



    await sheet.loadHeaderRow();
    const headers = sheet.headerValues; // e.g. ["שם", "מין", "תיאור", ...]
    const headerMap = {};

    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });

    const protocols_for_animal = rows.map(row => ({
      type: row._rawData?.[headerMap['חיה']] || '',
      case: row._rawData?.[headerMap['אבחון']] || '',
      medication: row._rawData?.[headerMap['תרופה']] || '',
      days: row._rawData?.[headerMap['ימים']] || '',
      frequency: row._rawData?.[headerMap['תדירות']] || '',
      morning: row._rawData?.[headerMap['בוקר']] || '',
      noon: row._rawData?.[headerMap['צהריים']] || '',
      evening: row._rawData?.[headerMap['ערב']] || ''


    }));

    // Convert input type if needed and handle both Hebrew and English
   
    let searchType = animalType;
    // If the input is in English, convert to Hebrew
    if (typeMapping[animalType]) {
        searchType = typeMapping[animalType];
    }
    // If the input is in Hebrew, use as is
    else if (Object.values(typeMapping).includes(animalType)) {
        searchType = animalType;
    }

    
    const relevant_protocols = protocols_for_animal.filter(row => {
        const rowType = (row.type || '').trim();
        const matches = rowType === searchType;
        return matches;
    });
    return relevant_protocols;
  } catch (error) {
    console.error(`Error reading protocols from sheet ${spreadsheetId}:`, error);
    return [];
  }
}


/* ---------------------------------------------------
Insert treatment rows at the top of the first sheet (after headers)
-----------------------------------------------------
*/
export async function addTreatmentAtTop(spreadsheetId, rowData = {}) {
  const rowsToAdd = Array.isArray(rowData) ? rowData : [rowData];
  try {
    if (!spreadsheetId) throw new Error('spreadsheetId is required');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const sheetId = sheet.sheetId;

    console.log(`rowData - ${JSON.stringify(rowData[1])}`);
    console.log(`checkboxes values: morning - ${rowData[1].morning} , noon - ${rowData[1].noon} , evening - ${rowData[1].evening}`);

    // Use Google Sheets API to insert a row at index 1 (after header row)
    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });

    // Insert new rows (shift rows down) at position 1
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 1 + rowsToAdd.length
              },
              inheritFromBefore: false
          }
          }
        ]
      }
    });

    // Build values in the requested order for each row:
    // date day morning noon evening treatment dosage body part duration location case notes
    // Build values where morning/noon/evening are TRUE when present, otherwise blank
    const values = rowsToAdd.map(rowData => {
      const date = rowData.date || new Date().toLocaleDateString();
      const day = rowData.day || '';
      // For checkboxes: set FALSE when input is truthy so an unchecked checkbox
      // is shown; otherwise leave blank so the cell stays empty.
      // (In Sheets, boolean FALSE renders as an unchecked checkbox when a
      // checkbox data-validation rule is applied.)
      //const morning = (rowData.morning === 1 || rowData.morning === 'TRUE' || rowData.morning === '') ? false : '';
      //const noon = (rowData.noon === 1 || rowData.noon === 'TRUE' || rowData.noon === '') ? false : '';
      //const evening = (rowData.evening === 1 || rowData.evening === 'TRUE' || rowData.evening === '') ? false : '';
      const morning = rowData.morning ;
      const noon = rowData.noon;
      const evening = rowData.evening ;
      const treatment = rowData.treatment || '';
      const dosage = rowData.dosage || '';
      const bodyPart = rowData.bodyPart || rowData['body part'] || '';
      const duration = rowData.duration || '';
      const location = rowData.location || '';
      const caseField = rowData.case || '';
      const notes = rowData.notes || '';

      return [date, day, morning, noon, evening, treatment, dosage, bodyPart, duration, location, caseField, notes];
    });

    // Write the values to the new rows (A2:L{n+1})
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:L${1 + rowsToAdd.length}`,
      valueInputOption: 'RAW',
      resource: { values }
    });

    // ✅ Use USER_ENTERED so Sheets interprets the ISO date as a real date
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:L${1 + rowsToAdd.length}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });


    // Apply checkbox validation only to cells that should display a checkbox.
    // This prevents empty cells from showing an unchecked checkbox.
    const validationRequests = [];
    for (let i = 0; i < rowsToAdd.length; i++) {
      const row = rowsToAdd[i];
      const startRow = 1 + i; // rows inserted start at index 1
      //console.log('Processing validation for row:', row);
      if (row.morning === 'TRUE' || row.morning === 'FALSE') {
        console.log('Adding morning checkbox validation at row:');
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 2, // C
              endColumnIndex: 3
            },
            rule: {
              condition: { type: 'BOOLEAN' },
              showCustomUi: row.morning === 'TRUE'
            }
          }
        });
      }
      else{
        console.log('Morning checkbox value is not TRUE or FALSE:', row.morning);
        // setting type to empty (removes checkbox)
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 2, // C
              endColumnIndex: 3
            },
            rule: null
          }
        });
      }

      if (row.noon === 'TRUE' || row.noon === 'FALSE') {
        console.log('Adding noon checkbox validation at row:');
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 3, // D
              endColumnIndex: 4
            },
            rule: {
              condition: { type: 'BOOLEAN' },
              showCustomUi: row.noon === 'TRUE'
            }
          }
        });
      }
      else{
        console.log('Noon checkbox value is not TRUE or FALSE:', row.noon);
        // setting type to empty (removes checkbox)
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 3, // D
              endColumnIndex: 4
            },
            rule: null
          }
        });
      }



      if (row.evening === 'TRUE' || row.evening === 'FALSE') {
        console.log('Adding evening checkbox validation at row:');
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 4, // E
              endColumnIndex: 5
            },
            rule: {
              condition: { type: 'BOOLEAN' },
              showCustomUi: row.evening === 'TRUE'
            }
          }
        });
      }
      else{
        console.log('Evening checkbox value is not TRUE or FALSE:', row.evening);
        // setting type to empty (removes checkbox)
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 4, // E
              endColumnIndex: 5
            },
            rule: null
          }
        });
      }
    }
    

    if (validationRequests.length > 0) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests: validationRequests }
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error in addTreatmentAtTop:', error);
    throw error;
  }
}

/* ---------------------------------------------------
read all of the sheets in folderId that were modified in the last 2 weeks. and pull all of the rows where the date (first column) is today
-----------------------------------------------------
*/
export async function readRecentSheetsAndRows(animalType) {
  try {
    const drive = getDriveClient();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const todayStr = new Date().toLocaleDateString(); 
    console.log('twoWeeksAgo:', twoWeeksAgo.toISOString());

    // Search for spreadsheets in the folder modified in the last 2 weeks
    const response = await drive.files.list({
      q: `'${ANIMAL_TREATMENT_SHEETS[animalType].folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime > '${twoWeeksAgo.toISOString()}'`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });
    const files = response.data.files;
    console.log(`Found ${files.length} recent sheets in folder ${ANIMAL_TREATMENT_SHEETS[animalType].folderId}`);
    const results = [];

    for (const file of files) {
      console.log(`Processing sheet: ${file.name} (ID: ${file.id})`);
      const doc = await getDoc(file.id);
      const sheet = doc.sheetsByIndex[0];
      const rows = await sheet.getRows();
      await sheet.loadHeaderRow();
      const headers = sheet.headerValues; 
      const headerMap = {};
      headers.forEach((name, idx) => {
        headerMap[name.trim()] = idx;
      });

      // Filter rows where the date in the first column matches today
      const todayRows = rows.filter(row => {
        const rowDate = row._rawData?.[0];
        return rowDate === todayStr;
      });
      results.push(...todayRows);
    }

    return results;
  } catch (error) {
    console.error('Error in readRecentSheetsAndRows:', error);
    throw error;
  }
} 


/* ---------------------------------------------------
upadte line by name of the animal in the animal list sheet
-----------------------------------------------------
*/
export async function updateAnimalInList(animalType, animalName, updateData = {}) {
  try {
    console.log(`Starting updateAnimalInList for animal: ${animalName} of type: ${animalType}`);
    console.log('Update data:', updateData);

    const spreadsheetId = ANIMAL_TREATMENT_SHEETS[animalType]?.sheetId;
    if (!spreadsheetId) throw new Error('ANIMAL_TREATMENT_SHEETS[animalType]?.sheetId is required');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];

    /*
    console.log('Testing write by adding a row...');
    try {
      const testRow = await sheet.addRow({ 'שם': 'WRITE_TEST_' + Date.now() });
      console.log('addRow succeeded, new row _rowNumber:', testRow._rowNumber);
    } catch (e) {
      console.error('addRow failed:', e)};
*/
    // 1. Load headers first
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers);

    // 2. Find the "שם" column (by trimmed header)
    const nameColIndex = headers.findIndex(h => h && h.trim() === 'שם');
    console.log('Name column index:', nameColIndex);

    if (nameColIndex === -1) {
      throw new Error(`Could not find 'שם' header in sheet ${spreadsheetId}`);
    }

    const nameHeader = headers[nameColIndex];
    console.log('Using name header:', nameHeader, 'at index', nameColIndex);
    
    // 3. Load rows
    const rows = await sheet.getRows();
    let rowIndex = -1;
    // 4. Find row by trimmed name
    const targetName = (animalName).toString().trim();
    const targetRow = rows.find((row, i) => {
      const cellValue = row._rawData?.[nameColIndex];
      const rowName = (cellValue).toString().trim();
      
      // Debug compare – keep this while debugging
      console.log(`Row ${i} name: "${rowName}" (raw:`, cellValue, ')');
      rowIndex = i;
      return rowName === targetName;

    });


    if (!targetRow) {
      throw new Error(`Animal with name "${animalName}" not found in sheet ${spreadsheetId}`);
    }

    // 5. Update fields (using header names)
    for (const [key, value] of Object.entries(updateData)) {
      const mappedHeader = FIELD_TO_HEADER[key];  // e.g. "תיאור"

      if (!mappedHeader) {
        console.warn(`No header mapping found for key "${key}" in sheet ${spreadsheetId}`);
        continue;
      }

      // Find the real header string from the sheet (with exact spaces etc.)
      const actualHeader = headers.find( h => h && h.trim() === mappedHeader.trim());
      const actualHeaderIndex = headers.findIndex( h => h && h.trim() === mappedHeader.trim());

      if (!actualHeader) {
        console.warn(`Header "${mappedHeader}" (for key "${key}") not found in sheet ${spreadsheetId}`);
        continue;
      }

      console.log(`Updating column "${actualHeader}" (key "${key}") to:`, value);

      // convert actualHeaderIndex to column letter
      const columnLetter = String.fromCharCode(65 + actualHeaderIndex); // 65 is 'A'
      const cellsString = `A${rowIndex+1}:${columnLetter}${rowIndex+2}`;
      //console.log(`cells string: ${cellsString}`);      
      await sheet.loadCells(cellsString); // row 7, col 2 (0-indexed)
      const cell = sheet.getCell(rowIndex+1, actualHeaderIndex); // row 7, col 2 (0-indexed)
      cell.value = value;
      //console.log(`Updating cell at row ${rowIndex+1}, col ${actualHeaderIndex} to:`, value);

      await sheet.saveUpdatedCells();
  }

    console.log(`Animal ${animalName} updated successfully.`);
    return { success: true };
  } catch (error) {
    console.error('Error in updateAnimalInList:', error);
    throw error;
  }
}

function parseDMY(str) {
  const [day, month, year] = str.split('/').map(Number);
  return (year * 10000) + (month * 100) + day;  // YYYYMMDD
}

/* ---------------------------------------------------
delete animal treatments between dates in animal sheet
-----------------------------------------------------
*/
export async function deleteAnimalTreatmentsBetweenDates(animalType, animalName, startDateStr, endDateStr) {
  try {
    console.log(`Starting updateAnimalTreatmentsInFile for animal: ${animalName} of type: ${animalType}`);
    const spreadsheetId = await findSheetIdByName(ANIMAL_TREATMENT_SHEETS[animalType].folderId, animalName);
    if (!spreadsheetId) throw new Error('Could not find treatment sheet for animal: ' + animalName);  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    // 1. Load headers first
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers);  
    // 2. Load rows
    const rows = await sheet.getRows();
    let rowsDeleted = 0;
    console.log(`-----Deleting treatments between ${startDateStr} and ${endDateStr}`); 

    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr); 
      const startDate = parseDMY(startDateStr); 
      const endDate = parseDMY(endDateStr); 

      //const [day, month, year] = rowDateStr.split('/');
      //const rowDate = new Date(+year, month - 1, +day,);
 
      if (rowDate >= startDate && rowDate <= endDate) {
        //console.log(`Deleting row with date: ${rowDateStr}`);
        await row.delete();   // <-- now REALLY awaited
        rowsDeleted++;
      }
    }

    console.log(`Deleted ${rowsDeleted} treatment rows for animal ${animalName}.`);
    return { success: true, rowsDeleted };
  } catch (error) {
    console.error('Error in deleteAnimalTreatmentsBetweenDates:', error);
    throw error;
  }   
}

/* ---------------------------------------------------
sort animal treatments sheet by date descending
-----------------------------------------------------
*/
export async function sortAnimalTreatmentsByDateDescending(spreadsheetId){
  try {
    console.log(`Starting sortAnimalTreatmentsByDateDescending for sheetID: ${spreadsheetId}`);

    if (!spreadsheetId) throw new Error('Could not find treatment sheet for animal: ' );  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    const sheetId = sheet.sheetId;

    // Use Google Sheets API to sort by date descending
    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth }); 
    // Sort by first column (date) descending
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,  
      resource: {
        requests: [
          { 
            sortRange: {
              range: {
                sheetId: sheetId, 
                startRowIndex: 1, // Skip header row
                endRowIndex: sheet.rowCount,
                startColumnIndex: 0,
                endColumnIndex: sheet.columnCount
              },
              sortSpecs: [
                {   
                  dimensionIndex: 0, // First column
                  sortOrder: 'DESCENDING'
                }
              ]
            } 
          }
        ]
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error in sortAnimalTreatmentsByDateDescending:', error);
    throw error;
  }
}

/* ---------------------------------------------------
retrieve caregiver name by email from sheet
-----------------------------------------------------
*/    
export async function getCaregiverNameFromSheet(email) {
  try {
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    console.log(`Starting getCaregiverNameFromSheet for sheetID: ${spreadsheetId}`);  
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet' );  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers);
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    const emailColIndex = headers.findIndex(h => h && h.trim().toLowerCase() === 'מייל');
    console.log('Caregiver column index:', caregiverColIndex);
    console.log('Email column index:', emailColIndex);
    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    }
    const rows = await sheet.getRows();
    const caregiverNames = new Set();
    for (const row of rows) {
      const caregiverName = row._rawData?.[caregiverColIndex];
      if (email === row._rawData?.[emailColIndex]) {
        console.log(`Found caregiver name: ${caregiverName} for email: ${email}`);
        return caregiverName;  // Return the first matching name
      }
    }
    return '';
  } catch (error) {
    console.error('Error in getCaregiverNameFromSheet:', error);
    throw error;
  }
}

// ---------------------------------------------------
// Return all caregiver names from the caregivers sheet
// ---------------------------------------------------
export async function getAllCaregivers() {
  try {
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet');
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    }
    const rows = await sheet.getRows();
    const names = [];
    for (const row of rows) {
      const caregiverName = row._rawData?.[caregiverColIndex];
      if (caregiverName) {
        const trimmed = caregiverName.toString().trim();
        if (trimmed && !names.includes(trimmed)) names.push(trimmed);
      }
    }
    return names;
  } catch (error) {
    console.error('Error in getAllCaregivers:', error);
    throw error;
  }
}

/* ---------------------------------------------------
retreive all animals for caregiver with treatments today
-----------------------------------------------------
*/
export async function getAnimalsForCaregiverWithTreatementsToday(caregiverName) {
  try {
    console.log(`Starting getAnimalsForCaregiverWithTreatementsToday for caregiver: ${caregiverName}`);
    const todayDate = new Date(); 
    const todayStr = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()}`;
    console.log(`-----------------Today's date string: ${todayStr}`);
    const animalsWithTodayTreatments = [];
    for (const animalType of Object.keys(ANIMAL_TREATMENT_SHEETS)) {
      console.log(`Processing animal type: ${animalType}`);

      // read animals sheet to get all animals assigned to this caregiver
      const animals =   await getAnimals(animalType);
      console.log(`Fetched ${animals.length} animals for type ${animalType}`);
      
      const assignedAnimals = animals.filter(animal => {
        const inTreatementsField = (animal.in_treatment || '').toString();  
        const caregivers = inTreatementsField.split(',').map(name => name.trim());
        return caregivers.includes(caregiverName)});
      console.log(`Found ${assignedAnimals.length} assigned animals for caregiver ${caregiverName} in type ${animalType}`);
      console.log(`Assigned animals: ${assignedAnimals.map(a => a.id).join(', ')}`);
     
    
      for (const animal of assignedAnimals) {
            const spreadsheetId = await findSpreadsheetInFolder(animalType, animal.id);
            console.log(`Animal ID: ${animal.id}, Spreadsheet ID: ${spreadsheetId}`);
            if(await hasTreatmentToday(spreadsheetId, todayStr)) {
                animal.animalType = animalType; // add animal type to the object
                animalsWithTodayTreatments.push(animal);
                console.log(`Animal : ${animal.name} has treatment today.`);
              }
        }
        console.log(`Found Treatements today for ${animalsWithTodayTreatments.length} assigned animals for caregiver ${caregiverName} in type ${animalType}`);
    }
    return animalsWithTodayTreatments;  
  } catch (error) {
    console.error('Error in getAnimalsForCaregiverWithTreatementsToday:', error);
    throw error;
  }
}

/* ---------------------------------------------------
check if sheet has treatment today
----------------------------------------------------- */
export async function hasTreatmentToday(sheetId, todayStr) {
  try {  
    console.log(`Starting hasTreatmentToday for sheetID: ${sheetId} and date: ${todayStr}`);  
    if (!sheetId) throw new Error('sheetId is required');  
    const doc = await getDoc(sheetId);  
    const sheet = doc.sheetsByIndex[0];  
    const rows = await sheet.getRows(); 
    // Check if any row has today's date in the first column
    //const hasToday = rows.some(row => {
    //const rowDate = row._rawData?.[0];
    for(const row of rows) {
      const stringDate = row._rawData?.[0]//`${row._rawData?.[0].getDate()}/${row._rawData?.[0].getMonth() + 1}/${row._rawData?.[0].getFullYear()}`;
      //console.log(`Comparing row date: ${stringDate} with today: ${todayStr}`);
        if(parseDMY(stringDate) === parseDMY(todayStr)) {
            console.log(`Found treatment for today: ${todayStr} in row date: ${row._rawData?.[0]}`);
            return true;
        }
    }
    return false;
  } catch (error) {
    console.error('Error in hasTreatmentToday:', error);
    throw error;
  }
} 