// sheets.js - Utility functions for Google Sheets integration
// This runs on the Node.js runtime in Next.js API routes

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { google } from 'googleapis';


// Initialize configuration from sheet on module load
let configLoaded = false;
let configPromise = null;

/*--------------------------------------------------
 Internal field name -> sheet header (Hebrew)
---------------------------------------------------*/
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



/*--------------------------------------------------
  Animal treatment sheets configuration
---------------------------------------------------*/
export const ANIMAL_TREATMENT_SHEETS = () => ({
  donkey: {
    displayName: "חמור",
    emoji: "🫏",
    sheetId: process.env.DONKEYS_SHEET_ID,
    folderId: process.env.DONKEYS_DRIVE_FOLDER_ID,
  },
  horse: {
    displayName: "סוס",
    emoji: "🐴",
    sheetId: process.env.HORSES_SHEET_ID,
    folderId: process.env.HORSES_DRIVE_FOLDER_ID,
  },
  cow: {
    displayName: "פרה",
    emoji: "🐄",
    sheetId: process.env.COWS_SHEET_ID,
    folderId: process.env.COWS_DRIVE_FOLDER_ID,
  },
  dog: {
    displayName: "כלב",
    emoji: "🐕",
    sheetId: process.env.DOGS_SHEET_ID,
    folderId: process.env.DOGS_DRIVE_FOLDER_ID,
  },
  cat: {
    displayName: "חתול",
    emoji: "🐈",
    sheetId: process.env.CATS_SHEET_ID,
    folderId: process.env.CATS_DRIVE_FOLDER_ID,
  },
  goat: {
    displayName: "עז",
    emoji: "🐐",
    sheetId: process.env.GOATS_SHEET_ID,
    folderId: process.env.GOATS_DRIVE_FOLDER_ID,
  },
  //sheep: {
  //  displayName: "כבשה",
  //  emoji: "🐑",
  //  sheetId: process.env.SHEEPS_SHEET_ID,
  //  folderId: process.env.SHEEPS_DRIVE_FOLDER_ID,
  //},
  rabbit: {
    displayName: "ארנב",
    emoji: "🐰",
    sheetId: process.env.RABBITS_SHEET_ID,
    folderId: process.env.RABBITS_DRIVE_FOLDER_ID,
  },
  chicken: {
    displayName: "עופות",
    emoji: "🐔",
    sheetId: process.env.CHICKENS_SHEET_ID,
    folderId: process.env.CHICKENS_DRIVE_FOLDER_ID,
  },
  pig: {
    displayName: "חזיר",
    emoji: "🐖",
    sheetId: process.env.PIGS_SHEET_ID,
    folderId: process.env.PIGS_DRIVE_FOLDER_ID,
  },
});


/*--------------------------------------------------
 Helper function to get all animal types
---------------------------------------------------*/
export function getAllAnimalTypes() {
  const sheets = ANIMAL_TREATMENT_SHEETS();   // call the function
  return Object.entries(sheets).map(([type, info]) => ({
    id: type,
    displayName: info.displayName,
    emoji: info.emoji,
  }));
}


/*--------------------------------------------------
 Service account credentials (env vars)
---------------------------------------------------*/
function getCredentials() {
  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY
      ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
      : ''
  };
}


/*--------------------------------------------------
 Get current CREDENTIALS (lazily evaluate)
---------------------------------------------------*/
Object.defineProperty(global, 'CREDENTIALS', {
  get: () => getCredentials(),
  configurable: true
});



/*--------------------------------------------------
 Log credentials (without revealing the full private key)
---------------------------------------------------*/
function logCredentials() {
  const creds = getCredentials();
  console.log('Service Account Email:', creds.client_email);
  console.log('Private Key exists:', !!creds.private_key);
  console.log(
    'Private Key starts with:',
    creds.private_key ? creds.private_key.substring(0, 50) + '...' : 'No key found'
  );
}

