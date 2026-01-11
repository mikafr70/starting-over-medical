// sheets.js - Utility functions for Google Sheets integration
// This runs on the Node.js runtime in Next.js API routes

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { google } from 'googleapis';
import { getUserOAuthClient } from './googleAuth';
import { start } from 'repl';

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
  source: 'מקור',
  status: 'סטטוס',
  friends: 'חברויות',
  in_treatment: 'מטפל',
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
  sheep: {
    displayName: "כבשה",
    emoji: "🐑",
    sheetId: process.env.SHEEPS_SHEET_ID,
    folderId: process.env.SHEEPS_DRIVE_FOLDER_ID,
  },
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
 Helper function to find English key from Hebrew displayName
---------------------------------------------------*/
export async function getAnimalTypeKey(animalTypeInput) {
  const sheets = ANIMAL_TREATMENT_SHEETS();
  
  // If it's already an English key, return it
  if (sheets[animalTypeInput]) {
    return animalTypeInput;
  }
  
  // Otherwise, search by displayName (Hebrew)
  const entry = Object.entries(sheets).find(([key, value]) => value.displayName === animalTypeInput);
  if (entry) {
    return entry[0]; // return the English key
  }
  
  // If not found, return the original input (will likely cause an error later)
  console.warn(`Could not find animal type for: ${animalTypeInput}`);
  return animalTypeInput;
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
      [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
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
      scopes: ['https://www.googleapis.com/auth/drive']
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
    // temp temp temp temp temp temp temp temp temp
    await withSheetsRetry(() =>  doc.loadInfo());
    // temp temp temp temp temp temp temp temp temp
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
async function findSpreadsheetInFolder(animalType, animalName) {
  await ensureConfigLoaded();
  const drive = getDriveClient();
  const animalTypeKey = await getAnimalTypeKey(animalType);
  const folderId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey].folderId;

  try {
    // Extract just the name part from animalName (e.g., "קשיו" from "קשיו 939000007563363")
    const nameOnly = animalName.split(' ')[0];
    
    //console.log(`Searching for animal: "${animalName}", extracted name: "${nameOnly}"`);
    
    // Calculate date 30 days ago in RFC 3339 format
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 7);
    const dateFilter = thirtyDaysAgo.toISOString();
    
    // Fetch all files with pagination - only files modified in last 30 days
    let allFiles = [];
    let pageToken = null;
    
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime > '${dateFilter}'`,
        fields: 'nextPageToken, files(id, name, modifiedTime)',
        spaces: 'drive',
        pageSize: 1000, // Max allowed by API
        pageToken: pageToken
      });
      
      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);   
      console.log(`Found ${allFiles[0]} total files in folder`);
 
      // Filter to find exact match: filename format is "עותק של [name] [ID]"
      const exactMatch = allFiles.find(file => {
      const nameWithoutExtension = file.name.replace(/\..*$/, ''); // Remove extension
      // Remove "עותק של " prefix if present
      const nameWithoutPrefix = nameWithoutExtension.replace(/^עותק של /, '');
      // Extract the name part (first word after removing prefix)
      const fileNameOnly = nameWithoutPrefix.split(' ')[0];
      console.log(`Comparing file name: "${fileNameOnly}" with animal name: "${nameOnly}"`);
      // Match if the name part matches exactly
      const isMatch = fileNameOnly === nameOnly;
      if (isMatch) {
        console.log(`  ✓ MATCH FOUND: "${file.name}"`);
      }
      return isMatch;
    });
    
    if (!exactMatch) {
      console.log(`No treatment sheet found for animal ${animalName}`);
      return null;
    }

    console.log(`Found match: ${exactMatch.name}`);
    return exactMatch.id;
  } catch (error) {
    console.error('Error searching Drive folder:', error);
    return null;
  }
}


/*--------------------------------------------------
find animal names for the caregiver
---------------------------------------------------*/
async function getAnimalNamesForCaregiver(animalType, caregiverName) {
  await ensureConfigLoaded();
  const animalTypeKey = await getAnimalTypeKey(animalType);
  const animalNames = [];
  try {
    //go through the animal list and find the specific caregiver's animals, split by commas

    const doc = await getDoc(ANIMAL_TREATMENT_SHEETS()[animalTypeKey].sheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const headerMap = {};
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    for (const row of rows) {
      const caregiversField = row._rawData?.[headerMap['מטפל']] || '';
      const caregivers = caregiversField.split(',').map(name => name.trim());
      if (caregivers.includes(caregiverName)) {
        const animalName = row._rawData?.[headerMap['שם']] || '';
        animalNames.push(animalName);
      }
    }
    console.log(`Found ${animalNames.length} animals for caregiver ${caregiverName} in type ${animalType}`);
  } catch (error) {
    console.error(`Error fetching animal names for caregiver ${caregiverName} in type ${animalType}:`, error);
  }
    return animalNames;
}
    




/*--------------------------------------------------
find sheets for caregiver's animals
---------------------------------------------------*/
async function findSpreadsheetsForCaregiverInFolder(animalType, caregiverName) {
  await ensureConfigLoaded();
  const drive = getDriveClient();
  const animalTypeKey = await getAnimalTypeKey(animalType);
  const folderId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey].folderId;
  const caregiverAnimals = await getAnimalNamesForCaregiver(animalType, caregiverName);
  try {
    // Extract just the name part from animalName (e.g., "קשיו" from "קשיו 939000007563363")

    //console.log(`Searching for animal: "${animalName}", extracted name: "${nameOnly}"`);
    
    // Calculate date 30 days ago in RFC 3339 format
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 7);
    const dateFilter = thirtyDaysAgo.toISOString();
    
    // Fetch all files with pagination - only files modified in last 30 days
    let allFiles = [];
    let pageToken = null;
    const matchedFiles = [];
    
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime > '${dateFilter}'`,
        fields: 'nextPageToken, files(id, name, modifiedTime)',
        spaces: 'drive',
        pageSize: 1000, // Max allowed by API
        pageToken: pageToken
      });
      
      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    console.log(`Found ${allFiles.length} total files in folder`);
    for (const animal of caregiverAnimals) { 
       for (const file of allFiles) {
        {
          // use regx to remove numbers from the end of the name
          const nameOnly = file.name.replace(/\s+\d{15}$/, '').trim();
          // Match if the name part matches exactly
          const isMatch = nameOnly === animal;
          //console.log(`Comparing file name: "${nameOnly}" with caregiver animal name: "${animal}"`);
          if (isMatch) {
            console.log(`  ✓ MATCH FOUND: "${file.name}" for caregiver animal: "${animal}"`);
            // store matched file id
            matchedFiles.push({ animalName: animal, sheetId: file.id });
          }
        }
      }   
    };
    if (matchedFiles.length === 0) {  
      console.log(`No treatment sheets found for caregiver ${caregiverName} in animal type ${animalType}`);
      return [];
    }
    return matchedFiles;
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
    // Extract just the name part from animalName (e.g., "קשיו" from "קשיו 939000007563363")
    const nameOnly = animalName.split(' ')[0];
    
    console.log(`[findSheetIdByName] Searching for: "${animalName}", extracted: "${nameOnly}"`);
    
    // Fetch all files with pagination
    let allFiles = [];
    let pageToken = null;
    
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'nextPageToken, files(id, name)',
        spaces: 'drive',
        pageSize: 1000, // Max allowed by API
        pageToken: pageToken
      });
      
      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    console.log(`[findSheetIdByName] Found ${allFiles.length} total files in folder`);
    
    // Filter to find exact match: filename format is "עותק של [name] [ID]"
    const exactMatch = allFiles.find(file => {
      const nameWithoutExtension = file.name.replace(/\..*$/, ''); // Remove extension
      // Remove "עותק של " prefix if present
      const nameWithoutPrefix = nameWithoutExtension.replace(/^עותק של /, '');
      // Extract the name part (first word after removing prefix)
      const fileNameOnly = nameWithoutPrefix.split(' ')[0];
      
      // Match if the name part matches exactly
      const isMatch = fileNameOnly === nameOnly;
      if (isMatch) {
        console.log(`  [findSheetIdByName] ✓ MATCH FOUND: "${file.name}"`);
      }
      return isMatch;
    });
    
    if (!exactMatch) {
      console.log(`No treatment sheet found for animal ${animalName}`);
      return null;
    }

    return exactMatch.id;
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
      // Convert Hebrew displayName to English key if needed
      const animalTypeKey = await getAnimalTypeKey(animalType);
      console.log('>>> getAnimals for type:', animalType, '-> key:', animalTypeKey);
      
      console.log('@@@Animals sheet ID:', ANIMAL_TREATMENT_SHEETS()[animalTypeKey].sheetId);
    
      const doc = await getDoc(ANIMAL_TREATMENT_SHEETS()[animalTypeKey].sheetId);
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
      in_treatment: row._rawData?.[headerMap['מטפל']] || ''
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
export async function getAnimalTreatments(animalType, animalName) {
  try {
    console.log(`>>> getAnimalTreatments for animalName: ${animalName}`);
    await ensureConfigLoaded();
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      return [];
    }

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    console.log(`Fetched ${rows.length} treatment rows for animal ${animalName}`);
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
    console.error(`Error fetching treatments for animal ${animalName}:`, error);
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
      in_treatment: row._rawData?.[headerMap['מטפל']] || ''
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
export async function addTreatmentAtTop(spreadsheetId, rowData = {}, isGeneralCaregiver = false, isPersonalCaregiver = false) {
  await ensureConfigLoaded();
  console.log(`>>> addTreatmentAtTop for spreadsheetId: ${spreadsheetId}, isGeneralCaregiver: ${isGeneralCaregiver}, isPersonalCaregiver: ${isPersonalCaregiver}`);
  const rowsToAdd = Array.isArray(rowData) ? rowData : [rowData];
  try {
    if (!spreadsheetId) throw new Error('spreadsheetId is required');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const sheetId = sheet.sheetId;

    console.log(`rowData - ${JSON.stringify(rowData[0])}`);
    console.log(`checkboxes values: morning - ${rowData[0].morning} , noon - ${rowData[0].noon} , evening - ${rowData[0].evening}`);
    console.log(`isGeneralCaregiver flag: ${isGeneralCaregiver}`);
    console.log(`isPersonalCaregiver flag: ${isPersonalCaregiver}`);

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
      const morning = rowData.morning || '';
      const noon = rowData.noon || '';
      const evening = rowData.evening || '';
      const generalTreatment = isGeneralCaregiver ? 'FALSE' : ''; // Set to FALSE if general caregiver selected, empty otherwise
      const personalTreatment = isPersonalCaregiver ? 'FALSE' : ''; // Set to FALSE if personal caregiver selected, empty otherwise
      const treatment = rowData.treatment || '';
      const dosage = rowData.dosage || '';
      const bodyPart = rowData.bodyPart || rowData['body part'] || '';
      const duration = rowData.duration || '';
      const location = rowData.location || '';
      const caseField = rowData.case || '';
      const notes = rowData.notes || '';

      return [date, day, morning, noon, evening, generalTreatment, personalTreatment, treatment, dosage, bodyPart, duration, location, caseField, notes];
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:N${1 + rowsToAdd.length}`,
      valueInputOption: 'RAW',
      resource: { values }
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:N${1 + rowsToAdd.length}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    // First, clear all validations for the new rows to prevent inheriting from previous rows
    const clearValidationRequests = [];
    for (let i = 0; i < rowsToAdd.length; i++) {
      const startRow = 1 + i;
      
      // Clear validations for morning, noon, evening, general treatment, and personal treatment columns
      for (let col = 2; col <= 7; col++) {
        clearValidationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: col,
              endColumnIndex: col + 1
            },
            rule: null
          }
        });
      }
    }
    
    // Execute clear validations first
    if (clearValidationRequests.length > 0) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests: clearValidationRequests }
      });
    }

    // Now add checkbox validations only where needed
    const validationRequests = [];
    for (let i = 0; i < rowsToAdd.length; i++) {
      const row = rowsToAdd[i];
      const startRow = 1 + i;

      if (row.morning === 'TRUE' || row.morning === 'FALSE') {
        console.log('Adding morning checkbox validation at row:', startRow);
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

      if (row.noon === 'TRUE' || row.noon === 'FALSE') {
        console.log('Adding noon checkbox validation at row:', startRow);
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

      if (row.evening === 'TRUE' || row.evening === 'FALSE') {
        console.log('Adding evening checkbox validation at row:', startRow);
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

      // Add checkbox validation for general treatment column (column F, index 5) if general caregiver selected
      if (isGeneralCaregiver) {
        console.log('Adding general treatment checkbox validation at row:', startRow);
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 5,
              endColumnIndex: 6
            },
            rule: {
              condition: { type: 'BOOLEAN' },
              showCustomUi: false // Start as unchecked
            }
          }
        });
      }
      // Add checkbox validation for personal treatment column (column G, index 6) if personal caregiver selected
    if (isPersonalCaregiver) {
        console.log('Adding personal treatment checkbox validation at row:', startRow);
        validationRequests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: startRow,
              endRowIndex: startRow + 1,
              startColumnIndex: 6,
              endColumnIndex: 7
            },
            rule: {
              condition: { type: 'BOOLEAN' },
              showCustomUi: false // Start as unchecked
            }
          }
        });
      }
    
    }

    // Execute validation requests

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
  Remove a caregiver from an animal's treatment list
---------------------------------------------------*/
export async function removeCaregiverFromAnimal(animalType, animalName, caregiverName, removeAll = false) {
  try {
    await ensureConfigLoaded();
    console.log(`>> removeCaregiverFromAnimal for animal: ${animalName} of type: ${animalType}, caregiver: ${caregiverName}, removeAll: ${removeAll}`); 
    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalType].sheetId;
    
    if (!spreadsheetId) {
      throw new Error('No sheet ID found for animal type: ' + animalType);
    }   
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];   
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers); 
    const nameColIndex = headers.findIndex(h => h && h.trim() === 'שם');
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    console.log('Name column index:', nameColIndex);
    console.log('Caregiver column index:', caregiverColIndex);
    if (nameColIndex === -1) {
      throw new Error(`Could not find 'שם' header in sheet ${spreadsheetId}`);
    }
    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    } 
    const rows = await sheet.getRows();
    let rowIndex = -1;
    const targetName = (animalName).toString().trim();  
    const targetRow = rows.find((row, i) => {
      const cellValue = row._rawData?.[nameColIndex];
      const rowName = (cellValue).toString().trim();  
      rowIndex = i;
      return rowName === targetName;
    });
    
    if (!targetRow) {
      throw new Error(`Animal with name "${animalName}" not found in sheet ${spreadsheetId}`);
    }
    
    console.log(`Removing caregiver "${caregiverName}" from animal "${animalName}"`);
    console.log(`Row index: ${rowIndex}`);
    
    // Get existing value from raw data before loading cells
    const existingValue = (targetRow._rawData?.[caregiverColIndex] || '').toString().trim();
    console.log(`Existing caregivers: ${existingValue}`);
    
    // Load the specific cell for the caregiver
    const columnLetter = String.fromCharCode(65 + caregiverColIndex);
    const cellsString = `A${rowIndex+1}:${columnLetter}${rowIndex+2}`;
    await sheet.loadCells(cellsString);
    const cell = sheet.getCell(rowIndex+1, caregiverColIndex);
    
    // Process the existing value
    if (removeAll) {
      // Remove all caregivers
      cell.value = '';
      console.log(`Removed all caregivers for ${animalName}`);
    } else if (existingValue) {
      // Remove only the specified caregiver
      const existingCaregivers = existingValue.split(',').map(c => c.trim());
      const updatedCaregivers = existingCaregivers.filter(c => c !== caregiverName.trim());
      
      // Update the cell with remaining caregivers
      cell.value = updatedCaregivers.join(', ');
    } else {
      console.log(`No caregivers found for ${animalName}`);
    }
    
    await sheet.saveUpdatedCells();  
    console.log(`Caregiver ${caregiverName} removed from animal ${animalName} successfully.`);
    return { success: true };
  } catch (error) {
    console.error('Error in removeCaregiverFromAnimal:', error);
    throw error;
  } 
}

/*--------------------------------------------------
  Add a caregiver to an animal's treatment list
---------------------------------------------------*/
export async function addCaregiverToAnimal(animalType, animalName, caregiverName) {
  try {
    console.log(`>> addCaregiverToAnimal for animal: ${animalName} of type: ${animalType}, caregiver: ${caregiverName}`);
    await ensureConfigLoaded();
    
    const animalTypeKey = await getAnimalTypeKey(animalType);
    const sheetId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey].sheetId;
    
    if (!sheetId) {
      throw new Error(`No sheet found for animal type: ${animalType}`);
    }
    
    const doc = await getDoc(sheetId);
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const rows = await sheet.getRows();
    
    const nameHeaderIndex = headers.findIndex(h => h && h.trim() === 'שם');
    const caregiverHeaderIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    
    if (nameHeaderIndex === -1 || caregiverHeaderIndex === -1) {
      throw new Error('Could not find required headers in sheet');
    }
    
    // Find the animal row
    const animalRow = rows.find(row => row._rawData[nameHeaderIndex] === animalName);
    
    if (!animalRow) {
      throw new Error(`Animal ${animalName} not found in ${animalType} sheet`);
    }
    
    // Get current caregivers
    const currentCaregivers = animalRow._rawData[caregiverHeaderIndex] || '';
    const caregiversArray = currentCaregivers.split(',').map(c => c.trim()).filter(c => c);
    
    // Check if caregiver already exists
    if (caregiversArray.includes(caregiverName)) {
      console.log(`Caregiver ${caregiverName} already assigned to ${animalName}`);
      return { success: true, message: 'Caregiver already assigned' };
    }
    
    // Add the new caregiver
    caregiversArray.push(caregiverName);
    animalRow._rawData[caregiverHeaderIndex] = caregiversArray.join(', ');
    
    await animalRow.save();
    console.log(`Caregiver ${caregiverName} added to animal ${animalName} successfully.`);
    return { success: true };
  } catch (error) {
    console.error('Error in addCaregiverToAnimal:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save adoption data to tracking sheet
  Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	שם מאמץ	מספר טלפון	מיקום
  Also removes the animal from the main list
---------------------------------------------------*/
export async function saveAdoptionData(adoptionData) {
  try {
    console.log(`>> saveAdoptionData:`, adoptionData);
    await ensureConfigLoaded();
    
    // Get tracking sheet ID from configuration
    
    const trackingSheetId = process.env.TRACKING_SHEET_ID_2026;

    if (!trackingSheetId) {
      throw new Error('TRACKING_SHEET_ID_2026 not found in configuration sheet');
    }
    
    const doc = await getDoc(trackingSheetId);
    
    // Find the "אימוצים" tab
    const adoptionsSheet = doc.sheetsByTitle['אימוצים'];
    if (!adoptionsSheet) {
      throw new Error('Sheet "אימוצים" not found in tracking document');
    }
    
    await adoptionsSheet.loadHeaderRow();
    
    // Add a new row with the adoption data to "אימוצים" tab
    // Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	שם מאמץ	מספר טלפון	מיקום
    await adoptionsSheet.addRow({
      'שם': adoptionData.animalName || '',
      'מין': adoptionData.gender || '',
      'תאריך': adoptionData.date || '',
      'סוג חיה': adoptionData.animalType || '',
      'פעולה': 'אימוץ',
      'שבב': adoptionData.chipId || '',
      'מתחם במקלט': adoptionData.shelterLocation || '',
      'שם מאמץ': adoptionData.adopter_name || '',
      'מספר טלפון': adoptionData.phoneNumber || '',
      'מיקום': adoptionData.location || ''
    });
    
    console.log(`Adoption data saved to אימוצים tab for ${adoptionData.animalName}`);
    
    // Also add to "מעקב כללי" tab
    const generalTrackingSheet = doc.sheetsByTitle['מעקב כללי'];
    if (!generalTrackingSheet) {
      console.warn('Sheet "מעקב כללי" not found in tracking document - skipping general tracking');
    } else {
      await generalTrackingSheet.loadHeaderRow();
      
      // Add a new row with the common fields to "מעקב כללי" tab
      // Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט
      await generalTrackingSheet.addRow({
        'שם': adoptionData.animalName || '',
        'מין': adoptionData.gender || '',
        'תאריך': adoptionData.date || '',
        'סוג חיה': adoptionData.animalType || '',
        'פעולה': 'אימוץ',
        'שבב': adoptionData.chipId || '',
        'מתחם במקלט': adoptionData.shelterLocation || ''
      });
      
      console.log(`Adoption data saved to מעקב כללי tab for ${adoptionData.animalName}`);
    }
    
    // Remove the animal from the main list
    await removeAnimalFromList(adoptionData.animalType, adoptionData.animalName);
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveAdoptionData:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save euthanasia data to tracking sheet
  Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	סיבה
  Also removes the animal from the main list
---------------------------------------------------*/
export async function saveEuthanasiaData(euthanasiaData) {
  try {
    console.log(`>> saveEuthanasiaData:`, euthanasiaData);
    await ensureConfigLoaded();
    
    const trackingSheetId = process.env.TRACKING_SHEET_ID_2026;
    if (!trackingSheetId) {
      throw new Error('TRACKING_SHEET_ID_2026 not found in configuration sheet');
    }
    
    const doc = await getDoc(trackingSheetId);
    
    // Find the "המתות חסד" tab
    const euthanasiaSheet = doc.sheetsByTitle['המתות חסד'];
    if (!euthanasiaSheet) {
      throw new Error('Sheet "המתות חסד" not found in tracking document');
    }
    
    await euthanasiaSheet.loadHeaderRow();
    
    // Add to "המתות חסד" tab
    await euthanasiaSheet.addRow({
      'שם': euthanasiaData.animalName || '',
      'מין': euthanasiaData.gender || '',
      'תאריך': euthanasiaData.date || '',
      'סוג חיה': euthanasiaData.animalType || '',
      'פעולה': 'המתת חסד',
      'שבב': euthanasiaData.chipId || '',
      'מתחם במקלט': euthanasiaData.shelterLocation || '',
      'סיבה': euthanasiaData.reason || ''
    });
    
    console.log(`Euthanasia data saved to המתות חסד tab for ${euthanasiaData.animalName}`);
    
    // Also add to "מעקב כללי" tab
    const generalTrackingSheet = doc.sheetsByTitle['מעקב כללי'];
    if (generalTrackingSheet) {
      await generalTrackingSheet.loadHeaderRow();
      await generalTrackingSheet.addRow({
        'שם': euthanasiaData.animalName || '',
        'מין': euthanasiaData.gender || '',
        'תאריך': euthanasiaData.date || '',
        'סוג חיה': euthanasiaData.animalType || '',
        'פעולה': 'המתת חסד',
        'שבב': euthanasiaData.chipId || '',
        'מתחם במקלט': euthanasiaData.shelterLocation || ''
      });
      console.log(`Euthanasia data saved to מעקב כללי tab for ${euthanasiaData.animalName}`);
    }
    
    // Remove the animal from the main list
    await removeAnimalFromList(euthanasiaData.animalType, euthanasiaData.animalName);
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveEuthanasiaData:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save birth data to tracking sheet
  Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	שם האם
  Also creates new animal sheet and adds to main list with formatted name
---------------------------------------------------*/
export async function saveBirthData(birthData) {
  try {
    console.log(`>> saveBirthData:`, birthData);
    await ensureConfigLoaded();
    
    const trackingSheetId = process.env.TRACKING_SHEET_ID_2026;
    if (!trackingSheetId) {
      throw new Error('TRACKING_SHEET_ID_2026 not found in configuration sheet');
    }
    
    const doc = await getDoc(trackingSheetId);
    
    // Find the "המלטות" tab
    const birthSheet = doc.sheetsByTitle['המלטות'];
    if (!birthSheet) {
      throw new Error('Sheet "המלטות" not found in tracking document');
    }
    
    await birthSheet.loadHeaderRow();
    
    // Add to "המלטות" tab
    await birthSheet.addRow({
      'שם': birthData.animalName || '',
      'מין': birthData.gender || '',
      'תאריך': birthData.date || '',
      'סוג חיה': birthData.animalType || '',
      'פעולה': 'המלטה',
      'שבב': birthData.chipId || '',
      'מתחם במקלט': birthData.shelterLocation || '',
      'שם האם': birthData.motherName || ''
    });
    
    console.log(`Birth data saved to המלטות tab for ${birthData.animalName}`);
    
    // Also add to "מעקב כללי" tab
    const generalTrackingSheet = doc.sheetsByTitle['מעקב כללי'];
    if (generalTrackingSheet) {
      await generalTrackingSheet.loadHeaderRow();
      await generalTrackingSheet.addRow({
        'שם': birthData.animalName || '',
        'מין': birthData.gender || '',
        'תאריך': birthData.date || '',
        'סוג חיה': birthData.animalType || '',
        'פעולה': 'המלטה',
        'שבב': birthData.chipId || '',
        'מתחם במקלט': birthData.shelterLocation || ''
      });
      console.log(`Birth data saved to מעקב כללי tab for ${birthData.animalName}`);
    }
    
    // Format the name with parent information
    let formattedName = birthData.animalName;
    if (birthData.motherName) {
      if (birthData.gender === 'נקבה') {
        formattedName = `${birthData.animalName} (בת של ${birthData.motherName})`;
      } else if (birthData.gender === 'זכר') {
        formattedName = `${birthData.animalName} (בן של ${birthData.motherName})`;
      }
    }
    
    // Format the source field with mother name
    let sourceField = '';
    if (birthData.motherName) {
      if (birthData.gender === 'נקבה') {
        sourceField = `בת של ${birthData.motherName}`;
      } else if (birthData.gender === 'זכר') {
        sourceField = `בן של ${birthData.motherName}`;
      }
    }
    
    // Create animal data with formatted name
    const animalData = {
      name: formattedName,
      sex: birthData.gender || '',
      id: birthData.chipId || '',
      birth_date: birthData.date || '',
      arrival_date: birthData.date || '', // Same as birth date for births
      location: birthData.shelterLocation || '',
      description: birthData.description || '', // Maps to תיאור column
      source: sourceField // Maps to מקור column with formatted parent info
    };
    
    // Convert animal type to English key if needed
    const animalTypeKey = await getAnimalTypeKey(birthData.animalType);
    
    // Add the animal to the main list and create treatment sheet
    await addAnimalToList(animalTypeKey, animalData);
    
    // Create treatment sheet for the newborn animal
    const treatmentSheetName = `עותק של ${birthData.animalName} ${birthData.chipId || ''}`;
    await createAnimalTreatmentSheet(animalTypeKey, treatmentSheetName);
    console.log(`Created treatment sheet for newborn: ${treatmentSheetName}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveBirthData:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save arrival data to tracking sheet
  Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	רקע
  Also creates new animal sheet and adds to main list
---------------------------------------------------*/
export async function saveArrivalData(arrivalData) {
  try {
    console.log(`>> saveArrivalData:`, arrivalData);
    await ensureConfigLoaded();
    
    const trackingSheetId = process.env.TRACKING_SHEET_ID_2026;
    if (!trackingSheetId) {
      throw new Error('TRACKING_SHEET_ID_2026 not found in configuration sheet');
    }
    
    const doc = await getDoc(trackingSheetId);
    
    // Find the "קליטות" tab
    const arrivalSheet = doc.sheetsByTitle['קליטות'];
    if (!arrivalSheet) {
      throw new Error('Sheet "קליטות" not found in tracking document');
    }
    
    await arrivalSheet.loadHeaderRow();
    
    // Add to "קליטות" tab
    await arrivalSheet.addRow({
      'שם': arrivalData.animalName || '',
      'מין': arrivalData.gender || '',
      'תאריך': arrivalData.date || '',
      'סוג חיה': arrivalData.animalType || '',
      'פעולה': 'קליטה',
      'שבב': arrivalData.chipId || '',
      'מתחם במקלט': arrivalData.shelterLocation || '',
      'רקע': arrivalData.background || ''
    });
    
    console.log(`Arrival data saved to קליטות tab for ${arrivalData.animalName}`);
    
    // Also add to "מעקב כללי" tab
    const generalTrackingSheet = doc.sheetsByTitle['מעקב כללי'];
    if (generalTrackingSheet) {
      await generalTrackingSheet.loadHeaderRow();
      await generalTrackingSheet.addRow({
        'שם': arrivalData.animalName || '',
        'מין': arrivalData.gender || '',
        'תאריך': arrivalData.date || '',
        'סוג חיה': arrivalData.animalType || '',
        'פעולה': 'קליטה',
        'שבב': arrivalData.chipId || '',
        'מתחם במקלט': arrivalData.shelterLocation || ''
      });
      console.log(`Arrival data saved to מעקב כללי tab for ${arrivalData.animalName}`);
    }
    
    // Create animal data
    const animalData = {
      name: arrivalData.animalName,
      sex: arrivalData.gender || '',
      id: arrivalData.chipId || '',
      arrival_date: arrivalData.date || '',
      location: arrivalData.shelterLocation || '',
      description: arrivalData.description || '', // Maps to תיאור column
      source: arrivalData.background || '' // Maps to מקור column
    };
    
    // Convert animal type to English key if needed
    const animalTypeKey = await getAnimalTypeKey(arrivalData.animalType);
    
    // Add the animal to the main list and create treatment sheet
    await addAnimalToList(animalTypeKey, animalData);
    
    // Create treatment sheet for the new arrival
    const treatmentSheetName = `${arrivalData.animalName} ${arrivalData.chipId || ''}`;
    await createAnimalTreatmentSheet(animalTypeKey, treatmentSheetName);
    console.log(`Created treatment sheet for arrival: ${treatmentSheetName}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveArrivalData:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save death data to tracking sheet
  Headers: שם	מין	תאריך	סוג חיה	פעולה	שבב	מתחם במקלט	סיבה
  Also removes the animal from the main list
---------------------------------------------------*/
export async function saveDeathData(deathData) {
  try {
    console.log(`>> saveDeathData:`, deathData);
    await ensureConfigLoaded();
    
    const trackingSheetId = process.env.TRACKING_SHEET_ID_2026;
    if (!trackingSheetId) {
      throw new Error('TRACKING_SHEET_ID_2026 not found in configuration sheet');
    }
    
    const doc = await getDoc(trackingSheetId);
    
    // Find the "פטירות" tab
    const deathSheet = doc.sheetsByTitle['פטירות'];
    if (!deathSheet) {
      throw new Error('Sheet "פטירות" not found in tracking document');
    }
    
    await deathSheet.loadHeaderRow();
    
    // Add to "פטירות" tab
    await deathSheet.addRow({
      'שם': deathData.animalName || '',
      'מין': deathData.gender || '',
      'תאריך': deathData.date || '',
      'סוג חיה': deathData.animalType || '',
      'פעולה': 'פטירה',
      'שבב': deathData.chipId || '',
      'מתחם במקלט': deathData.shelterLocation || '',
      'סיבה': deathData.reason || ''
    });
    
    console.log(`Death data saved to פטירות tab for ${deathData.animalName}`);
    
    // Also add to "מעקב כללי" tab
    const generalTrackingSheet = doc.sheetsByTitle['מעקב כללי'];
    if (generalTrackingSheet) {
      await generalTrackingSheet.loadHeaderRow();
      await generalTrackingSheet.addRow({
        'שם': deathData.animalName || '',
        'מין': deathData.gender || '',
        'תאריך': deathData.date || '',
        'סוג חיה': deathData.animalType || '',
        'פעולה': 'פטירה',
        'שבב': deathData.chipId || '',
        'מתחם במקלט': deathData.shelterLocation || ''
      });
      console.log(`Death data saved to מעקב כללי tab for ${deathData.animalName}`);
    }
    
    // Remove the animal from the main list
    await removeAnimalFromList(deathData.animalType, deathData.animalName);
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveDeathData:', error);
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
  Get caregiver's treated animal types from sheet
---------------------------------------------------*/ 
export async function getCaregiverTreatedTypes(caregiverName) {
  try {
    console.log('>>> Retrieve treated animal types for caregiver:', caregiverName);
    await ensureConfigLoaded();
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet');
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    const typesColIndex = headers.findIndex(h => h && h.trim() === 'סוגים לטיפול');
    
    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    }
    if (typesColIndex === -1) {
      console.warn(`Could not find 'סוגים לטיפול' header in sheet ${spreadsheetId}, returning all types`);
      return Object.keys(ANIMAL_TREATMENT_SHEETS());
    }
    
    const rows = await sheet.getRows();
    for (const row of rows) {
      const rowCaregiverName = row._rawData?.[caregiverColIndex];
      if (rowCaregiverName && rowCaregiverName.trim() === caregiverName.trim()) {
        const typesStr = row._rawData?.[typesColIndex] || '';
        if (!typesStr) {
          console.log(`<<< No treated types specified for ${caregiverName}, returning all types`);
          return Object.keys(ANIMAL_TREATMENT_SHEETS());
        }
        
        // Parse the types string - could be comma-separated Hebrew names
        const typesList = typesStr.split(',').map(t => t.trim()).filter(t => t);
        
        // Map Hebrew display names to English keys
        const sheets = ANIMAL_TREATMENT_SHEETS();
        const animalTypeKeys = [];
        
        for (const typeName of typesList) {
          // Try to find matching type by Hebrew display name
          const entry = Object.entries(sheets).find(([key, value]) => 
            value.displayName === typeName || key === typeName
          );
          if (entry) {
            animalTypeKeys.push(entry[0]);
          } else {
            console.warn(`Could not find animal type for: ${typeName}`);
          }
        }
        
        console.log(`<<< Found treated types for ${caregiverName}:`, animalTypeKeys);
        return animalTypeKeys.length > 0 ? animalTypeKeys : Object.keys(ANIMAL_TREATMENT_SHEETS());
      }
    }
    
    console.log(`<<< Caregiver ${caregiverName} not found, returning all types`);
    return Object.keys(ANIMAL_TREATMENT_SHEETS());
  } catch (error) {
    console.error('Error in getCaregiverTreatedTypes:', error);
    // Return all types on error to avoid breaking functionality
    return Object.keys(ANIMAL_TREATMENT_SHEETS());
  }
}

/*--------------------------------------------------  
  Authenticate caregiver with email and password
---------------------------------------------------*/ 
export async function authenticateCaregiver(email, password) {
  try {
    console.log('>>> Authenticating caregiver with email:', email);
    await ensureConfigLoaded();
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet');
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    const emailColIndex = headers.findIndex(h => h && h.trim().toLowerCase() === 'מייל');
    const passwordColIndex = headers.findIndex(h => h && h.trim() === 'סיסמה');

    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    }
    if (emailColIndex === -1) {
      throw new Error(`Could not find 'מייל' header in sheet ${spreadsheetId}`);
    }
    if (passwordColIndex === -1) {
      throw new Error(`Could not find 'סיסמה' header in sheet ${spreadsheetId}`);
    }
    
    const rows = await sheet.getRows();
    for (const row of rows) {
      const rowEmail = row._rawData?.[emailColIndex];
      const rowPassword = row._rawData?.[passwordColIndex];
      const caregiverName = row._rawData?.[caregiverColIndex];
      
      if (email === rowEmail && password === rowPassword) {
        console.log(`<<< Authentication successful for: ${caregiverName}`);
        return { success: true, caregiverName };
      }
    }
    
    console.log('<<< Authentication failed: Invalid credentials');
    return { success: false };
  } catch (error) {
    console.error('Error in authenticateCaregiver:', error);
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
  Get animals and optionally general treatments for caregiver in ONE pass
---------------------------------------------------*/
export async function getAnimalsForCaregiverWithTreatementsToday(caregiverName, includeGeneralTreatments = true) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> getAnimalsForCaregiverWithTreatementsToday for caregiver: ${caregiverName}, includeGeneralTreatments: ${includeGeneralTreatments}`);
    const todayDate = new Date(); 
    const todayStr = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()}`;
    const allPersonalTreatments = [];
    const allGeneralTreatments = [];
    const sheets = ANIMAL_TREATMENT_SHEETS();

    // Get the animal types this caregiver treats
    const treatedTypes = await getCaregiverTreatedTypes(caregiverName);
    console.log(`Caregiver ${caregiverName} treats types:`, treatedTypes);

    for (const animalType of treatedTypes) {
      try {
        console.log(`Processing animal type: ${animalType}`);

        // Add timeout to prevent hanging
        //const animalsPromise = getAnimals(animalType);
        //const timeoutPromise = new Promise((_, reject) => 
        //  setTimeout(() => reject(new Error('Timeout fetching animals')), 15000)
        //);
        
        //const animals = await Promise.race([animalsPromisse, timeoutPromise]);
        
        //const assignedAnimals = animals.filter(animal => {
        //  const inTreatementsField = (animal.in_treatment || '').toString();  
        //  const caregivers = inTreatementsField.split(',').map(name => name.trim());
        //  return caregivers.includes(caregiverName);
        //});
        const matchedFiles = await findSpreadsheetsForCaregiverInFolder(animalType, caregiverName);                 
        for (const matchedFile of matchedFiles) {
           // Set basic animal infos
            const image  = '';
            console.log(`Found assigned animal: ${matchedFile.animalName} (Sheet ID: ${matchedFile.sheetId})`);
            const { hasTreatment, treatmentTimes, animalImage } = await hasTreatmentToday(matchedFile.sheetId, todayStr, !includeGeneralTreatments);

            console.log(`hasTreatment=${hasTreatment}, treatmentTimes count=${treatmentTimes.length}`);
            if (treatmentTimes.length > 0) {
              console.log('treatmentTimes:', JSON.stringify(treatmentTimes, null, 2));
            }

            if(hasTreatment) {
              for (const treatmentTime of treatmentTimes) {
                console.log(`Processing treatment: isPersonal=${treatmentTime.isPersonal}, isGeneral=${treatmentTime.isGeneral}`);
                if (treatmentTime.isPersonal === true) {
                  allPersonalTreatments.push({
                    animalName: matchedFile.animalName,
                    animalType: sheets[animalType].displayName,
                    animalTypeKey: animalType,  
                    treatment: treatmentTime.treatment || '',
                    medicalCase: treatmentTime.medicalCase,
                    dosage: treatmentTime.dosage || '',
                    date: todayStr,
                    image: animalImage || '',
                    isCompleted: treatmentTime.isCompleted
                  });
                }
                if(treatmentTime.isGeneral === true) {
                  allGeneralTreatments.push({
                    animalName: matchedFile.animalName, 
                    animalType: sheets[animalType].displayName,
                    animalTypeKey: animalType,
                    treatment: treatmentTime.treatment || '',
                    medicalCase: treatmentTime.medicalCase,
                    dosage: treatmentTime.dosage || '',
                    date: todayStr,
                    image: animalImage || '',
                    isCompleted: treatmentTime.isCompleted
                  });
                }
              }
            } 
            else {
              console.log(`No treatment sheet found for animal name: ${matchedFile.animalName}`);
            }
          }
        }
        catch (error) {
          console.error(`Error processing animal type ${animalType}:`, error);
        }
      }
        
      if (includeGeneralTreatments) {
        console.log(`Total personal treatments for today: ${allPersonalTreatments.length}`);
        console.log(`Total general treatments for today: ${allGeneralTreatments.length}`);
        return { allPersonalTreatments, allGeneralTreatments };
      }
      else {
        console.log(`Total personal treatments for today: ${allPersonalTreatments.length}`);
        return { allPersonalTreatments };
      }
    } catch (error) {
      console.error('Error in getAnimalsForCaregiverWithTreatementsToday:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Get animals with treatments for caregiver (LEGACY - use getAnimalsAndTreatmentsForCaregiver instead)
---------------------------------------------------*/
//export async function getAnimalsForCaregiverWithTreatementsToday(caregiverName) {
////  const result = await getAnimalsAndTreatmentsForCaregiver(caregiverName, false);
//  return result.animals;
//}

/*--------------------------------------------------
  Get all general treatments (checkbox = TRUE) for caregiver's animals (LEGACY)
---------------------------------------------------*/
export async function getGeneralTreatmentsForCaregiver(caregiverName) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> getGeneralTreatmentsForCaregiver for caregiver: ${caregiverName}`);
    const todayDate = new Date();
    const todayStr = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()}`;
    console.log(`Filtering general treatments for today: ${todayStr}`);
    
    const allGeneralTreatments = [];
    const sheets = ANIMAL_TREATMENT_SHEETS();

    for (const animalType of Object.keys(sheets)) {
      const animals = await getAnimals(animalType);
      
      const assignedAnimals = animals.filter(animal => {
        const inTreatementsField = (animal.in_treatment || '').toString();  
        const caregivers = inTreatementsField.split(',').map(name => name.trim());
        return caregivers.includes(caregiverName);
      });
      
      for (const animal of assignedAnimals) {
        const spreadsheetId = await findSpreadsheetInFolder(animalType, animal.id);
        
        if(spreadsheetId) {
          const doc = await getDoc(spreadsheetId);
          const sheet = doc.sheetsByIndex[0];
          const rows = await sheet.getRows();
          
          // Build header map
          const headerMap = {};
          if (sheet.headerValues) {
            sheet.headerValues.forEach((header, index) => {
              if (header) headerMap[header.trim()] = index;
            });
          }
          
          const generalTreatmentCol = headerMap['טיפול כללי'] !== undefined ? headerMap['טיפול כללי'] : 5;
          const treatmentCol = headerMap['טיפול'] !== undefined ? headerMap['טיפול'] : 6;
          const caseCol = headerMap['סיבת טיפול'] !== undefined ? headerMap['סיבת טיפול'] : 11;
          const dosageCol = headerMap['מינון'] !== undefined ? headerMap['מינון'] : 7;
          const dateCol = 0;
          
          for(const row of rows) {
            const generalTreatmentValue = row._rawData?.[generalTreatmentCol];
            const dateValue = row._rawData?.[dateCol] || '';
            
            // Parse the row date and compare with today
            const rowDate = parseDMY(dateValue);
            const todayParsed = parseDMY(todayStr);
            
            // Check if general treatment checkbox is TRUE and if date matches today
            if((generalTreatmentValue === true || generalTreatmentValue === 'TRUE') && rowDate === todayParsed) {
              const treatment = row._rawData?.[treatmentCol] || '';
              const medicalCase = row._rawData?.[caseCol] || '';
              const dosage = row._rawData?.[dosageCol] || '';
              const date = dateValue;
              
              console.log(`Found general treatment for today: ${animal.name} - ${treatment}`);
              
              allGeneralTreatments.push({
                animalName: animal.name,
                animalType: sheets[animalType].displayName,
                treatment,
                medicalCase,
                dosage,
                date
              });
            }
          }
        }
      }
    }
    
    console.log(`Total general treatments for today: ${allGeneralTreatments.length}`);
    return allGeneralTreatments;
  } catch (error) {
    console.error('Error in getGeneralTreatmentsForCaregiver:', error);
    throw error;
  }
}

// Check if sheet has treatment today
// Cache for in-flight hasTreatmentToday calls
const treatmentCheckCache = new Map();

//--------------------------------------------------
// Read rows in chunks from Google Sheets
//---------------------------------------------------
function colToA1(colIndex1Based) {
  let n = colIndex1Based;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function getAnimalImageFromDoc(doc) {
  try {
    console.log('>>> getAnimalImageFromDoc');

    // Find or create Photo sheet
    let photoSheet = doc.sheetsByTitle['Photo'];
    if (!photoSheet) {
      console.log('No Photo sheet found');
      return null;
    }

    await photoSheet.loadCells('A1:A2');
    const cell = photoSheet.getCell(1, 0); // Row 2, Column A (0-indexed)
    
    return cell.value || null;
  } catch (error) {
    console.error('Error in getAnimalImageFromDoc:', error);
    return null;
  }
}


/*--------------------------------------------------
  Check if sheet has treatment today
---------------------------------------------------*/
export async function hasTreatmentToday(sheetId, todayStr, excludeCheckedGeneralTreatments = false) {
  console.log(`>>> hasTreatmentToday for sheetID: ${sheetId} and date: ${todayStr}, excludeCheckedGeneralTreatments: ${excludeCheckedGeneralTreatments}`);  
  await ensureConfigLoaded(); 
  let hasTreatment = false;
  let treatmentTimes = [];
  if (!sheetId) throw new Error('sheetId is required');  
  const doc = await getDoc(sheetId);  
  const sheet = doc.sheetsByIndex[0];  
  const sheetName = sheet.title;
  
  const animalImage = await getAnimalImageFromDoc(doc);

  await sheet.loadHeaderRow();
  const headers = sheet.headerValues;
  // Build header map from the sheet's header values
  const headerMap = {};
  if (headers) {
    headers.forEach((header, index) => {
      if (header) headerMap[header.trim()] = index;
    });
  }
  
  console.log('Headers:', headers);
  console.log('HeaderMap:', headerMap);
  
  // Column indices (fallback if header mapping doesn't work)
  const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
  const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
  const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
  const generalTreatmentCol = headerMap['טיפול כללי'] !== undefined ? headerMap['טיפול כללי'] : 5;
  const personalTreatmentCol = headerMap['טיפול אישי'] !== undefined ? headerMap['טיפול אישי'] : 6;
  const treatmentCol = headerMap['טיפול'] !== undefined ? headerMap['טיפול'] : 7;
  const dosageCol = headerMap['מינון'] !== undefined ? headerMap['מינון'] : 8;
  const caseCol = headerMap['סיבת טיפול'] !== undefined ? headerMap['סיבת טיפול'] : 11;
  
  console.log(`Column indices: morning=${morningCol}, noon=${noonCol}, evening=${eveningCol}, general=${generalTreatmentCol}, personal=${personalTreatmentCol}, treatment=${treatmentCol}, dosage=${dosageCol}, case=${caseCol}`);
  
  try {  
    // Get row one by one to avoid memory issues
    // When the date is earlier than today, we can stop checking further
    const parsedTodayDate = parseDMY(todayStr);
    const startCol = 1;
    const endCol = headers.length; 
    const startRow = 2; 
    const endRow = sheet.rowCount; 
    const chunkSize = 20; // Number of rows to fetch per API call
    const auth = getSheetsAuth();
    const sheetAPI = google.sheets({ version: 'v4', auth });

    // Get rows one at a time using the sheet API

    const startA = colToA1(startCol);
    const endA = colToA1(endCol);
    outerLoop:
    for (let r = startRow; r <= endRow; r += chunkSize) {
      const rEnd = Math.min(endRow, r + chunkSize - 1);
      const range = `${sheetName}!${startA}${r}:${endA}${rEnd}`;

      const resp = await sheetAPI.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        majorDimension: "ROWS",
      });
      for (let i = 0; i < (resp.data.values ? resp.data.values.length : 0); i++) {
        const rowValues = resp.data.values[i];
        const row = resp.data.values ? { _rawData: rowValues } : null;
        if (!row) continue;
        console.log(`Fetched rows ${r} to ${rEnd}, got ${resp.data.values ? resp.data.values.length : 0} rows`);
        const values = resp.data.values ?? [];
        const stringDate = rowValues[0];
        const parsedRowDate = parseDMY(stringDate);
        
        if (parsedRowDate < parsedTodayDate)
        {
          break outerLoop; // Since rows are sorted by date descending, we can stop checking further
        }
        if(!stringDate || !todayStr) continue;
        
        
        if(parsedRowDate === parsedTodayDate) {
          console.log(`✓ Found treatment for today: ${todayStr} in row date: ${stringDate}`);
          hasTreatment = true;
          console.log('Row raw data:', row._rawData);
          
          const morningValue = rowValues[morningCol];
          const noonValue = rowValues[noonCol];
          const eveningValue = rowValues[eveningCol];
          const generalTreatmentValue = rowValues[generalTreatmentCol];
          const personalTreatmentValue = rowValues[personalTreatmentCol];
          const medicalCase = rowValues[caseCol] || '';
          const treatment = rowValues[treatmentCol] || '';
          const dosage = rowValues[dosageCol] || '';
          
          console.log(`Values extracted: morning='${morningValue}', noon='${noonValue}', evening='${eveningValue}', general='${generalTreatmentValue}', personal='${personalTreatmentValue}', treatment='${treatment}'`);
          console.log(`Column indices used: morningCol=${morningCol}, noonCol=${noonCol}, eveningCol=${eveningCol}, generalCol=${generalTreatmentCol}, personalCol=${personalTreatmentCol}`);
          
          // If general treatment checkbox is checked (TRUE), skip this entire row
          const isGeneralTreatmentChecked =  (generalTreatmentValue === true || generalTreatmentValue === 'TRUE');
          
          if (isGeneralTreatmentChecked && excludeCheckedGeneralTreatments) {
            // Skip this row entirely if general treatment is checked and we're excluding them
            continue;
          }
          
          // Check if time slots have any values (blank, true, or false)
          const isMorningBlank = morningValue === '';
          const isNoonBlank = noonValue === '';
          const isEveningBlank = eveningValue === '';
          
          // Check if any time slot has a value (TRUE or FALSE)
          const hasTimeSlots = (morningValue === false || morningValue === 'FALSE' || morningValue === true || morningValue === 'TRUE') ||
                              (noonValue === false || noonValue === 'FALSE' || noonValue === true || noonValue === 'TRUE') ||
                              (eveningValue === false || eveningValue === 'FALSE' || eveningValue === true || eveningValue === 'TRUE');
          
          // Check if personal or general checkboxes have values
          const hasPersonalOrGeneralCheckbox = (personalTreatmentValue === true || personalTreatmentValue === 'TRUE' || 
                                                 personalTreatmentValue === false || personalTreatmentValue === 'FALSE' ||
                                                 generalTreatmentValue === true || generalTreatmentValue === 'TRUE' ||
                                                 generalTreatmentValue === false || generalTreatmentValue === 'FALSE');
          
          // Categorize this row based on the logic:
          // If personal or general checkbox is set, ignore time slots and use checkbox logic
          if (hasPersonalOrGeneralCheckbox) {
            // Personal/General checkbox treatment - ignore time slots
            const isPersonalTreatmentChecked = (personalTreatmentValue === true || personalTreatmentValue === 'TRUE');
            const isPersonalTreatmentUnchecked = (personalTreatmentValue === false || personalTreatmentValue === 'FALSE');
            const isGeneralUnchecked = (generalTreatmentValue === false || generalTreatmentValue === 'FALSE');
            
            // Priority: Personal > General
            if (isPersonalTreatmentChecked) {
              // Personal treatment - checked = completed
              treatmentTimes.push({ 
                timeSlot: 'personal', 
                medicalCase,
                treatment,
                dosage,
                isGeneral: false,
                isCompleted: true,
                isPersonal: true
              });
            } else if (isPersonalTreatmentUnchecked) {
              // Personal treatment - unchecked = incomplete
              treatmentTimes.push({ 
                timeSlot: 'personal', 
                medicalCase,
                treatment,
                dosage,
                isGeneral: false,
                isCompleted: false,
                isPersonal: true
              });
            } else if (isGeneralTreatmentChecked) {
              // General treatment - checked = completed
              treatmentTimes.push({ 
                timeSlot: 'general', 
                medicalCase,
                treatment,
                dosage,
                isGeneral: true,
                isCompleted: true,
                isPersonal: false
              });
            } else if (isGeneralUnchecked) {
              // General treatment - unchecked = incomplete
              treatmentTimes.push({ 
                timeSlot: 'general', 
                medicalCase,
                treatment,
                dosage,
                isGeneral: true,
                isCompleted: false,
                isPersonal: false
              });
            }
          } else if (hasTimeSlots) {
            // Case: This row has time slots and NO personal/general checkbox - use for daily schedule
            // Check morning: false/FALSE = needs treatment (not completed), true/TRUE = completed
            if(morningValue === false || morningValue === 'FALSE' || morningValue === true || morningValue === 'TRUE') {
              treatmentTimes.push({ 
                timeSlot: 'morning', 
                medicalCase,
                treatment,
                dosage,
                isCompleted: morningValue === true || morningValue === 'TRUE',
                isGeneral: false,
                isPersonal: false // Has time slots, so not shown in personal treatments
              });
            }
            // Check noon
            if(noonValue === false || noonValue === 'FALSE' || noonValue === true || noonValue === 'TRUE') {
              treatmentTimes.push({ 
                timeSlot: 'noon', 
                medicalCase,
                treatment,
                dosage,
                isCompleted: noonValue === true || noonValue === 'TRUE',
                isGeneral: false,
                isPersonal: false
              });
            }
            // Check evening
            if(eveningValue === false || eveningValue === 'FALSE' || eveningValue === true || eveningValue === 'TRUE') {
              treatmentTimes.push({ 
                timeSlot: 'evening', 
                medicalCase,
                treatment,
                dosage,
                isCompleted: eveningValue === true || eveningValue === 'TRUE',
                isGeneral: false,
                isPersonal: false
              });
            }
          }
          // If both checkboxes AND time slots are empty, we don't add it to the list
        }
      }
    }

    return { hasTreatment, treatmentTimes, animalImage };
  } catch (error) {
    console.error('Error in hasTreatmentToday:', error);
    return { hasTreatment: false, treatmentTimes: [] };
  }
}

/*--------------------------------------------------
  Mark general treatment as complete
---------------------------------------------------*/
export async function markGeneralTreatmentComplete(animalType, animalName, dateStr) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> markGeneralTreatmentComplete for animal: ${animalName}, date: ${dateStr}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      throw new Error(`Could not find treatment sheet for animal: ${animalName}`);
    }
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    // Build header map
    const headerMap = {};
    if (sheet.headerValues) {
      sheet.headerValues.forEach((header, index) => {
        if (header) headerMap[header.trim()] = index;
      });
    }
    
    const generalTreatmentCol = headerMap['טיפול כללי'] !== undefined ? headerMap['טיפול כללי'] : 5;
    const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
    const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
    const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
    
    // Find the row with matching date and unchecked general treatment
    const parsedTargetDate = parseDMY(dateStr);
    let rowFound = false;
    
    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr);
      
      if (rowDate === parsedTargetDate) {
        const generalTreatmentValue = row._rawData?.[generalTreatmentCol];
        const morningValue = row._rawData?.[morningCol];
        const noonValue = row._rawData?.[noonCol];
        const eveningValue = row._rawData?.[eveningCol];
        
        // Check if this row has no time slots
        const hasNoTimeSlots = 
          (morningValue === '' || morningValue === null || morningValue === undefined) &&
          (noonValue === '' || noonValue === null || noonValue === undefined) &&
          (eveningValue === '' || eveningValue === null || eveningValue === undefined);
        
        // Check if general checkbox is unchecked (FALSE)
        const isGeneralUnchecked = generalTreatmentValue === false || generalTreatmentValue === 'FALSE';
        
        if (hasNoTimeSlots && isGeneralUnchecked) {
          // Update this row: check the general treatment checkbox
          const rowIndex = row._rowNumber - 1; // Convert to 0-based index
          const columnLetter = String.fromCharCode(65 + generalTreatmentCol); // Convert column index to letter
          
          await sheet.loadCells(`${columnLetter}${row._rowNumber}:${columnLetter}${row._rowNumber}`);
          const cell = sheet.getCell(rowIndex, generalTreatmentCol);
          cell.value = true;
          
          await sheet.saveUpdatedCells();
          rowFound = true;
          console.log(`✓ Marked general treatment as complete for ${animalName} on ${dateStr}`);
          break;
        }
      }
    }
    
    if (!rowFound) {
      throw new Error(`Could not find unchecked general treatment row for ${animalName} on ${dateStr}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in markGeneralTreatmentComplete:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Mark general treatment as incomplete
---------------------------------------------------*/
export async function markGeneralTreatmentIncomplete(animalType, animalName, dateStr) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> markGeneralTreatmentIncomplete for animal: ${animalName}, date: ${dateStr}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      throw new Error(`Could not find treatment sheet for animal: ${animalName}`);
    }
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    // Build header map
    const headerMap = {};
    if (sheet.headerValues) {
      sheet.headerValues.forEach((header, index) => {
        if (header) headerMap[header.trim()] = index;
      });
    }
    
    const generalTreatmentCol = headerMap['טיפול כללי'] !== undefined ? headerMap['טיפול כללי'] : 5;
    const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
    const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
    const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
    
    // Find the row with matching date and checked general treatment
    const parsedTargetDate = parseDMY(dateStr);
    let rowFound = false;
    
    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr);
      
      if (rowDate === parsedTargetDate) {
        const generalTreatmentValue = row._rawData?.[generalTreatmentCol];
        const morningValue = row._rawData?.[morningCol];
        const noonValue = row._rawData?.[noonCol];
        const eveningValue = row._rawData?.[eveningCol];
        
        // Check if this row has no time slots
        const hasNoTimeSlots = 
          (morningValue === '' || morningValue === null || morningValue === undefined) &&
          (noonValue === '' || noonValue === null || noonValue === undefined) &&
          (eveningValue === '' || eveningValue === null || eveningValue === undefined);
        
        // Check if general checkbox is checked (TRUE)
        const isGeneralChecked = generalTreatmentValue === true || generalTreatmentValue === 'TRUE';
        
        if (hasNoTimeSlots && isGeneralChecked) {
          // Update this row: uncheck the general treatment checkbox
          const rowIndex = row._rowNumber - 1; // Convert to 0-based index
          const columnLetter = String.fromCharCode(65 + generalTreatmentCol); // Convert column index to letter
          
          await sheet.loadCells(`${columnLetter}${row._rowNumber}:${columnLetter}${row._rowNumber}`);
          const cell = sheet.getCell(rowIndex, generalTreatmentCol);
          cell.value = false;
          
          await sheet.saveUpdatedCells();
          rowFound = true;
          console.log(`✓ Marked general treatment as incomplete for ${animalName} on ${dateStr}`);
          break;
        }
      }
    }
    
    if (!rowFound) {
      throw new Error(`Could not find checked general treatment row for ${animalName} on ${dateStr}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in markGeneralTreatmentIncomplete:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Mark personal treatment as complete
---------------------------------------------------*/
export async function markPersonalTreatmentComplete(animalType, animalName, dateStr) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> markPersonalTreatmentComplete for animal: ${animalName}, date: ${dateStr}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      throw new Error(`Could not find treatment sheet for animal: ${animalName}`);
    }
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    // Build header map
    const headerMap = {};
    if (sheet.headerValues) {
      sheet.headerValues.forEach((header, index) => {
        if (header) headerMap[header.trim()] = index;
      });
    }
    
    const personalTreatmentCol = headerMap['טיפול אישי'] !== undefined ? headerMap['טיפול אישי'] : 6;
    const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
    const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
    const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
    
    // Find the row with matching date and unchecked personal treatment
    const parsedTargetDate = parseDMY(dateStr);
    let rowFound = false;
    
    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr);
      
      if (rowDate === parsedTargetDate) {
        const personalTreatmentValue = row._rawData?.[personalTreatmentCol];
        const morningValue = row._rawData?.[morningCol];
        const noonValue = row._rawData?.[noonCol];
        const eveningValue = row._rawData?.[eveningCol];
        
        // Check if this row has no time slots
        const hasNoTimeSlots = 
          (morningValue === '' || morningValue === null || morningValue === undefined) &&
          (noonValue === '' || noonValue === null || noonValue === undefined) &&
          (eveningValue === '' || eveningValue === null || eveningValue === undefined);
        
        // Check if personal checkbox is unchecked (FALSE)
        const isPersonalUnchecked = personalTreatmentValue === false || personalTreatmentValue === 'FALSE';
        
        if (hasNoTimeSlots && isPersonalUnchecked) {
          // Update this row: check the personal treatment checkbox
          const rowIndex = row._rowNumber - 1; // Convert to 0-based index
          const columnLetter = String.fromCharCode(65 + personalTreatmentCol); // Convert column index to letter
          
          await sheet.loadCells(`${columnLetter}${row._rowNumber}:${columnLetter}${row._rowNumber}`);
          const cell = sheet.getCell(rowIndex, personalTreatmentCol);
          cell.value = true;
          
          await sheet.saveUpdatedCells();
          rowFound = true;
          console.log(`✓ Marked personal treatment as complete for ${animalName} on ${dateStr}`);
          break;
        }
      }
    }
    
    if (!rowFound) {
      throw new Error(`Could not find unchecked personal treatment row for ${animalName} on ${dateStr}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in markPersonalTreatmentComplete:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Mark personal treatment as incomplete
---------------------------------------------------*/
export async function markPersonalTreatmentIncomplete(animalType, animalName, dateStr) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> markPersonalTreatmentIncomplete for animal: ${animalName}, date: ${dateStr}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      throw new Error(`Could not find treatment sheet for animal: ${animalName}`);
    }
    
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    // Build header map
    const headerMap = {};
    if (sheet.headerValues) {
      sheet.headerValues.forEach((header, index) => {
        if (header) headerMap[header.trim()] = index;
      });
    }
    
    const personalTreatmentCol = headerMap['טיפול אישי'] !== undefined ? headerMap['טיפול אישי'] : 6;
    const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
    const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
    const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
    
    // Find the row with matching date and checked personal treatment
    const parsedTargetDate = parseDMY(dateStr);
    let rowFound = false;
    
    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr);
      
      if (rowDate === parsedTargetDate) {
        const personalTreatmentValue = row._rawData?.[personalTreatmentCol];
        const morningValue = row._rawData?.[morningCol];
        const noonValue = row._rawData?.[noonCol];
        const eveningValue = row._rawData?.[eveningCol];
        
        // Check if this row has no time slots
        const hasNoTimeSlots = 
          (morningValue === '' || morningValue === null || morningValue === undefined) &&
          (noonValue === '' || noonValue === null || noonValue === undefined) &&
          (eveningValue === '' || eveningValue === null || eveningValue === undefined);
        
        // Check if personal checkbox is checked (TRUE)
        const isPersonalChecked = personalTreatmentValue === true || personalTreatmentValue === 'TRUE';
        
        if (hasNoTimeSlots && isPersonalChecked) {
          // Update this row: uncheck the personal treatment checkbox
          const rowIndex = row._rowNumber - 1; // Convert to 0-based index
          const columnLetter = String.fromCharCode(65 + personalTreatmentCol); // Convert column index to letter
          
          await sheet.loadCells(`${columnLetter}${row._rowNumber}:${columnLetter}${row._rowNumber}`);
          const cell = sheet.getCell(rowIndex, personalTreatmentCol);
          cell.value = false;
          
          await sheet.saveUpdatedCells();
          rowFound = true;
          console.log(`✓ Marked personal treatment as incomplete for ${animalName} on ${dateStr}`);
          break;
        }
      }
    }
    
    if (!rowFound) {
      throw new Error(`Could not find checked personal treatment row for ${animalName} on ${dateStr}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in markPersonalTreatmentIncomplete:', error);
    throw error;
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
      
      //console.log(`Row ${i} name: "${rowName}" (raw:`, cellValue, ')');
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

/*--------------------------------------------------
  Rename animal treatment spreadsheet
---------------------------------------------------*/
export async function renameAnimalTreatmentSheet(animalType, oldAnimalName, newId) {
  try {
    await ensureConfigLoaded();
    console.log(`>> renameAnimalTreatmentSheet for animal: ${oldAnimalName}, newId: ${newId}`);
    
    // Find the spreadsheet
    const spreadsheetId = await findSpreadsheetInFolder(animalType, oldAnimalName);
    if (!spreadsheetId) {
      console.warn(`No spreadsheet found for animal: ${oldAnimalName}`);
      return { success: false, message: 'Spreadsheet not found' };
    }
    
    // Extract animal name (first word before any spaces/numbers)
    const animalNameOnly = oldAnimalName.split(' ')[0];
    
    // Use user OAuth client for Drive API
    const userAuth = getUserOAuthClient();
    const drive = google.drive({ version: 'v3', auth: userAuth });
    
    // Get current filename
    const fileResponse = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'name'
    });
    
    const oldFileName = fileResponse.data.name;
    console.log(`Current filename: "${oldFileName}"`);
    
    // Determine the new filename based on the original format
    let newFileName;
    if (oldFileName.startsWith('עותק של ')) {
      // Format: "עותק של [name] [id]" or "עותק של [name]"
      newFileName = `עותק של ${animalNameOnly} ${newId}`;
    } else {
      // Format: "[name] [id]" or just "[name]"
      newFileName = `${animalNameOnly} ${newId}`;
    }
    
    // Only rename if the name actually changed
    if (oldFileName === newFileName) {
      console.log('Filename already matches, no rename needed');
      return { success: true };
    }
    
    console.log(`Renaming spreadsheet to: "${newFileName}"`);
    
    // Rename the file
    await drive.files.update({
      fileId: spreadsheetId,
      requestBody: {
        name: newFileName
      },
      fields: 'id, name'
    });
    
    console.log(`✓ Successfully renamed treatment sheet`);
    return { success: true };
  } catch (error) {
    console.error('Error in renameAnimalTreatmentSheet:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Remove animal from main list
---------------------------------------------------*/
export async function removeAnimalFromList(animalType, animalName) {
  try {
    await ensureConfigLoaded();
    console.log(`>> removeAnimalFromList for animal: ${animalName} of type: ${animalType}`);

    const animalTypeKey = await getAnimalTypeKey(animalType);
    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey]?.sheetId;
    if (!spreadsheetId) {
      throw new Error(`No sheet found for animal type: ${animalType}`);
    }

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

    const rows = await sheet.getRows();
    const targetName = animalName.toString().trim();
    const targetRow = rows.find((row) => {
      const cellValue = row._rawData?.[nameColIndex];
      const rowName = cellValue?.toString().trim();
      return rowName === targetName;
    });

    if (!targetRow) {
      throw new Error(`Animal with name "${animalName}" not found in sheet ${spreadsheetId}`);
    }

    await targetRow.delete();
    console.log(`Animal ${animalName} removed successfully from ${animalType} list.`);
    return { success: true };
  } catch (error) {
    console.error('Error in removeAnimalFromList:', error);
    throw error;
  }
}

/*-----------------------------------------------
  function to collect each file that was edited in the last two weeks by folder id and check if each file has treatments today
  ----------------------------------------------*/
export async function getRecentlyEditedFilesInFolderWithTreatmentsToday(folderId, targetDate = null) {
  try {
    await ensureConfigLoaded();
    console.log('>>> getRecentlyEditedFilesInFolderWithTreatmentsToday...');
    const filesWithTreatmentsToday = [];
    if (!folderId) throw new Error('folderId is required'); 
    const drive = getDriveClient();
    let startDate;
    /* TEMPORARY: Set to true to only get files edited today
    const ONLY_TODAY_EDITS = true;
    
    
    if (ONLY_TODAY_EDITS) {
      // Get files edited starting from today
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      startDate = today;
      console.log('TEMPORARY MODE: Fetching only files edited today:', today.toISOString());
    } else {
      */
      // Original behavior: two weeks ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 1);// - 14); !!!!!!!!!!!!!!!!!!!!!!!!!!
      startDate = twoWeeksAgo;
    //}
    
    const startDateISO = startDate.toISOString();
    
    // Use provided date or default to today
    const dateToCheck = targetDate ? new Date(targetDate) : new Date();
    const dateStr = `${dateToCheck.getDate()}/${dateToCheck.getMonth() + 1}/${dateToCheck.getFullYear()}`;
    
    // list file names in folder modified since startDate
    const tempResponse = await drive.files.list({
      q: `'${folderId}' in parents and modifiedTime >= '${startDateISO}' and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });
    
    console.log(`Found ${tempResponse.data.files.length} files modified since ${startDateISO}`);
    
    for (const file of tempResponse.data.files) {
      const { hasTreatment,treatmentTimes} = await hasTreatmentToday(file.id, dateStr);
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
/*--------------------------------------------------
  Add animal to main list (alphabetically sorted)
---------------------------------------------------*/
export async function addAnimalToList(animalType, animalData) {
  try {
    await ensureConfigLoaded();
    console.log('>>> addAnimalToList for animalType:', animalType, animalData);
    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalType].sheetId;
    
    if (!spreadsheetId) {
      throw new Error('No sheet ID found for animal type: ' + animalType);
    }

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const sheetId = sheet.sheetId;
    
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    
    // Find the name column index for sorting
    const nameColIndex = headers.findIndex(h => h && h.trim() === 'שם');
    console.log('Name column index for sorting:', nameColIndex);
    
    // Create new row data
    const newRowData = {};
    
    // Map fields to Hebrew headers
    Object.entries(FIELD_TO_HEADER).forEach(([field, hebrewHeader]) => {
      if (animalData[field] !== undefined) {
        newRowData[hebrewHeader] = animalData[field];
      }
    });
    
    // Add the new row
    await sheet.addRow(newRowData);
    console.log('Added new row for animal:', animalData.name);
    
    // Sort the sheet alphabetically by name column using Google Sheets API
    if (nameColIndex !== -1) {
      const auth = getSheetsAuth();
      const sheetsApi = google.sheets({ version: 'v4', auth });
      
      // Get the total number of rows
      const rows = await sheet.getRows();
      const totalRows = rows.length + 1; // +1 for header row
      
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              sortRange: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 1, // Skip header row
                  endRowIndex: totalRows,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length
                },
                sortSpecs: [
                  {
                    dimensionIndex: nameColIndex, // Sort by name column
                    sortOrder: 'ASCENDING'
                  }
                ]
              }
            }
          ]
        }
      });
      
      console.log('Sorted sheet alphabetically by name (column index:', nameColIndex, ')');
    } else {
      console.warn('Could not find name column (שם) for sorting');
    }
    
    console.log('Animal ' + animalData.name + ' added successfully to ' + animalType + ' sheet and sorted alphabetically');
    return { success: true };
    
  } catch (error) {
    console.error('Error in addAnimalToList:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Create a new treatment sheet for an animal
---------------------------------------------------*/
export async function createAnimalTreatmentSheet(animalType, sheetName) {
  try {
    await ensureConfigLoaded();
    console.log('>>> createAnimalTreatmentSheet for ' + animalType + ': ' + sheetName);

    const folderConfig = ANIMAL_TREATMENT_SHEETS()[animalType];
    if (!folderConfig) {
      throw new Error('Unknown animal type: ' + animalType);
    }

    const folderId = folderConfig.folderId;
    if (!folderId) {
      throw new Error('No folder ID found for animal type: ' + animalType);
    }


    const userAuth = getUserOAuthClient();
    const sheetsApi = google.sheets({ version: 'v4', auth: userAuth });
    const drive = google.drive({ version: 'v3', auth: userAuth });




    console.log('Creating Finished 1');
    // 2) Create the spreadsheet using Drive API
    const createResponse = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
      },
      fields: 'id',
    });

    
    console.log('new sheet name:', sheetName);
    const newSpreadsheetId = createResponse.data.id;
    console.log('Created spreadsheet. ID:', newSpreadsheetId);

    // Get the actual sheet name from the created spreadsheet
    const spreadsheetInfo = await sheetsApi.spreadsheets.get({
      spreadsheetId: newSpreadsheetId,
    });
    
    const firstSheetName = spreadsheetInfo.data.sheets[0].properties.title;
    console.log('First sheet name:', firstSheetName);

    // 3) Move the file to the correct folder using Drive API
    try {
      await drive.files.update({
        fileId: newSpreadsheetId,
        addParents: folderId,
        fields: 'id, parents',
      });
      console.log('Moved spreadsheet to folder:', folderId);
    } catch (moveError) {
      console.warn('Could not move file to folder (continuing anyway):', moveError.message);
    }

    // 4) Add headers to the new sheet
    const headers = ['תאריך', 'יום', 'בוקר', 'צהריים', 'ערב', 'טיפול כללי', 'טיפול', 'מינון', 'מתן', 'משך', 'מתחם', 'סיבת טיפול', 'הערות'];

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: newSpreadsheetId,
      range: `${firstSheetName}!A1:M1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });

    // 5) Format the header row
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: newSpreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                  textFormat: { bold: true },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
        ],
      },
    });

    console.log('Treatment sheet created successfully: ' + sheetName + ' (ID: ' + newSpreadsheetId + ')');
    return newSpreadsheetId;

  } catch (error) {
    console.error(
      'Error in createAnimalTreatmentSheet:',
      error.response?.data || error.message || error
    );
    throw error;
  }
}


/*--------------------------------------------------
 set caregiver for animal in main list
---------------------------------------------------*/
export async function setCaregiverForAnimal(animalType, animalName, caregiverName) {
  try {
    await ensureConfigLoaded();
    console.log(`>> setCaregiverForAnimal for animal: ${animalName} of type: ${animalType}, caregiver: ${caregiverName}`); 
    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalType].sheetId;
    
    if (!spreadsheetId) {
      throw new Error('No sheet ID found for animal type: ' + animalType);
    }   
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];   
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Headers from sheet:', headers); 
    const nameColIndex = headers.findIndex(h => h && h.trim() === 'שם');
    const caregiverColIndex = headers.findIndex(h => h && h.trim() === 'מטפל');
    console.log('Name column index:', nameColIndex);
    console.log('Caregiver column index:', caregiverColIndex);
    if (nameColIndex === -1) {
      throw new Error(`Could not find 'שם' header in sheet ${spreadsheetId}`);
    }
    if (caregiverColIndex === -1) {
      throw new Error(`Could not find 'מטפל' header in sheet ${spreadsheetId}`);
    } 
    const rows = await sheet.getRows();
    let rowIndex = -1;
    const targetName = (animalName).toString().trim();  
    const targetRow = rows.find((row, i) => {
      const cellValue = row._rawData?.[nameColIndex];
      const rowName = (cellValue).toString().trim();  
      rowIndex = i;
      return rowName === targetName;
    }
    );
    if (!targetRow) {
      throw new Error(`Animal with name "${animalName}" not found in sheet ${spreadsheetId}`);
    }
    
    // Handle "כללי" (general) - add all caregivers
    let caregiverToAdd = caregiverName;
    if (caregiverName.trim() === 'כללי') {
      console.log('General caregiver selected - fetching all caregivers');
      const allCaregivers = await getAllCaregivers();
      caregiverToAdd = allCaregivers.join(', ');
      console.log(`Setting all caregivers: ${caregiverToAdd}`);
    }
    
    console.log(`Updating caregiver for animal "${animalName}" - adding:`, caregiverToAdd);
    const columnLetter = String.fromCharCode(65 + caregiverColIndex);
    const cellsString = `A${rowIndex+1}:${columnLetter}${rowIndex+2}`;
    await sheet.loadCells(cellsString);
    const cell = sheet.getCell(rowIndex+1, caregiverColIndex);
    
    // If "כללי" was selected, replace all caregivers
    if (caregiverName.trim() === 'כללי') {
      cell.value = caregiverToAdd;
      console.log(`Set all caregivers for ${animalName}`);
    } else {
      // Get existing caregivers and add the new one if not already present
      const existingValue = (cell.value || '').toString().trim();
      if (existingValue) {
        // Split by comma, trim, and check if caregiver already exists
        const existingCaregivers = existingValue.split(',').map(c => c.trim());
        if (!existingCaregivers.includes(caregiverToAdd.trim())) {
          // Add new caregiver to the list
          cell.value = existingValue + ', ' + caregiverToAdd.trim();
        } else {
          console.log(`Caregiver ${caregiverToAdd} already assigned to ${animalName}`);
        }
      } else {
        // No existing caregivers, set the new one
        cell.value = caregiverToAdd.trim();
      }
    }
    
    await sheet.saveUpdatedCells();  
    console.log(`Caregiver for animal ${animalName} updated successfully to ${caregiverToAdd}.`);
    return { success: true };
  } catch (error) {
    console.error('Error in setCaregiverForAnimal:', error);
    throw error;
  } 
}

//--------------------------------------------------
//  Add general treatment coulmn after evening coulmn with validations
//---------------------------------------------------
export async function addGeneralTreatmentColumnWithValidations() {
  try {
    await ensureConfigLoaded();

    for (const animalType of Object.keys(ANIMAL_TREATMENT_SHEETS())) {
      const folderId = ANIMAL_TREATMENT_SHEETS()[animalType].folderId;
      console.log(`Processing folder for animal type: ${animalType}, folderId: ${folderId}`);

      const drive = getDriveClient();
      let pageToken = undefined;

      do {
        const response = await drive.files.list({
          q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
          fields: 'nextPageToken, files(id, name)',
          spaces: 'drive',
          pageSize: 100,          // max per page
          pageToken,              // continue from previous page
        });

        const files = response.data.files || [];
        console.log(`Found ${files.length} files in this page for ${animalType}`);

        for (const file of files) {
          console.log(`Processing file: ${file.name} (${file.id})`);
          await addGeneralTreatmentColumnToSheet(file.id);
          // your existing pause (you can tune this later)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in addGeneralTreatmentColumnWithValidations:', error);
    throw error;
  }
}
/*-------------------------------------------------- 
  Add general treatment coulmn after evening coulmn with validations to specific sheet
---------------------------------------------------*/
export async function addGeneralTreatmentColumnToSheet(spreadsheetId){
  try {
    await ensureConfigLoaded();
    console.log(`>>> addGeneralTreatmentColumnWithValidations for sheetID: ${spreadsheetId}`);
    if (!spreadsheetId) throw new Error('Could not find treatment sheet for animal: ' );  
    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0]; 
    const sheetId = sheet.sheetId;
    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });
    
    // Read headers directly using Sheets API to avoid duplicate header error
    const headerResponse = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheet.title}!1:1`
    });
    
    const headers = headerResponse.data.values?.[0] || [];
    const generalTreatmentIndices = [];
    
    headers.forEach((header, index) => {
      if (header && header.trim() === 'טיפול כללי') {
        generalTreatmentIndices.push(index);
      }
    });
    
    console.log(`Found ${generalTreatmentIndices.length} "טיפול כללי" columns at indices:`, generalTreatmentIndices);
    
    // If multiple columns exist, delete all except the first one
    if (generalTreatmentIndices.length > 1) {
      console.log(`Deleting ${generalTreatmentIndices.length - 1} duplicate "טיפול כללי" columns`);
      
      // Delete columns in reverse order to maintain correct indices
      const deleteRequests = [];
      for (let i = generalTreatmentIndices.length - 1; i >= 1; i--) {
        const colIndex = generalTreatmentIndices[i];
        deleteRequests.push({
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: colIndex,
              endIndex: colIndex + 1
            }
          }
        });
      }
      
      if (deleteRequests.length > 0) {
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: { requests: deleteRequests }
        });
        console.log(`Deleted ${deleteRequests.length} duplicate columns`);
      }
      
      // Column already exists, no need to add it
      return { success: true, message: 'Removed duplicates, kept first column' };
    }
    
    // If exactly one column exists, we're done
    if (generalTreatmentIndices.length === 1) {
      console.log('General treatment column already exists at index:', generalTreatmentIndices[0]);
      return { success: true, message: 'Column already exists' };
    }
    
    // No column exists, add it
    // 1) Insert new column after evening (column index 4)
    await withSheetsRetry(() => sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,  
      resource: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 5,
                endIndex: 6 
              },
              inheritFromBefore: true
            } 
          }
        ]
      }
    }));
    console.log('Inserted new column after evening column');  
    
    // 2) Set header for new column
    await withSheetsRetry(() => sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['טיפול כללי']] 
      }
    }));
    console.log('Set header for new general treatment column'); 
    
    // 3) Add data validation to new column (checkboxes)
    await withSheetsRetry(() => sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 1,
                endRowIndex: sheet.rowCount,
                startColumnIndex: 5,
                endColumnIndex: 6
              },
              rule: {
                condition: {
                  type: 'BOOLEAN'
                },
                inputMessage: 'סמן אם הטיפול הכללי בוצע',
                strict: true,
                showCustomUi: true  
              }
            }
          }
        ]
      }
    }));
    console.log('Added data validation (checkboxes) to general treatment column'); 
    return { success: true, message: 'Column created' };
  } catch (error) {
    console.error('Error in addGeneralTreatmentColumnWithValidations:', error);
    throw error;
  } 
}
  
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function withSheetsRetry(fn, maxAttempts = 5) {
  let delay = 2000; // start with 2 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.code;
      const reason = err?.errors?.[0]?.reason;

      const isRetryableStatus =
        status === 429 ||                // rate limit
        status === 500 ||                // internal error
        status === 502 ||                // bad gateway
        status === 503 ||                // service unavailable
        status === 504;                  // timeout

      if (!isRetryableStatus) {
        throw err; // real error, don't hide it
      }

      if (attempt === maxAttempts) {
        console.error(`Sheets retry failed after ${maxAttempts} attempts`, err);
        throw err;
      }

      console.warn(
        `Sheets ${status} (${reason || 'retryable error'}), attempt ${attempt}/${maxAttempts}, waiting ${delay}ms`
      );
      await sleep(delay);
      delay *= 2; // exponential backoff
    }
  }
}