/*--------------------------------------------------
/ --- JWT auth for Google Sheets (replaces useServiceAccountAuth) ---
----------------------------------------------------*/
function getSheetsAuth() {
  if (!sheetsAuth) {
    const email = CREDENTIALS.client_email;
    const key = CREDENTIALS.private_key;
    
    if (!email || !key) {
      console.error('❌ Missing Google Sheets credentials!');
      console.error('Set one of these options:');
      console.error('  1. Set CONFIGURATION_SHEET_ID env var to load config from Google Sheet');
      console.error('  2. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY env vars directly');
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY env vars');
    }
    sheetsAuth = new google.auth.JWT(
      email,
      null,
      key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  }
  return sheetsAuth;
}



// Cache for loaded documents and Drive client

let driveClient = null;
let sheetsAuth = null;

// read configuration sheet and set all configurations
async function readConfigurationSheet() {
  await ensureConfigLoaded();
  const configSheetId = process.env.CONFIGURATION_SHEET_ID;
  console.log('>>> Reading configuration sheet with ID:', configSheetId);
  if (!configSheetId) {
    console.warn('⚠️  Missing CONFIGURATION_SHEET_ID env var - will use environment variables directly');
    console.warn('Please set CONFIGURATION_SHEET_ID to enable dynamic configuration loading from Google Sheet');
    return;
  }
  try {
    const doc = await getDoc(configSheetId);
    const sheet = doc.sheetsByIndex[0]; // Assuming first sheet
    const rows = await sheet.getRows();
    rows.forEach(row => {
      const key = row['Key'] || row._rawData?.[0];
      const value = row['Value'] || row._rawData?.[1];
      if (key && value) {
        process.env[key] = value;
        //console.log(`✓ Loaded config: ${key}`);
      }
    });
    console.log('✓ Configuration sheet loaded and environment variables set.');
    configLoaded = true;
  } catch (error) {
    console.error('✗ Error reading configuration sheet:', error.message);
    console.error('Ensure CONFIGURATION_SHEET_ID is set and accessible');
    throw error;
  }
}

/*---------------------------------------------------
Export ensureConfigLoaded function
---------------------------------------------------*/
export async function ensureConfigLoaded() {
  if (configPromise) {
    await configPromise;
  }
}


/*---------------------------------------------------
 Initialize config on module load
---------------------------------------------------*/
if (!configLoaded && !configPromise) {
  configPromise = readConfigurationSheet().catch(err => {
    console.error('Failed to load configuration sheet:', err);
  });
  // Log after config is loaded
  configPromise.then(() => logCredentials()).catch(() => {
    console.log('Could not log credentials after config load');
  });
}

/*--------------------------------------------------
  Initialize Google Drive API client
---------------------------------------------------*/
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



//---------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------


/*--------------------------------------------------
  Get Google Spreadsheet document
---------------------------------------------------*/
export async function getDoc(spreadsheetId) {
  try {
    console.log('>>> Loading document info...');
    ensureConfigLoaded()
    const auth = getSheetsAuth();
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    //await doc.useServiceAccountAuth(CREDENTIALS);    
    await doc.loadInfo();
    console.log('<<< Document loaded:', doc.title);

    return doc;
  } catch (error) {
      console.error('Error Reading document:', error);
      throw error;
  } 
}

/*-------------------------------------------------
 Find spreadsheet in folder
--------------------------------------------------*/
async function findSpreadsheetInFolder(animalType, animalId) {
  await ensureConfigLoaded();
  const drive = getDriveClient();
  const folderId = ANIMAL_TREATMENT_SHEETS()[animalType].folderId;

  try {
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

    return files[0].id;
  } catch (error) {
    console.error('Error searching Drive folder:', error);
    return null;
  }
}



/*--------------------------------------------------
 Find sheet ID by animal name in folder
---------------------------------------------------*/
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

    return files[0].id;
  } catch (error) {
    console.error('Error searching Drive folder:', error);
    return null;
  }
}

/*--------------------------------------------------
  Get animals from main animals sheet
---------------------------------------------------*/
export async function getAnimals(animalType) {
    //if (configPromise) await configPromise;
    await ensureConfigLoaded();
    
    try {
    console.log('>>> getAnimals for type:', animalType);
    
    console.log('@@@Animals sheet ID:', ANIMAL_TREATMENT_SHEETS()[animalType].sheetId);
  
    const doc = await getDoc(ANIMAL_TREATMENT_SHEETS()[animalType].sheetId);
    console.log('@@@Got doc, title:', doc.title);

    const sheet = doc.sheetsByIndex[0];
    console.log('Got sheet, title:', sheet.title);

    const rows = await sheet.getRows();
    console.log('@@@Got rows, count:', rows.length);
    const headers = sheet.headerValues;
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

    //console.log('Mapped animals:', animals[1]);
    return animals;
    } catch (error) 
  {
    console.error(`Error in getAnimals: of type: ${animalType}`, error);
    return []
  }

}

/*--------------------------------------------------
  Get treatments for an animal
---------------------------------------------------*/
export async function getAnimalTreatments(animalType, animalId) {
  try {
    console.log(`>>> getAnimalTreatments for animalId: ${animalId}`);
    await ensureConfigLoaded();
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalId);
    if (!spreadsheetId) {
      return [];
    }

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    console.log(`Fetched ${rows.length} treatment rows for animal ${animalId}`);
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const headerMap = {};

    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    const treatmentsMap = rows.map(row => ({
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


    return treatmentsMap;
  } catch (error) {
    console.error(`Error fetching treatments for animal ${animalId}:`, error);
    return [];
  }
}

/*--------------------------------------------------
  Get animals from a sheet by ID
---------------------------------------------------*/
export async function getAnimalsFromSheet(spreadsheetId) {
  try {
    console.log('>>> getAnimalsFromSheet...');
    await ensureConfigLoaded();
    if (!spreadsheetId) return [];
    console.log(`Loading animals from sheetId: ${spreadsheetId}`);
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
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

    console.log(`Found ${animals.length} animals in sheet ${spreadsheetId}`);
    return animals;
  } catch (error) {
    console.error(`Error reading animals from sheet ${spreadsheetId}:`, error);
    return [];
  }
}

/*--------------------------------------------------
  Get protocols from sheet
---------------------------------------------------*/
export async function getProtocolsFromSheet(spreadsheetId, animalType) {
  try {
    if (!spreadsheetId) return [];
    await ensureConfigLoaded();
    console.log(`>>> Loading protocols from sheetId: ${spreadsheetId}, animalType: ${animalType}`);
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    console.log(`found rows: ${rows.length}`);

    const typeMapping = {
      'horse': 'סוס',
      'donkey': 'חמור',
      'cow': 'פרה',
      'dog': 'כלב',
      'cat': 'חתול',
      'goat': 'עז',
      'sheep': 'כבשה',
      'rabbit': 'ארנב',
      'pig': 'חזיר',
      'סוס': 'horse',
      'חמור': 'donkey',
      'פרה': 'cow',
      'כלב': 'dog',
      'חתול': 'cat',
      'עז': 'goat',
      'כבשה': 'sheep',
      'ארנב': 'rabbit',
      'חזיר': 'pig'
    };

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
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

    let searchType = animalType;
    if (typeMapping[animalType]) {
      searchType = typeMapping[animalType];
    }
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

/*--------------------------------------------------
  Add treatments at the top of sheet
---------------------------------------------------*/
export async function addTreatmentAtTop(spreadsheetId, rowData = {}) {
  await ensureConfigLoaded();
  console.log(`>>> addTreatmentAtTop for spreadsheetId: ${spreadsheetId}`);
  const rowsToAdd = Array.isArray(rowData) ? rowData : [rowData];
  try {
    if (!spreadsheetId) throw new Error('spreadsheetId is required');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const sheetId = sheet.sheetId;

    console.log(`rowData - ${JSON.stringify(rowData[1])}`);
    console.log(`checkboxes values: morning - ${rowData[1].morning} , noon - ${rowData[1].noon} , evening - ${rowData[1].evening}`);

    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });

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

    const values = rowsToAdd.map(rowData => {
      const date = rowData.date || new Date().toLocaleDateString();
      const day = rowData.day || '';
      const morning = rowData.morning;
      const noon = rowData.noon;
      const evening = rowData.evening;
      const treatment = rowData.treatment || '';
      const dosage = rowData.dosage || '';
      const bodyPart = rowData.bodyPart || rowData['body part'] || '';
      const duration = rowData.duration || '';
      const location = rowData.location || '';
      const caseField = rowData.case || '';
      const notes = rowData.notes || '';

      return [date, day, morning, noon, evening, treatment, dosage, bodyPart, duration, location, caseField, notes];
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:L${1 + rowsToAdd.length}`,
      valueInputOption: 'RAW',
      resource: { values }
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:L${1 + rowsToAdd.length}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    const validationRequests = [];
    for (let i = 0; i < rowsToAdd.length; i++) {
      const row = rowsToAdd[i];
      const startRow = 1 + i;

      if (row.morning === 'TRUE' || row.morning === 'FALSE') {
        console.log('Adding morning checkbox validation at row:');
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 2,
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
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 2,
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
              startColumnIndex: 3,
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
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 3,
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
              startColumnIndex: 4,
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
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,  
              startColumnIndex: 4,
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

/*--------------------------------------------------
  Helper to parse date in DD/MM/YYYY format
---------------------------------------------------*/
function parseDMY(str) {
  if (!str) return 0;
    if (str.includes('T')) {
    str = str.split('T')[0];
  }
  const parts_slash = str.toString().split('/');
  const parts_dash = str.toString().split('-');
   if (parts_slash.length === 3){
    const [day, month, year] = parts_slash.map(Number);  
    return  (year * 10000) + (month * 100) + day;
  }
  if (parts_dash.length === 3){
    const [year, month, day] = parts_dash.map(Number);  
    return  (year * 10000) + (month * 100) + day;
  }
  console.log('Date string not in expected format:', str);
  return 0;
}

/*--------------------------------------------------
  Delete animal treatments between dates
---------------------------------------------------*/
export async function deleteAnimalTreatmentsBetweenDates(animalType, animalName, startDateStr, endDateStr) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> deleteAnimalTreatmentsBetweenDates for animal: ${animalName} of type: ${animalType}`);
    const spreadsheetId = await findSheetIdByName(ANIMAL_TREATMENT_SHEETS()[animalType].folderId, animalName);
    if (!spreadsheetId) throw new Error('Could not find treatment sheet for animal: ' + animalName);  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers);  
    
    const rows = await sheet.getRows();
    let rowsDeleted = 0;
    console.log(`-----Deleting treatments between ${startDateStr} and ${endDateStr}`); 

    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr); 
      const startDate = parseDMY(startDateStr); 
      const endDate = parseDMY(endDateStr); 

      if (rowDate >= startDate && rowDate <= endDate) {
        await row.delete();
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

/*-------------------------------------------------- 
  Sort animal treatments by date descending
---------------------------------------------------*/
export async function sortAnimalTreatmentsByDateDescending(spreadsheetId){
  try {
    await ensureConfigLoaded();
    console.log(`>>> sortAnimalTreatmentsByDateDescending for sheetID: ${spreadsheetId}`);

    if (!spreadsheetId) throw new Error('Could not find treatment sheet for animal: ' );  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    const sheetId = sheet.sheetId;

    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth }); 

    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,  
      resource: {
        requests: [
          { 
            sortRange: {
              range: {
                sheetId: sheetId, 
                startRowIndex: 1,
                endRowIndex: sheet.rowCount,
                startColumnIndex: 0,
                endColumnIndex: sheet.columnCount
              },
              sortSpecs: [
                {   
                  dimensionIndex: 0,
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

/*-------------------------------------------------- 
  Get caregiver name from sheet by email
---------------------------------------------------*/
export async function getCaregiverNameFromSheet(email) {
  try {
    console.log('>>> Retreive Cargiver name for email:', email);
    await ensureConfigLoaded();
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet' );  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    const emailColIndex = headers.findIndex(h => h && h.trim().toLowerCase() === 'מייל');

     if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    }
    const rows = await sheet.getRows();
    for (const row of rows) {
      const caregiverName = row._rawData?.[caregiverColIndex];
      if (email === row._rawData?.[emailColIndex]) {
        console.log(`<<< Found caregiver name: ${caregiverName} for email: ${email}`);
        return caregiverName;
      }
    }
    return '';
  } catch (error) {
    console.error('Error in getCaregiverNameFromSheet:', error);
    throw error;
  }
}

/*--------------------------------------------------  
  Get all caregivers from sheet
---------------------------------------------------*/ 
export async function getAllCaregivers() {
  try {
    console.log('>>> Retreive all caregivers from sheet');
    await ensureConfigLoaded();
    if (!process.env.CAREGIVERS_SHEET_ID) throw new Error('Could not find caregiver sheet');
    const doc = await getDoc(process.env.CAREGIVERS_SHEET_ID);
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

/*-------------------------------------------------- 
  Get animals for caregiver with treatments today
---------------------------------------------------*/
export async function getAnimalsForCaregiverWithTreatementsToday(caregiverName) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> getAnimalsForCaregiverWithTreatementsToday for caregiver: ${caregiverName}`);
    const todayDate = new Date(); 
    const todayStr = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()}`;
    const animalsWithTodayTreatments = [];
    // loop through all animal types
    const sheets = ANIMAL_TREATMENT_SHEETS();

    for (const animalType of Object.keys(sheets)) {
      console.log(`Processing animal type: ${animalType}`);

      const animals = await getAnimals(animalType);
      
      const assignedAnimals = animals.filter(animal => {
        const inTreatementsField = (animal.in_treatment || '').toString();  
        const caregivers = inTreatementsField.split(',').map(name => name.trim());
        return caregivers.includes(caregiverName);
      });
      for (const animal of assignedAnimals) {
        const spreadsheetId = await findSpreadsheetInFolder(animalType, animal.id);
        console.log(`Animal ID: ${animal.id}, Spreadsheet ID: ${spreadsheetId}`);
        if(!spreadsheetId) {
          console.log(`No treatment sheet found for animal ID: ${animal.id}`);
          continue;
        }
        if((await hasTreatmentToday(spreadsheetId, todayStr)).hasTreatment) {
          animal.animalType = animalType;
          animalsWithTodayTreatments.push(animal);
          console.log(`Animal : ${animal.name} has treatment today.`);
        }
      }
      console.log(`Found Treatments today for ${animalsWithTodayTreatments.length} assigned animals for caregiver ${caregiverName} in type ${animalType}`);
    }
    return animalsWithTodayTreatments;  
  } catch (error) {
    console.error('Error in getAnimalsForCaregiverWithTreatementsToday:', error);
    throw error;
  }
}

// Check if sheet has treatment today
// Cache for in-flight hasTreatmentToday calls
const treatmentCheckCache = new Map();
/*-------------------------------------------------- 
  Check if sheet has treatment today
---------------------------------------------------*/
export async function hasTreatmentToday(sheetId, todayStr) {
  console.log(`>>> hasTreatmentToday for sheetID: ${sheetId} and date: ${todayStr}`);  
  await ensureConfigLoaded(); 
  let hasTreatment = false;
  let treatmentTimes = [];
  if (!sheetId) throw new Error('sheetId is required');  
  const doc = await getDoc(sheetId);  
  const sheet = doc.sheetsByIndex[0];  
  const rows = await sheet.getRows(); 
    
  console.log(`Got ${rows.length} rows for treatment check`);
    
  // Check if we have any rows
  if (rows.length === 0) {
    const result = { hasTreatment: false, treatmentTimes: [] };
    return result;
  }
    
  // Build header map from the sheet's header values
  const headerMap = {};
  if (sheet.headerValues) {
    sheet.headerValues.forEach((header, index) => {
      if (header) headerMap[header.trim()] = index;
    });
  }
  
  // Column indices (fallback if header mapping doesn't work)
  const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
  const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
  const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
  try {  
    for(const row of rows) {
      const stringDate = row._rawData?.[0];
      if(!stringDate || !todayStr) continue;
      
      const parsedRowDate = parseDMY(stringDate);
      const parsedTodayDate = parseDMY(todayStr);
      
      if(parsedRowDate === parsedTodayDate) {
        console.log(`✓ Found treatment for today: ${todayStr} in row date: ${stringDate}`);
        hasTreatment = true;
        console.log('Row raw data:', row._rawData);
        
        const morningValue = row._rawData?.[morningCol];
        const noonValue = row._rawData?.[noonCol];
        const eveningValue = row._rawData?.[eveningCol];
        
        if(morningValue === false || morningValue === 'FALSE') {
          treatmentTimes.push('morning');
        }
        if(noonValue === false || noonValue === 'FALSE') {
          treatmentTimes.push('noon');
        }
        if(eveningValue === false || eveningValue === 'FALSE') {
          treatmentTimes.push('evening');
        }
        
        // If all time-specific treatments are blank, it's a general treatment
        const isMorningBlank = morningValue === '';
        const isNoonBlank = noonValue === '' ;
        const isEveningBlank = eveningValue === '';
        
        if(isMorningBlank && isNoonBlank && isEveningBlank) {
          treatmentTimes.push('general');
        }
        
        // If no time slots are specified but there's a treatment row, it's general
        if(treatmentTimes.length === 0) {
          treatmentTimes.push('general');
        }
      }
    }
    return { hasTreatment, treatmentTimes };
  } catch (error) {
    console.error('Error in hasTreatmentToday:', error);
    return { hasTreatment: false, treatmentTimes: [] };
  }
}

/*--------------------------------------------------
  Update animal in main list
---------------------------------------------------*/
export async function updateAnimalInList(animalType, animalName, updateData = {}) {
  try {
    await ensureConfigLoaded();
    console.log(`>> updateAnimalInList for animal: ${animalName} of type: ${animalType}, 'Update data:', updateData`);

    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalType]?.sheetId;
    if (!spreadsheetId) throw new Error('ANIMAL_TREATMENT_SHEETS()[animalType]?.sheetId is required');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers);

    const nameColIndex = headers.findIndex(h => h && h.trim() === 'שם');
    console.log('Name column index:', nameColIndex);

    if (nameColIndex === -1) {
      throw new Error(`Could not find 'שם' header in sheet ${spreadsheetId}`);
    }

    const nameHeader = headers[nameColIndex];
    console.log('Using name header:', nameHeader, 'at index', nameColIndex);
    
    const rows = await sheet.getRows();
    let rowIndex = -1;
    const targetName = (animalName).toString().trim();
    const targetRow = rows.find((row, i) => {
      const cellValue = row._rawData?.[nameColIndex];
      const rowName = (cellValue).toString().trim();
      
      console.log(`Row ${i} name: "${rowName}" (raw:`, cellValue, ')');
      rowIndex = i;
      return rowName === targetName;
    });

    if (!targetRow) {
      throw new Error(`Animal with name "${animalName}" not found in sheet ${spreadsheetId}`);
    }

    for (const [key, value] of Object.entries(updateData)) {
      const mappedHeader = FIELD_TO_HEADER[key];

      if (!mappedHeader) {
        console.warn(`No header mapping found for key "${key}" in sheet ${spreadsheetId}`);
        continue;
      }

      const actualHeader = headers.find( h => h && h.trim() === mappedHeader.trim());
      const actualHeaderIndex = headers.findIndex( h => h && h.trim() === mappedHeader.trim());

      if (!actualHeader) {
        console.warn(`Header "${mappedHeader}" (for key "${key}") not found in sheet ${spreadsheetId}`);
        continue;
      }

      console.log(`Updating column "${actualHeader}" (key "${key}") to:`, value);

      const columnLetter = String.fromCharCode(65 + actualHeaderIndex);
      const cellsString = `A${rowIndex+1}:${columnLetter}${rowIndex+2}`;
      await sheet.loadCells(cellsString);
      const cell = sheet.getCell(rowIndex+1, actualHeaderIndex);
      cell.value = value;

      await sheet.saveUpdatedCells();
    }

    console.log(`Animal ${animalName} updated successfully.`);
    return { success: true };
  } catch (error) {
    console.error('Error in updateAnimalInList:', error);
    throw error;
  }
}

/*-----------------------------------------------
  function to collect each file that was edited in the last two weeks by folder id and check if each file has treatments today
  ----------------------------------------------*/
export async function getRecentlyEditedFilesInFolderWithTreatmentsToday(folderId) {
  try {
    await ensureConfigLoaded();
    console.log('>>> getRecentlyEditedFilesInFolderWithTreatmentsToday...');
    const filesWithTreatmentsToday = [];
    if (!folderId) throw new Error('folderId is required'); 
    const drive = getDriveClient();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 1);// - 14); !!!!!!!!!!!!!!!!!!!!
    //twoWeeksAgo.setDate(twoWeeksAgo.getDate());
    const twoWeeksAgoISO = twoWeeksAgo.toISOString();
    
    // Create today's date string in DD/MM/YYYY format to match sheet format
    const todayDate = new Date();
    const todayStr = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()}`;
    
    // list file names in folder modified in last two weeks 
    const tempResponse = await drive.files.list({
      q: `'${folderId}' in parents and modifiedTime >= '${twoWeeksAgoISO}' and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });
    for (const file of tempResponse.data.files) {
      const { hasTreatment,treatmentTimes} = await hasTreatmentToday(file.id, todayStr);
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (hasTreatment) {
        filesWithTreatmentsToday.push(file.name, treatmentTimes);
      }
    }
    return filesWithTreatmentsToday;
  } catch (error) {
    console.error('Error in getRecentlyEditedFilesInFolder:', error);
    return [];
  }
}