/*--------------------------------------------------
  Get animal photo from Photo sheet
---------------------------------------------------*/
export async function getAnimalPhoto(animalType, animalName) {
  try {
    await ensureConfigLoaded();
    console.log(`>> getAnimalPhoto for animal: ${animalName} of type: ${animalType}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      return null;
    }

    const doc = await getDoc(spreadsheetId);
    return await getAnimalImageFromDoc(doc);
  } catch (error) {
    console.error('Error getting animal photo:', error);
    return null;
  }
}

/*--------------------------------------------------
  Save animal photo to Photo sheet
---------------------------------------------------*/
export async function saveAnimalPhoto(animalType, animalName, photoBase64) {
  try {
    await ensureConfigLoaded();
    console.log(`>> saveAnimalPhoto for animal: ${animalName} of type: ${animalType}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      throw new Error('No spreadsheet found for animal');
    }

    const doc = await getDoc(spreadsheetId);
    
    // Find or create Photo sheet
    let photoSheet = doc.sheetsByTitle['Photo'];
    if (!photoSheet) {
      console.log('Creating new Photo sheet');
      photoSheet = await doc.addSheet({ 
        title: 'Photo',
        headerValues: ['Photo']
      });
    }

    // Load cells and save photo
    await photoSheet.loadCells('A1:A2');
    
    // Set header if not exists
    const headerCell = photoSheet.getCell(0, 0);
    if (!headerCell.value) {
      headerCell.value = 'Photo';
    }
    
    // Set photo data
    const photoCell = photoSheet.getCell(1, 0);
    photoCell.value = photoBase64;
    
    await photoSheet.saveUpdatedCells();
    console.log('Photo saved successfully');
    
    return { success: true };
  } catch (error) {
    console.error('Error in saveAnimalPhoto:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save daily event to DAILY_EVENTS sheet
  Headers: תאריך	אירועים
---------------------------------------------------*/
export async function saveDailyEvent(date, event) {
  try {
    console.log(`>> saveDailyEvent: date=${date}, event=${event}`);
    await ensureConfigLoaded();
    
    const dailyEventsSheetId = process.env.DAILY_EVENTS_ID;
    if (!dailyEventsSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(dailyEventsSheetId);
    
    // Find the "יומי" tab
    const dailySheet = doc.sheetsByTitle['יומי'];
    if (!dailySheet) {
      throw new Error('Sheet "יומי" not found in daily events document');
    }
    
    await dailySheet.loadHeaderRow();
    
    // Add a new row with the event
    await dailySheet.addRow({
      'תאריך': date || '',
      'אירועים': event || ''
    });
    
    console.log(`Daily event saved for ${date}`);
    return { success: true };
  } catch (error) {
    console.error('Error in saveDailyEvent:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Get daily events for a specific date
---------------------------------------------------*/
export async function getDailyEvents(date) {
  try {
    console.log(`>> getDailyEvents for date: ${date}`);
    await ensureConfigLoaded();
    
    const dailyEventsSheetId = process.env.DAILY_EVENTS_ID;
    if (!dailyEventsSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(dailyEventsSheetId);
    
    // Find the "יומי" tab
    const dailySheet = doc.sheetsByTitle['יומי'];
    if (!dailySheet) {
      throw new Error('Sheet "יומי" not found in daily events document');
    }
    
    await dailySheet.loadHeaderRow();
    const headers = dailySheet.headerValues;
    const headerMap = {};
    
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    
    const rows = await dailySheet.getRows();
    
    // Filter rows by date and return events
    const events = rows
      .filter(row => row._rawData?.[headerMap['תאריך']] === date)
      .map(row => row._rawData?.[headerMap['אירועים']] || '')
      .filter(event => event); // Remove empty events
    
    console.log(`Found ${events.length} events for ${date}`);
    return events;
  } catch (error) {
    console.error('Error in getDailyEvents:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Delete a daily event for a specific date
---------------------------------------------------*/
export async function deleteDailyEvent(date, event) {
  try {
    console.log(`>> deleteDailyEvent for date: ${date}, event: ${event}`);
    await ensureConfigLoaded();
    
    const dailyEventsSheetId = process.env.DAILY_EVENTS_ID;
    if (!dailyEventsSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(dailyEventsSheetId);
    
    // Find the "יומי" tab
    const dailySheet = doc.sheetsByTitle['יומי'];
    if (!dailySheet) {
      throw new Error('Sheet "יומי" not found in daily events document');
    }
    
    await dailySheet.loadHeaderRow();
    const headers = dailySheet.headerValues;
    const headerMap = {};
    
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    
    const rows = await dailySheet.getRows();
    
    // Find the row to delete (match both date and event)
    const rowToDelete = rows.find(row => 
      row._rawData?.[headerMap['תאריך']] === date && 
      row._rawData?.[headerMap['אירועים']] === event
    );
    
    if (rowToDelete) {
      await rowToDelete.delete();
      console.log(`Deleted event: ${event} for date: ${date}`);
      return { success: true };
    } else {
      console.log(`Event not found: ${event} for date: ${date}`);
      return { success: false, message: 'Event not found' };
    }
  } catch (error) {
    console.error('Error in deleteDailyEvent:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save caregiver note to their personal tab
---------------------------------------------------*/
export async function saveCaregiverNote(caregiverName, date, note) {
  try {
    console.log(`>> saveCaregiverNote for caregiver: ${caregiverName}, date: ${date}, note: ${note}`);
    await ensureConfigLoaded();
    
    const caregiverNotesSheetId = process.env.DAILY_EVENTS_ID;
    if (!caregiverNotesSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(caregiverNotesSheetId);
    
    // Find or create the caregiver's tab
    let caregiverSheet = doc.sheetsByTitle[caregiverName];
    if (!caregiverSheet) {
      // Create new sheet for this caregiver
      console.log(`Creating new sheet for caregiver: ${caregiverName}`);
      caregiverSheet = await doc.addSheet({ 
        title: caregiverName,
        headerValues: ['תאריך', 'אירועים']
      });
      console.log(`Created new sheet for caregiver: ${caregiverName}`);
      
      // Reload the document to get the new sheet
      await doc.loadInfo();
      caregiverSheet = doc.sheetsByTitle[caregiverName];
    }
    
    // Load header row (same as saveDailyEvent)
    await caregiverSheet.loadHeaderRow();
    
    // Add a new row with the note (same structure as saveDailyEvent)
    await caregiverSheet.addRow({
      'תאריך': date || '',
      'אירועים': note || ''
    });
    
    console.log(`Caregiver note saved for ${caregiverName} on ${date}`);
    return { success: true };
  } catch (error) {
    console.error('Error in saveCaregiverNote:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Get caregiver notes for a specific date
---------------------------------------------------*/
export async function getCaregiverNotes(caregiverName, date) {
  try {
    console.log(`>> getCaregiverNotes for caregiver: ${caregiverName}, date: ${date}`);
    await ensureConfigLoaded();
    
    const caregiverNotesSheetId = process.env.DAILY_EVENTS_ID;
    if (!caregiverNotesSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(caregiverNotesSheetId);
    
    // Find the caregiver's tab
    const caregiverSheet = doc.sheetsByTitle[caregiverName];
    if (!caregiverSheet) {
      console.log(`No sheet found for caregiver: ${caregiverName}`);
      return [];
    }
    
    await caregiverSheet.loadHeaderRow();
    const headers = caregiverSheet.headerValues;
    const headerMap = {};
    
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    
    const rows = await caregiverSheet.getRows();
    
    // Filter rows by date and return notes
    // Support both 'הערות' and 'אירועים' column names for backwards compatibility
    const notesColumnName = headerMap['הערות'] !== undefined ? 'הערות' : 'אירועים';
    const notes = rows
      .filter(row => row._rawData?.[headerMap['תאריך']] === date)
      .map(row => row._rawData?.[headerMap[notesColumnName]] || '')
      .filter(note => note); // Remove empty notes
    
    console.log(`Found ${notes.length} notes for ${caregiverName} on ${date}`);
    return notes;
  } catch (error) {
    console.error('Error in getCaregiverNotes:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Delete a caregiver note
---------------------------------------------------*/
export async function deleteCaregiverNote(caregiverName, date, note) {
  try {
    console.log(`>> deleteCaregiverNote for caregiver: ${caregiverName}, date: ${date}, note: ${note}`);
    await ensureConfigLoaded();
    
    const caregiverNotesSheetId = process.env.DAILY_EVENTS_ID;
    if (!caregiverNotesSheetId) {
      throw new Error('DAILY_EVENTS_ID not found in configuration sheet');
    }
    
    const doc = await getDoc(caregiverNotesSheetId);
    
    // Find the caregiver's tab
    const caregiverSheet = doc.sheetsByTitle[caregiverName];
    if (!caregiverSheet) {
      console.log(`No sheet found for caregiver: ${caregiverName}`);
      return { success: false, message: 'Caregiver sheet not found' };
    }
    
    await caregiverSheet.loadHeaderRow();
    const headers = caregiverSheet.headerValues;
    const headerMap = {};
    
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    
    const rows = await caregiverSheet.getRows();
    
    // Find the row to delete (match both date and note)
    // Support both 'הערות' and 'אירועים' column names for backwards compatibility
    const notesColumnName = headerMap['הערות'] !== undefined ? 'הערות' : 'אירועים';
    const rowToDelete = rows.find(row => 
      row._rawData?.[headerMap['תאריך']] === date && 
      row._rawData?.[headerMap[notesColumnName]] === note
    );
    
    if (rowToDelete) {
      await rowToDelete.delete();
      console.log(`Deleted note for ${caregiverName}: ${note} on ${date}`);
      return { success: true };
    } else {
      console.log(`Note not found for ${caregiverName}: ${note} on ${date}`);
      return { success: false, message: 'Note not found' };
    }
  } catch (error) {
    console.error('Error in deleteCaregiverNote:', error);
    throw error;
  }
}
