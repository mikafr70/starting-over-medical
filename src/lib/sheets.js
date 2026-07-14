// sheets.js - Utility functions for Google Sheets integration
// This runs on the Node.js runtime in Next.js API routes

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { google } from 'googleapis';
import { getUserOAuthClient } from './googleAuth';
import { start } from 'repl';

// Initialize configuration from sheet on module load
let configLoaded = false;
let configPromise = null;

// Throttle settings to avoid Google Sheets rate limits
// Increase default to 1000ms to reduce chance of hitting rate limits
const SHEET_READ_DELAY_MS = Number(process.env.SHEET_READ_DELAY_MS) || 1000; // default 1000ms between chunk reads

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*--------------------------------------------------
  CACHE MECHANISM
  Rules:
  1. Clear cache on user login
  2. Cache contains: sheetId, timestamp, sheetTab, content
  3. Cache valid for 5 minutes
  4. Check cache before API calls
  5. Invalidate cache on writes
  
  Note: In development, use global object to persist cache across hot reloads
---------------------------------------------------*/
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Use global object to persist cache across module reloads in development
if (!global.sheetCache) {
  global.sheetCache = new Map();
  console.log('🔧 Initialized new cache in global scope');
}
const sheetCache = global.sheetCache;

// Generate cache key from sheetId and optional tab/range
function getCacheKey(sheetId, tab = 'default', range = 'all') {
  return `${sheetId}:${tab}:${range}`;
}

// Get data from cache if valid
// Now accepts optional fileModifiedTime to check if file was modified since cache was set
function getFromCache(sheetId, tab = 'default', range = 'all', fileModifiedTime = null) {
  const key = getCacheKey(sheetId, tab, range);
  const cached = sheetCache.get(key);
  
  if (!cached) {
    console.log(`📦 Cache MISS: ${key} (cache size: ${sheetCache.size})`);
    return null;
  }
  
  // Check if cache is from a different day - if so, invalidate it
  const today = new Date().toDateString();
  if (cached.cachedDate && cached.cachedDate !== today) {
    console.log(`📦 Cache EXPIRED (new day): ${key} (cached on: ${cached.cachedDate}, today: ${today})`);
    sheetCache.delete(key);
    return null;
  }
  
  // If fileModifiedTime is provided, check if file was modified after cache was set
  if (fileModifiedTime) {
    const fileModTime = new Date(fileModifiedTime).getTime();
    if (fileModTime > cached.timestamp) {
      console.log(`📦 Cache EXPIRED (file modified): ${key} (file modified: ${fileModifiedTime}, cached: ${new Date(cached.timestamp).toISOString()})`);
      sheetCache.delete(key);
      return null;
    }
  }
  
  const age = Date.now() - cached.timestamp;
  console.log(`✅ Cache HIT: ${key} (age: ${Math.round(age/1000)}s, cached: ${cached.cachedDate})`);
  return cached.content;
}

// Store data in cache
function setInCache(sheetId, tab = 'default', range = 'all', content, fileModifiedTime = null) {
  const key = getCacheKey(sheetId, tab, range);
  const now = new Date();
  sheetCache.set(key, {
    sheetId,
    tab,
    range,
    content,
    timestamp: Date.now(),
    cachedDate: now.toDateString(), // Store the date when cached
    fileModifiedTime: fileModifiedTime // Store when the file was last modified
  });
  console.log(`💾 Cache SET: ${key}${fileModifiedTime ? ` (file modified: ${fileModifiedTime})` : ''}`);
}

// Invalidate specific cache entry
function invalidateCache(sheetId, tab = null) {
  if (tab) {
    // Invalidate specific tab
    const keysToDelete = [];
    for (const key of sheetCache.keys()) {
      if (key.startsWith(`${sheetId}:${tab}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => {
      sheetCache.delete(key);
      console.log(`🗑️ Cache INVALIDATED: ${key}`);
    });
  } else {
    // Invalidate all entries for this sheet
    const keysToDelete = [];
    for (const key of sheetCache.keys()) {
      if (key.startsWith(`${sheetId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => {
      sheetCache.delete(key);
      console.log(`🗑️ Cache INVALIDATED: ${key}`);
    });
  }
}

// Delete specific cache entry
function deleteFromCache(sheetId, tab = 'default', range = 'all') {
  const key = getCacheKey(sheetId, tab, range);
  const deleted = sheetCache.delete(key);
  if (deleted) {
    console.log(`🗑️ Cache DELETED: ${key}`);
  }
  return deleted;
}

// Clear entire cache (on user login)
export function clearAllCache() {
  const size = sheetCache.size;
  sheetCache.clear();
  console.log(`🧹 Cache CLEARED: ${size} entries removed`);
}

// Get cache statistics
export function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(sheetCache.entries()).map(([key, value]) => ({
    key,
    age: Math.round((now - value.timestamp) / 1000),
    expired: (now - value.timestamp) > CACHE_DURATION_MS
  }));
  return {
    totalEntries: sheetCache.size,
    entries
  };
}

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
  camel: {
    displayName: "גמל",
    emoji: "🐪",
    sheetId: process.env.CAMELS_SHEET_ID,
    folderId: process.env.CAMELS_DRIVE_FOLDER_ID,
  },
  mule: {
    displayName: "פרד",
    emoji: "🐴",
    sheetId: process.env.MULES_SHEET_ID,
    folderId: process.env.MULES_DRIVE_FOLDER_ID,
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
    // Check cache first
    const cached = getFromCache(spreadsheetId, 'doc-info', 'metadata');
    if (cached) {
      console.log(`✅ Cache HIT for getDoc - returning cached doc: ${cached.title}`);
      return cached;
    }
    
    console.log('>>> Loading document info...');
    ensureConfigLoaded()
    const auth = getSheetsAuth();
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    //await doc.useServiceAccountAuth(CREDENTIALS);    
    // temp temp temp temp temp temp temp temp temp
    await withSheetsRetry(() =>  doc.loadInfo());
    // temp temp temp temp temp temp temp temp temp
    console.log('<<< Document loaded:', doc.title);

    // Store in cache
    setInCache(spreadsheetId, 'doc-info', 'metadata', doc);

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

  // Normalize animal name for cache key (strip parentheses and trailing 15-digit IDs)
  const normalizedAnimalName = stripParentheses(animalName).replace(/\s+\d{15}$/, '').trim();
  // Check cache first
  const cacheKey = `${animalType}-${normalizedAnimalName}`;
  const cached = getFromCache(folderId, 'spreadsheet-lookup', cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Extract just the name part from animalName (e.g., "קשיו" from "קשיו 939000007563363")
    const nameOnly = stripParentheses(animalName).split(' ')[0];
    
    //console.log(`Searching for animal: "${animalName}", extracted name: "${nameOnly}"`);
    
    // Fetch all files with pagination
    let allFiles = [];
    let pageToken = null;
    
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'nextPageToken, files(id, name, modifiedTime)',
        spaces: 'drive',
        pageSize: 1000, // Max allowed by API
        pageToken: pageToken
      });
      
      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);   
      console.log(`Found ${allFiles.length} total files in folder`);
      console.log(`Searching for animal: "${animalName}" (nameOnly: "${nameOnly}")`);
      console.log(`First 10 file names:`, allFiles.slice(0, 10).map(f => f.name));
 
      // Filter to find exact match: filename format is "עותק של [name] [ID]"
      const exactMatch = allFiles.find(file => {
      const nameWithoutExtension = file.name.replace(/\..*$/, ''); // Remove extension
      // Remove "עותק של " prefix if present
      const nameWithoutPrefix = nameWithoutExtension.replace(/^עותק של /, '');
      // Clean the file name (remove parentheses and trailing numeric IDs)
      const fileNameClean = stripParentheses(nameWithoutPrefix).replace(/\s+\d{15}$/, '').trim();
      //console.log(`Comparing: fileNameClean:"${fileNameClean}" with normalizedAnimalName:"${normalizedAnimalName}" | Full: "${file.name}"`);
      const isMatch = fileNameClean === normalizedAnimalName;
      if (isMatch) {
        console.log(`  ✓ MATCH FOUND: "${file.name}"`);
      }
      return isMatch;
    });
    
    if (!exactMatch) {
      console.log(`No treatment sheet found for animal ${animalName}`);
      // Cache null result too to avoid repeated failed lookups
      setInCache(folderId, 'spreadsheet-lookup', cacheKey, null);
      return null;
    }

    console.log(`Found match: ${exactMatch.name}`);
    // Cache the result
    setInCache(folderId, 'spreadsheet-lookup', cacheKey, exactMatch.id);
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
    
    // Fetch all files with pagination
    let allFiles = [];
    let pageToken = null;
    const matchedFiles = [];
    
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'nextPageToken, files(id, name, modifiedTime)',
        spaces: 'drive',
        pageSize: 1000, // Max allowed by API
        pageToken: pageToken
      });
      
      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    console.log(`Found ${allFiles.length} total files in folder`);
    console.log(`Caregiver animals to match: ${caregiverAnimals.join(', ')}`);
    
    for (const animal of caregiverAnimals) {
      console.log(`\n🔍 Looking for file matching animal: "${animal}"`);
      
      for (const file of allFiles) {
        // Clean up the file name
        let cleanFileName = file.name
          .replace(/\.xlsx$/i, '')
          .replace(/\.xls$/i, '')
          .replace(/^עותק של\s+/i, '')
          .trim();
        
        // Remove parentheses and 15-digit numbers from the end
        cleanFileName = stripParentheses(cleanFileName).replace(/\s+\d{15}$/, '').trim();
        
        // Clean up the animal name (remove parentheses and numbers if present)
        const cleanAnimalName = stripParentheses(animal).replace(/\s+\d{15}$/, '').trim();
        
        let isMatch = cleanFileName === cleanAnimalName;
        
        console.log(`  Comparing file: "${cleanFileName}" with animal: "${cleanAnimalName}" => ${isMatch ? '✓ MATCH' : '✗ no match'}`);
        
        if (isMatch) {
          console.log(`  ✓✓ MATCH FOUND: "${file.name}" for caregiver animal: "${animal}"`);
          matchedFiles.push({ animalName: animal, sheetId: file.id });
          break; // Found a match, move to next animal
        }
      }   
    }
    
    console.log(`\nTotal matches found: ${matchedFiles.length}`);
    
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
    const normalizedAnimalName = stripParentheses(animalName).replace(/\s+\d{15}$/, '').trim();

    console.log(`[findSheetIdByName] Searching for: "${animalName}", normalized: "${normalizedAnimalName}"`);

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
      const fileNameClean = stripParentheses(nameWithoutPrefix).replace(/\s+\d{15}$/, '').trim();
      const isMatch = fileNameClean === normalizedAnimalName;
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
      
      const sheetId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey].sheetId;
      console.log('@@@Animals sheet ID:', sheetId);
      
      // Check cache first
      const cached = getFromCache(sheetId, 'animals', 'all');
      if (cached) {
        return cached;
      }
    
      const doc = await getDoc(sheetId);
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
    
    // Store in cache
    setInCache(sheetId, 'animals', 'all', animals);

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

    // Check cache first
    const cached = getFromCache(spreadsheetId, 'treatments', 'all');
    if (cached) {
      return cached;
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
    const treatmentsMap = rows.map((row, index) => ({
      rowIndex: index + 2, // sheet row number (1-based + header row)
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
      notes: row._rawData?.[headerMap['הערות']] || '',
      photo: row._rawData?.[14] || '' // column O — treatment photo (base64)
    }));

    // Store in cache
    setInCache(spreadsheetId, 'treatments', 'all', treatmentsMap);

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
    
    // Check cache first
    const cached = getFromCache(spreadsheetId, 'animals-from-sheet', 'all');
    if (cached) {
      return cached;
    }
    
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
    
    // Store in cache
    setInCache(spreadsheetId, 'animals-from-sheet', 'all', animals);
    
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
    
    // Check cache first
    const cacheKey = `${animalType}`;
    const cached = getFromCache(spreadsheetId, 'protocols', cacheKey);
    if (cached) {
      return cached;
    }
    
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
    
    // Store in cache (reuse cacheKey from line 836)
    setInCache(spreadsheetId, 'protocols', cacheKey, relevant_protocols);
    
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

    // Ensure column O has 'תמונה' header.
    // values.update does NOT auto-extend columns, so first expand the sheet to
    // at least 15 columns via appendDimension, then write the header.
    await sheet.loadHeaderRow();
    if (!sheet.headerValues.includes('תמונה')) {
      if (sheet.columnCount < 15) {
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              appendDimension: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                length: 15 - sheet.columnCount
              }
            }]
          }
        });
      }
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheet.title}!O1`,
        valueInputOption: 'RAW',
        resource: { values: [['תמונה']] }
      });
      console.log('>>> Added תמונה header to column O');
    }

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
      const photo = rowData.photo || '';

      return [date, day, morning, noon, evening, generalTreatment, personalTreatment, treatment, dosage, bodyPart, duration, location, caseField, notes, photo];
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:O${1 + rowsToAdd.length}`,
      valueInputOption: 'RAW',
      resource: { values }
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!A2:O${1 + rowsToAdd.length}`,
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

    // Invalidate cache for this sheet
    invalidateCache(spreadsheetId);

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

// Strip any parenthetical suffix from a name and trim
function stripParentheses(name) {
  if (!name) return '';
  return name.toString().split('(')[0].trim();
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
    invalidateCache(spreadsheetId);
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
    invalidateCache(spreadsheetId);
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
    invalidateCache(sheetId);
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
    
    invalidateCache(adoptionData.animalSheetId);
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
    
    invalidateCache(euthanasiaData.animalSheetId);
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
    
    // Create treatment sheet for the newborn animal (non-blocking — sheet creation
    // failure must not roll back the birth record that was already saved above)
    const treatmentSheetName = `עותק של ${birthData.animalName} ${birthData.chipId || ''}`;
    try {
      await createAnimalTreatmentSheet(animalTypeKey, treatmentSheetName);
      console.log(`Created treatment sheet for newborn: ${treatmentSheetName}`);
    } catch (sheetErr) {
      console.warn(`Warning: could not create treatment sheet for newborn: ${sheetErr.message}`);
    }
    
    invalidateCache(birthData.animalSheetId);
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
    
    // Create treatment sheet for the new arrival (non-blocking — sheet creation
    // failure must not roll back the arrival record that was already saved above)
    const treatmentSheetName = `${arrivalData.animalName} ${arrivalData.chipId || ''}`;
    try {
      await createAnimalTreatmentSheet(animalTypeKey, treatmentSheetName);
      console.log(`Created treatment sheet for arrival: ${treatmentSheetName}`);
    } catch (sheetErr) {
      console.warn(`Warning: could not create treatment sheet for arrival: ${sheetErr.message}`);
    }
    
    const spreadsheetId = trackingSheetId;
    invalidateCache(spreadsheetId);
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
    
    invalidateCache(deathData.animalSheetId);
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
    //console.log('------------------------------------------------------');
    //await addGeneralTreatmentColumnWithValidations();
    //return ''; // Temporarily disable caregiver name retrieval
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    if (!spreadsheetId) throw new Error('Could not find caregiver sheet' );
    
    // Check cache first
    const cacheKey = `email-${email}`;
    const cached = getFromCache(spreadsheetId, 'caregiver-name', cacheKey);
    if (cached !== null) {
      return cached;
    }
    
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
        // Store in cache (reuse cacheKey from line 1803)
        setInCache(spreadsheetId, 'caregiver-name', cacheKey, caregiverName);
        return caregiverName;
      }
    }
    // Store empty result in cache too (reuse cacheKey from line 1803)
    setInCache(spreadsheetId, 'caregiver-name', cacheKey, '');
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
    
    // Check cache first
    const cacheKey = `types-${caregiverName}`;
    const cached = getFromCache(spreadsheetId, 'caregiver-types', cacheKey);
    if (cached) {
      return cached;
    }
    
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
        const result = animalTypeKeys.length > 0 ? animalTypeKeys : Object.keys(ANIMAL_TREATMENT_SHEETS());
        // Store in cache (reuse cacheKey from earlier)
        setInCache(spreadsheetId, 'caregiver-types', cacheKey, result);
        return result;
      }
    }
    
    console.log(`<<< Caregiver ${caregiverName} not found, returning all types`);
    const result = Object.keys(ANIMAL_TREATMENT_SHEETS());
    // Store in cache (reuse cacheKey from earlier)
    setInCache(spreadsheetId, 'caregiver-types', cacheKey, result);
    return result;
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
    
    const spreadsheetId = process.env.CAREGIVERS_SHEET_ID;
    
    // Check cache first
    const cached = getFromCache(spreadsheetId, 'all-caregivers', 'list');
    if (cached) {
      return cached;
    }
    
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
    
    // Store in cache
    setInCache(spreadsheetId, 'all-caregivers', 'list', names);
    
    return names;
  } catch (error) {
    console.error('Error in getAllCaregivers:', error);
    throw error;
  }
}

/*--------------------------------------------------  
  Add new caregiver to caregivers sheet
---------------------------------------------------*/ 
export async function addCaregiver(caregiverData) {
  try {
    console.log('>>> addCaregiver:', caregiverData);
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
    
    if (caregiverColIndex === -1 || emailColIndex === -1 || passwordColIndex === -1) {
      throw new Error('Required headers not found in caregivers sheet');
    }
    
    // Check if email already exists
    const rows = await sheet.getRows();
    for (const row of rows) {
      const existingEmail = row._rawData?.[emailColIndex];
      if (existingEmail && existingEmail.trim().toLowerCase() === caregiverData.email.trim().toLowerCase()) {
        return { success: false, error: 'Email already exists' };
      }
    }
    
    // Add new row with caregiver data
    await sheet.addRow({
      'מטפל': caregiverData.name || '',
      'מייל': caregiverData.email || '',
      'סיסמה': caregiverData.password || ''
    });
    
    console.log(`Caregiver ${caregiverData.name} added successfully`);
    
    // Invalidate cache
    invalidateCache(spreadsheetId);
    
    return { success: true };
  } catch (error) {
    console.error('Error in addCaregiver:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Get animals and optionally general treatments for caregiver in ONE pass
---------------------------------------------------*/
export async function getAnimalsForCaregiverWithTreatementsToday(caregiverName, includeGeneralTreatments = true, onTreatmentFound = null) {
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
                  const personalTreatment = {
                    animalName: matchedFile.animalName,
                    animalType: sheets[animalType].displayName,
                    animalTypeKey: animalType,
                    treatment: treatmentTime.treatment || '',
                    medicalCase: treatmentTime.medicalCase,
                    dosage: treatmentTime.dosage || '',
                    date: todayStr,
                    image: animalImage || '',
                    isCompleted: treatmentTime.isCompleted
                  };
                  allPersonalTreatments.push(personalTreatment);
                  if (onTreatmentFound) {
                    try {
                      await onTreatmentFound(personalTreatment, false);
                    } catch (callbackError) {
                      console.error('Error in onTreatmentFound callback:', callbackError?.message || callbackError);
                    }
                  }
                }
                if(treatmentTime.isGeneral === true) {
                  const generalTreatment = {
                    animalName: matchedFile.animalName,
                    animalType: sheets[animalType].displayName,
                    animalTypeKey: animalType,
                    treatment: treatmentTime.treatment || '',
                    medicalCase: treatmentTime.medicalCase,
                    dosage: treatmentTime.dosage || '',
                    date: todayStr,
                    image: animalImage || '',
                    isCompleted: treatmentTime.isCompleted
                  };
                  allGeneralTreatments.push(generalTreatment);
                  if (onTreatmentFound) {
                    try {
                      await onTreatmentFound(generalTreatment, true);
                    } catch (callbackError) {
                      console.error('Error in onTreatmentFound callback:', callbackError?.message || callbackError);
                    }
                  }
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
  
  // Check cache first
  const cacheKey = `${todayStr}-${excludeCheckedGeneralTreatments}`;
  const cached = getFromCache(sheetId, 'has-treatment', cacheKey);
  if (cached) {
    console.log(`✅ Cache HIT for hasTreatmentToday - returning cached result`);
    return cached;
  }
  console.log(`📦 Cache MISS for hasTreatmentToday - fetching from API`);
  
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
  
  //console.log('Headers:', headers);
  //console.log('HeaderMap:', headerMap);
  
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
    let row2HadNoDate = false;
    outerLoop:
    for (let r = startRow; r <= endRow; r += chunkSize) {
      const rEnd = Math.min(endRow, r + chunkSize - 1);
      const range = `${sheetName}!${startA}${r}:${endA}${rEnd}`;

      const resp = await sheetAPI.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        majorDimension: "ROWS",
      });
      // throttle reads to avoid Google Sheets rate limits
      await sleep(SHEET_READ_DELAY_MS);
      for (let i = 0; i < (resp.data.values ? resp.data.values.length : 0); i++) {
        const rowValues = resp.data.values[i];
        const row = resp.data.values ? { _rawData: rowValues } : null;
        if (!row) continue;
        //console.log(`Fetched rows ${r} to ${rEnd}, got ${resp.data.values ? resp.data.values.length : 0} rows`);
        const values = resp.data.values ?? [];
        const stringDate = rowValues[0];
        const parsedRowDate = parseDMY(stringDate);
        const isRow2 = (r === startRow && i === 0);
        const isRow3 = (r === startRow && i === 1);
        const rowHasNoDate = (!stringDate || parsedRowDate === 0);

        // Row 2 alone isn't conclusive (it can be a stray duplicate header) - check
        // row 3 too. Only stop early if BOTH the first two rows lack a usable date,
        // meaning the sheet has no date-based data at all.
        if (isRow2 && rowHasNoDate) {
          row2HadNoDate = true;
          console.log('   ⚠️ Row 2 has no valid date, checking row 3 before giving up:', stringDate);
          continue;
        }
        if (isRow3 && row2HadNoDate && rowHasNoDate) {
          console.log('   ⏹️ Rows 2 and 3 both lack a valid date - stopping scan early:', stringDate);
          break outerLoop;
        }

        // Skip empty or invalid date strings first - don't let them stop the scan
        if (!stringDate) {
          // empty cell, skip
          continue;
        }
        if (parsedRowDate === 0) {
          console.log('   ⚠️ Skipping row with invalid/empty date:', stringDate);
          continue;
        }

        // If row date is older than target date, stop scanning (rows are descending by date)
        if (parsedRowDate < parsedTodayDate) {
          break outerLoop;
        }
        
        
        if(parsedRowDate === parsedTodayDate) {
          console.log(`✓ Found treatment for today: ${todayStr} in row date: ${stringDate}`);
          hasTreatment = true;
          //console.log('Row raw data:', row._rawData);
          
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

    const result = { hasTreatment, treatmentTimes, animalImage };
    
    // Store in cache (reuse cacheKey from earlier)
    setInCache(sheetId, 'has-treatment', cacheKey, result);
    console.log(`💾 Cache SET for hasTreatmentToday with key: ${cacheKey}`);
    
    return result;
  } catch (error) {
    console.error('Error in hasTreatmentToday:', error);
    return { hasTreatment: false, treatmentTimes: [] };
  }
}

/*--------------------------------------------------
  Check if sheet has treatments for multiple dates (optimized single-call version)
---------------------------------------------------*/
export async function hasTreatmentForDates(sheetId, dateStrings, excludeCheckedGeneralTreatments = false, fileModifiedTime = null) {
  console.log(`>>> hasTreatmentForDates for sheetID: ${sheetId} and dates: ${dateStrings.join(', ')}`);  
  await ensureConfigLoaded();
  
  // Check cache for each date, passing fileModifiedTime for validation
  const results = {};
  const uncachedDates = [];
  
  for (const dateStr of dateStrings) {
    const cacheKey = `${dateStr}-${excludeCheckedGeneralTreatments}`;
    const cached = getFromCache(sheetId, 'has-treatment', cacheKey, fileModifiedTime);
    if (cached) {
      console.log(`✅ Cache HIT for date ${dateStr}`);
      results[dateStr] = cached;
    } else {
      uncachedDates.push(dateStr);
    }
  }
  
  // If all dates are cached, return immediately
  if (uncachedDates.length === 0) {
    console.log(`✅ All dates found in cache`);
    return results;
  }
  
  console.log(`📦 Cache MISS for dates: ${uncachedDates.join(', ')} - fetching from API`);
  
  if (!sheetId) throw new Error('sheetId is required');
  
  try {
    const doc = await getDoc(sheetId);
    const sheet = doc.sheetsByIndex[0];
    const sheetName = sheet.title;
    const animalImage = await getAnimalImageFromDoc(doc);
    
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const headerMap = {};
    if (headers) {
      headers.forEach((header, index) => {
        if (header) headerMap[header.trim()] = index;
      });
    }
    
    const morningCol = headerMap['בוקר'] !== undefined ? headerMap['בוקר'] : 2;
    const noonCol = headerMap['צהריים'] !== undefined ? headerMap['צהריים'] : 3;
    const eveningCol = headerMap['ערב'] !== undefined ? headerMap['ערב'] : 4;
    const generalTreatmentCol = headerMap['טיפול כללי'] !== undefined ? headerMap['טיפול כללי'] : 5;
    const personalTreatmentCol = headerMap['טיפול אישי'] !== undefined ? headerMap['טיפול אישי'] : 6;
    const treatmentCol = headerMap['טיפול'] !== undefined ? headerMap['טיפול'] : 7;
    const dosageCol = headerMap['מינון'] !== undefined ? headerMap['מינון'] : 8;
    const caseCol = headerMap['סיבת טיפול'] !== undefined ? headerMap['סיבת טיפול'] : 11;
    
    // Parse all uncached dates
    const datesToFind = {};
    for (const dateStr of uncachedDates) {
      datesToFind[parseDMY(dateStr)] = {
        dateStr,
        hasTreatment: false,
        treatmentTimes: []
      };
    }
    
    const auth = getSheetsAuth();
    const sheetAPI = google.sheets({ version: 'v4', auth });
    const startCol = 1;
    const endCol = headers.length;
    const startRow = 2;
    const endRow = sheet.rowCount;
    const chunkSize = 20;
    const startA = colToA1(startCol);
    const endA = colToA1(endCol);
    let row2HadNoDate = false;

    // Single pass through the sheet to find all dates
    const minDate = Math.min(...Object.keys(datesToFind).map(Number));

    console.log(`   Scanning sheet for dates. Looking for parsed dates:`, Object.keys(datesToFind));
    console.log(`   minDate: ${minDate}, startRow: ${startRow}, endRow: ${endRow}, chunkSize: ${chunkSize}`);

    outerLoop:
    for (let r = startRow; r <= endRow; r += chunkSize) {
      const rEnd = Math.min(endRow, r + chunkSize - 1);
      const range = `${sheetName}!${startA}${r}:${endA}${rEnd}`;

      console.log(`   Fetching range: ${range}`);

      const resp = await sheetAPI.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        majorDimension: "ROWS",
      });

      // throttle reads to avoid Google Sheets rate limits
      await sleep(SHEET_READ_DELAY_MS);

      console.log(`   Got ${resp.data.values ? resp.data.values.length : 0} rows`);

      for (let i = 0; i < (resp.data.values ? resp.data.values.length : 0); i++) {
        const rowValues = resp.data.values[i];
        if (!rowValues) continue;

        const stringDate = rowValues[0];
        const parsedRowDate = parseDMY(stringDate);
        const isRow2 = (r === startRow && i === 0);
        const isRow3 = (r === startRow && i === 1);
        const rowHasNoDate = (parsedRowDate === 0);

        console.log(`   Row ${r + i}: date="${stringDate}", parsed=${parsedRowDate}, minDate=${minDate}`);

        // Row 2 alone isn't conclusive (it can be a stray duplicate header) - check
        // row 3 too. Only stop early if BOTH the first two rows lack a usable date,
        // meaning the sheet has no date-based data at all.
        if (isRow2 && rowHasNoDate) {
          row2HadNoDate = true;
          console.log(`   ⚠️ Row 2 has no valid date, checking row 3 before giving up`);
          continue;
        }
        if (isRow3 && row2HadNoDate && rowHasNoDate) {
          console.log(`   ⏹️ Rows 2 and 3 both lack a valid date - stopping scan early`);
          break outerLoop;
        }

        // Skip empty/invalid dates (parsed=0), don't break on them
        if (parsedRowDate === 0) {
          console.log(`   ⚠️ Skipping row with invalid/empty date`);
          continue;
        }
        
        if (parsedRowDate < minDate) {
          console.log(`   ⏹️ Date ${parsedRowDate} < minDate ${minDate}, stopping scan`);
          break outerLoop;
        }
        
        if (datesToFind[parsedRowDate]) {
          const dateInfo = datesToFind[parsedRowDate];
          console.log(`✓ Found treatment for ${dateInfo.dateStr} in row date: ${stringDate}`);
          console.log(`   Row values: morning[${morningCol}]=${rowValues[morningCol]}, noon[${noonCol}]=${rowValues[noonCol]}, evening[${eveningCol}]=${rowValues[eveningCol]}, general[${generalTreatmentCol}]=${rowValues[generalTreatmentCol]}, personal[${personalTreatmentCol}]=${rowValues[personalTreatmentCol]}`);
          dateInfo.hasTreatment = true;
          
          const morningValue = rowValues[morningCol];
          const noonValue = rowValues[noonCol];
          const eveningValue = rowValues[eveningCol];
          const generalTreatmentValue = rowValues[generalTreatmentCol];
          const personalTreatmentValue = rowValues[personalTreatmentCol];
          const medicalCase = rowValues[caseCol] || '';
          const treatment = rowValues[treatmentCol] || '';
          const dosage = rowValues[dosageCol] || '';
          
          const isGeneralTreatmentChecked = (generalTreatmentValue === true || generalTreatmentValue === 'TRUE');
          
          if (isGeneralTreatmentChecked && excludeCheckedGeneralTreatments) {
            console.log(`   ⏭️ Skipping row - general treatment is checked and excludeCheckedGeneralTreatments=true`);
            continue;
          }
          
          const hasPersonalOrGeneralCheckbox = (personalTreatmentValue === true || personalTreatmentValue === 'TRUE' || 
            personalTreatmentValue === false || personalTreatmentValue === 'FALSE' ||
            generalTreatmentValue === true || generalTreatmentValue === 'TRUE' ||
            generalTreatmentValue === false || generalTreatmentValue === 'FALSE');
            
          console.log(`   🔍 Treatment type: hasPersonalOrGeneralCheckbox=${hasPersonalOrGeneralCheckbox}`);
            
          if (hasPersonalOrGeneralCheckbox) {
            const isPersonalTreatmentChecked = (personalTreatmentValue === true || personalTreatmentValue === 'TRUE');
            const isPersonalTreatmentUnchecked = (personalTreatmentValue === false || personalTreatmentValue === 'FALSE');
            const isGeneralUnchecked = (generalTreatmentValue === false || generalTreatmentValue === 'FALSE');
            
            if (isPersonalTreatmentChecked) {
              console.log(`   ➕ Adding PERSONAL treatment (checked): ${treatment || medicalCase}`);
              dateInfo.treatmentTimes.push({ timeSlot: 'personal', medicalCase, treatment, dosage, isGeneral: false, isCompleted: true, isPersonal: true });
            } else if (isPersonalTreatmentUnchecked) {
              console.log(`   ➕ Adding PERSONAL treatment (unchecked): ${treatment || medicalCase}`);
              dateInfo.treatmentTimes.push({ timeSlot: 'personal', medicalCase, treatment, dosage, isGeneral: false, isCompleted: false, isPersonal: true });
            } else if (isGeneralTreatmentChecked) {
              console.log(`   ➕ Adding GENERAL treatment (checked): ${treatment || medicalCase}`);
              dateInfo.treatmentTimes.push({ timeSlot: 'general', medicalCase, treatment, dosage, isGeneral: true, isCompleted: true, isPersonal: false });
            } else if (isGeneralUnchecked) {
              console.log(`   ➕ Adding GENERAL treatment (unchecked): ${treatment || medicalCase}`);
              dateInfo.treatmentTimes.push({ timeSlot: 'general', medicalCase, treatment, dosage, isGeneral: true, isCompleted: false, isPersonal: false });
            }
          } else {
            const hasTimeSlots = (morningValue === false || morningValue === 'FALSE' || morningValue === true || morningValue === 'TRUE') ||
                                (noonValue === false || noonValue === 'FALSE' || noonValue === true || noonValue === 'TRUE') ||
                                (eveningValue === false || eveningValue === 'FALSE' || eveningValue === true || eveningValue === 'TRUE');
            
            if (hasTimeSlots) {
              if(morningValue === false || morningValue === 'FALSE' || morningValue === true || morningValue === 'TRUE') {
                console.log(`   ➕ Adding MORNING time slot (completed: ${morningValue === true || morningValue === 'TRUE'}): ${treatment || medicalCase}`);
                dateInfo.treatmentTimes.push({ timeSlot: 'morning', medicalCase, treatment, dosage, isCompleted: morningValue === true || morningValue === 'TRUE', isGeneral: false, isPersonal: false });
              }
              if(noonValue === false || noonValue === 'FALSE' || noonValue === true || noonValue === 'TRUE') {
                console.log(`   ➕ Adding NOON time slot (completed: ${noonValue === true || noonValue === 'TRUE'}): ${treatment || medicalCase}`);
                dateInfo.treatmentTimes.push({ timeSlot: 'noon', medicalCase, treatment, dosage, isCompleted: noonValue === true || noonValue === 'TRUE', isGeneral: false, isPersonal: false });
              }
              if(eveningValue === false || eveningValue === 'FALSE' || eveningValue === true || eveningValue === 'TRUE') {
                console.log(`   ➕ Adding EVENING time slot (completed: ${eveningValue === true || eveningValue === 'TRUE'}): ${treatment || medicalCase}`);
                dateInfo.treatmentTimes.push({ timeSlot: 'evening', medicalCase, treatment, dosage, isCompleted: eveningValue === true || eveningValue === 'TRUE', isGeneral: false, isPersonal: false });
              }
            } else {
              console.log(`   ⚠️ No valid time slots found in this row`);
            }
          }
        }
      }
    }
    
    // Store results in cache and merge with cached results
    for (const [parsedDate, dateInfo] of Object.entries(datesToFind)) {
      const result = { hasTreatment: dateInfo.hasTreatment, treatmentTimes: dateInfo.treatmentTimes, animalImage };
      const cacheKey = `${dateInfo.dateStr}-${excludeCheckedGeneralTreatments}`;
      setInCache(sheetId, 'has-treatment', cacheKey, result, fileModifiedTime);
      console.log(`💾 Cache SET for date ${dateInfo.dateStr}`);
      results[dateInfo.dateStr] = result;
    }
    
    return results;
  } catch (error) {
    console.error('Error in hasTreatmentForDates:', error);
    // Return empty results for uncached dates
    for (const dateStr of uncachedDates) {
      results[dateStr] = { hasTreatment: false, treatmentTimes: [] };
    }
    return results;
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
    
    invalidateCache(spreadsheetId);
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
    
    invalidateCache(spreadsheetId);
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
    
    invalidateCache(spreadsheetId);
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
    
    invalidateCache(spreadsheetId);
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

    const animalTypeKey = await getAnimalTypeKey(animalType);
    const spreadsheetId = ANIMAL_TREATMENT_SHEETS()[animalTypeKey]?.sheetId;
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
    const sheetId = spreadsheetId;
    invalidateCache(sheetId);
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
    const animalNameOnly = stripParentheses(oldAnimalName).split(' ')[0];
    
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
    invalidateCache(spreadsheetId);
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
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);// - 14); !!!!!!!!!!!!!!!!!!!!!!!!!!
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

/*-----------------------------------------------
  Optimized version: Get files with treatments for multiple dates in one call
  ----------------------------------------------*/
export async function getRecentlyEditedFilesWithTreatmentsForDates(folderId, targetDates = [], onFileChecked = null) {
  try {
    await ensureConfigLoaded();
    console.log(`>>> getRecentlyEditedFilesWithTreatmentsForDates for ${targetDates.length} dates...`);
    if (!folderId) throw new Error('folderId is required');
    if (targetDates.length === 0) throw new Error('targetDates array is required');
    
    const drive = getDriveClient();
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 1); // Look back 1 day to catch all recent files
    lookbackDate.setHours(0, 0, 0, 0);
    const startDateISO = lookbackDate.toISOString();
    
    console.log(`   📅 Looking for files modified since: ${lookbackDate.toISOString()} (1 day ago)`);
    console.log(`   📁 Searching in folder: ${folderId}`);
    
    // Convert Date objects to strings
    const dateStrings = targetDates.map(date => 
      `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
    );
    
    console.log(`   🎯 Target dates to check: ${dateStrings.join(', ')}`);
    
    // List files modified in the last 3 days - WITH PAGINATION
    let allFiles = [];
    let pageToken = null;
    let pageCount = 0;
    
    console.log(`   🔍 Starting file search with pagination...`);
    
    do {
      pageCount++;
      console.log(`   📄 Fetching page ${pageCount}${pageToken ? ` (token: ${pageToken.substring(0, 20)}...)` : ' (first page)'}...`);
      
      const response = await drive.files.list({
        q: `'${folderId}' in parents and modifiedTime >= '${startDateISO}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        // Include parents so we can verify file belongs to the folder (extra safety)
        fields: 'nextPageToken, files(id, name, modifiedTime, parents)',
        spaces: 'drive',
        pageSize: 1000, // Maximum allowed by Google Drive API
        pageToken: pageToken
      });
      
      const filesInPage = response.data.files || [];
      allFiles = allFiles.concat(filesInPage);
      pageToken = response.data.nextPageToken;
      
      console.log(`   ✅ Page ${pageCount}: Got ${filesInPage.length} files. Total so far: ${allFiles.length}. More pages: ${pageToken ? 'YES' : 'NO'}`);
    } while (pageToken);
    
    console.log(`\n📊 FINAL RESULT: Found ${allFiles.length} total files across ${pageCount} page(s)`);
    console.log(`📝 File names (${allFiles.length} total): ${allFiles.map(f => f.name).join(', ')}`);
    
    // Object to store results: { dateStr: [fileName1, treatmentTimes1, ...] }
    const resultsByDate = {};
    dateStrings.forEach(dateStr => resultsByDate[dateStr] = []);
    
    // Check all dates for each file in a single call
    for (const file of allFiles) {
      // Verify this file actually belongs to the folder we searched
      const parents = file.parents || [];
      if (!parents.includes(folderId)) {
        console.warn(`   ⚠️ Skipping file not in expected folder: ${file.name} (${file.id}) - parents: ${parents.join(', ')}`);
        continue;
      }

      console.log(`   Checking file: ${file.name} (${file.id})`);
      console.log(`   ℹ️ File modified at ${file.modifiedTime}`);

      const dateResults = await hasTreatmentForDates(file.id, dateStrings, false, file.modifiedTime);
      console.log(`   Results for ${file.name}:`, Object.entries(dateResults).map(([date, res]) => `${date}: ${res.hasTreatment} (${res.treatmentTimes?.length || 0} slots)`).join(', '));
      
      // Detailed logging for files with treatments
      for (const [dateStr, { hasTreatment, treatmentTimes }] of Object.entries(dateResults)) {
        if (hasTreatment && treatmentTimes && treatmentTimes.length > 0) {
          console.log(`   ✅ ${file.name} has ${treatmentTimes.length} treatment(s) for ${dateStr}:`);
          treatmentTimes.forEach((t, idx) => {
            console.log(`      ${idx + 1}. Slot: ${t.timeSlot}, Treatment: ${t.treatment || t.medicalCase || 'N/A'}, Completed: ${t.isCompleted}`);
          });
        }
      }
      
      // Process results for each date
      for (const [dateStr, { hasTreatment, treatmentTimes }] of Object.entries(dateResults)) {
        if (hasTreatment) {
          resultsByDate[dateStr].push(file.name, treatmentTimes);
        }
      }

      // Let the caller stream this file's results immediately instead of
      // waiting for every file in the folder to be checked.
      if (onFileChecked) {
        try {
          await onFileChecked(file.name, dateResults);
        } catch (callbackError) {
          console.error('Error in onFileChecked callback:', callbackError?.message || callbackError);
        }
      }
    }

    return resultsByDate;
  } catch (error) {
    console.error('Error in getRecentlyEditedFilesWithTreatmentsForDates:', error);
    return {};
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
    invalidateCache(spreadsheetId);
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

    // Create the spreadsheet using Drive API (must use user OAuth so the file
    // is owned by the human user and counts against their quota, not the
    // service account's 15 GB free quota which can be exhausted).
    const createResponse = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
      },
      supportsAllDrives: true,
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

    // Add headers to the new sheet
    const headers = ['תאריך', 'יום', 'בוקר', 'צהריים', 'ערב', 'טיפול כללי','טיפול אישי', 'טיפול', 'מינון', 'מתן', 'משך', 'מתחם', 'סיבת טיפול', 'הערות'];

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: newSpreadsheetId,
      range: `${firstSheetName}!A1:N1`,
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
    const sheetId = spreadsheetId;
    invalidateCache(sheetId);
    return { success: true };
  } catch (error) {
    console.error('Error in setCaregiverForAnimal:', error);
    throw error;
  } 
}

//--------------------------------------------------
//  Add general treatment coulmn and personal treatment coulmn after evening coulmn without validations
//---------------------------------------------------
let __addGeneralTreatmentColumnsInFlight = false;
const __processedGeneralTreatmentColumnSheets = new Set();

export async function addGeneralTreatmentColumnWithValidations() {
  try {
    if (__addGeneralTreatmentColumnsInFlight) {
      console.log('addGeneralTreatmentColumnWithValidations is already running - skipping duplicate invocation');
      return { success: true, skipped: true, reason: 'already-running' };
    }

    __addGeneralTreatmentColumnsInFlight = true;
    await ensureConfigLoaded();

    const processedThisRun = new Set();

    for (const animalType of Object.keys(ANIMAL_TREATMENT_SHEETS())) {
      const folderId = ANIMAL_TREATMENT_SHEETS()[animalType].folderId;
      if (!folderId) {
        continue;
      }
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
          if (!file?.id) {
            continue;
          }

          if (processedThisRun.has(file.id) || __processedGeneralTreatmentColumnSheets.has(file.id)) {
            console.log(`Skipping duplicate sheet in this run: ${file.name} (${file.id})`);
            continue;
          }

          processedThisRun.add(file.id);
          __processedGeneralTreatmentColumnSheets.add(file.id);

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
  } finally {
    __addGeneralTreatmentColumnsInFlight = false;
  }
}
/*-------------------------------------------------- 
  Add general treatment coulmn and personal treatment coulmn after evening coulmn without validations to specific sheet
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
    // throttle reads to avoid Google Sheets rate limits
    await sleep(SHEET_READ_DELAY_MS);
    
    const headers = headerResponse.data.values?.[0] || [];
    const generalTreatmentIndices = [];
    const personalTreatmentIndices = [];
    
    headers.forEach((header, index) => {
      if (header && header.trim() === 'טיפול כללי') {
        generalTreatmentIndices.push(index);
      }
      if (header && header.trim() === 'טיפול אישי') {
        personalTreatmentIndices.push(index);
      }
    });
    
    console.log(`Found ${generalTreatmentIndices.length} "טיפול כללי" columns at indices:`, generalTreatmentIndices);
    console.log(`Found ${personalTreatmentIndices.length} "טיפול אישי" columns at indices:`, personalTreatmentIndices); 

    // If multiple columns exist, delete all except the first one
    if (generalTreatmentIndices.length > 1) {
      console.log(`Deleting ${generalTreatmentIndices.length - 1} duplicate "טיפול כללי" columns`);
      
      // Delete columns one at a time, re-fetching headers after each deletion
      // to recalculate indices and prevent stale index issues
      let deletedCount = 0;
      
      while (true) {
        // Re-fetch headers to get current state
        const currentHeaderResponse = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!1:1`
        });
        // throttle reads to avoid Google Sheets rate limits
        await sleep(SHEET_READ_DELAY_MS);
        
        const currentHeaders = currentHeaderResponse.data.values?.[0] || [];
        const currentGeneralIndices = [];
        
        currentHeaders.forEach((header, index) => {
          if (header && header.trim() === 'טיפול כללי') {
            currentGeneralIndices.push(index);
          }
        });
        
        if (currentGeneralIndices.length <= 1) {
          console.log('Only one or zero "טיפול כללי" columns remain, stopping deletion');
          break;
        }
        
        // Delete the LAST occurrence (highest index)
        const colIndexToDelete = currentGeneralIndices[currentGeneralIndices.length - 1];
        console.log(`Deleting duplicate "טיפול כללי" column at index: ${colIndexToDelete} (${currentGeneralIndices.length} total found)`);
        
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: colIndexToDelete,
                  endIndex: colIndexToDelete + 1
                }
              }
            }]
          }
        });
        
        deletedCount++;
        console.log(`Deleted duplicate column ${deletedCount}`);
        
        // Small delay to ensure API state is consistent (increased to 1000ms)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`Deleted ${deletedCount} duplicate general treatment columns`);
    }
    // If multiple personal treatment columns exist, delete all except the first one
    if (personalTreatmentIndices.length > 1) {
      console.log(`Deleting ${personalTreatmentIndices.length - 1} duplicate "טיפול אישי" columns`);
      
      // Delete columns one at a time, re-fetching headers after each deletion
      // to recalculate indices and prevent stale index issues
      let deletedCount = 0;
      
      while (true) {
        // Re-fetch headers to get current state
        const currentHeaderResponse = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheet.title}!1:1`
        });
        // throttle reads to avoid Google Sheets rate limits
        await sleep(SHEET_READ_DELAY_MS);
        
        const currentHeaders = currentHeaderResponse.data.values?.[0] || [];
        const currentPersonalIndices = [];
        
        currentHeaders.forEach((header, index) => {
          if (header && header.trim() === 'טיפול אישי') {
            currentPersonalIndices.push(index);
          }
        });
        
        if (currentPersonalIndices.length <= 1) {
          console.log('Only one or zero "טיפול אישי" columns remain, stopping deletion');
          break;
        }
        
        // Delete the LAST occurrence (highest index)
        const colIndexToDelete = currentPersonalIndices[currentPersonalIndices.length - 1];
        console.log(`Deleting duplicate "טיפול אישי" column at index: ${colIndexToDelete} (${currentPersonalIndices.length} total found)`);
        
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: colIndexToDelete,
                  endIndex: colIndexToDelete + 1
                }
              }
            }]
          }
        });
        
        deletedCount++;
        console.log(`Deleted duplicate column ${deletedCount}`);
        
        // Small delay to ensure API state is consistent (increased to 1000ms)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`Deleted ${deletedCount} duplicate personal treatment columns`);
    }
    
    // If exactly one column exists, we're done
    if (generalTreatmentIndices.length === 1 && personalTreatmentIndices.length === 1) {
      console.log('General treatment column already exists at index:', generalTreatmentIndices[0], 'and personal treatment column at index:', personalTreatmentIndices[0]);
      return { success: true, message: 'Columns already exist' };
    }

    
    // No columns exists, add it
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
    
    // 3) Insert another new column after the general treatment column
    await withSheetsRetry(() => sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,  
      resource: {
        requests: [
          { 
            insertDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 6,
                endIndex: 7
              },
              inheritFromBefore: true
            }
          }
        ]
      }
    }));
    console.log('Inserted new column after general treatment column');
    // 4) Set header for personal treatment column
    await withSheetsRetry(() => sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!G1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['טיפול אישי']]  
      }
    }));
    console.log('Set header for new personal treatment column'); 
    console.log('Successfully added general and personal treatment columns to sheet ID:', spreadsheetId);
    return { success: true };
  } catch (error) {
    console.error('Error in addGeneralTreatmentColumnWithValidations:', error);
    throw error;
  } 
}
  
// `sleep` helper is defined earlier in this file; reuse that definition.

async function withSheetsRetry(fn, maxAttempts = 5) {
  // Start with a larger initial delay to be more conservative with Google APIs
  let delay = 5000; // start with 5 seconds

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
    
    // Check cache first
    const cacheKey = `${animalType}-${animalName}`;
    const cached = getFromCache('animal-photos', 'photo', cacheKey);
    if (cached !== null) {
      console.log(`✅ Cache HIT for animal photo: ${animalName}`);
      return cached;
    }
    
    console.log(`>> getAnimalPhoto for animal: ${animalName} of type: ${animalType}`);
    
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) {
      // Cache null result
      setInCache('animal-photos', 'photo', cacheKey, null);
      return null;
    }

    const doc = await getDoc(spreadsheetId);
    const photo = await getAnimalImageFromDoc(doc);
    
    // Store in cache
    setInCache('animal-photos', 'photo', cacheKey, photo);
    console.log(`💾 Cache SET for animal photo: ${animalName}`);
    
    return photo;
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

    invalidateCache(spreadsheetId);
    // Also evict the photo-specific cache entry so the next read returns the new photo
    deleteFromCache('animal-photos', 'photo', `${animalType}-${animalName}`);
    return { success: true };
  } catch (error) {
    console.error('Error in saveAnimalPhoto:', error);
    throw error;
  }
}

/*--------------------------------------------------
  Save / get photo for a specific treatment row (column O)
---------------------------------------------------*/
export async function saveTreatmentPhoto(animalType, animalName, rowIndex, photoBase64) {
  try {
    await ensureConfigLoaded();
    console.log(`>> saveTreatmentPhoto for ${animalName} (${animalType}), row ${rowIndex}`);
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) throw new Error('No spreadsheet found for animal');

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.title}!O${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[photoBase64]] }
    });

    invalidateCache(spreadsheetId);
    return { success: true };
  } catch (error) {
    console.error('Error in saveTreatmentPhoto:', error);
    throw error;
  }
}

export async function getTreatmentPhotoFromRow(animalType, animalName, rowIndex) {
  try {
    await ensureConfigLoaded();
    const spreadsheetId = await findSpreadsheetInFolder(animalType, animalName);
    if (!spreadsheetId) return null;

    const doc = await getDoc(spreadsheetId);
    const sheet = doc.sheetsByIndex[0];
    const auth = getSheetsAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });

    const resp = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheet.title}!O${rowIndex}`,
    });
    return resp.data.values?.[0]?.[0] || null;
  } catch (error) {
    console.error('Error in getTreatmentPhotoFromRow:', error);
    return null;
  }
}

/*--------------------------------------------------
  Save daily event to DAILY_EVENTS sheet
  Headers: תאריך	אירועים
---------------------------------------------------*/
export async function saveDailyEvent(date, event, type = '') {
  try {
    console.log(`>> saveDailyEvent: date=${date}, event=${event}, type=${type}`);
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

    // Auto-migrate the sheet to add a "type" column if it doesn't exist yet
    if (!dailySheet.headerValues.includes('type')) {
      await dailySheet.setHeaderRow([...dailySheet.headerValues, 'type']);
    }

    // Add a new row with the event
    await dailySheet.addRow({
      'תאריך': date || '',
      'אירועים': event || '',
      'type': type || ''
    });

    console.log(`Daily event saved for ${date}`);
    invalidateCache(dailyEventsSheetId);
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
    
    // Check cache first
    const cacheKey = `date-${date}`;
    const cached = getFromCache(dailyEventsSheetId, 'daily-events', cacheKey);
    if (cached) {
      return cached;
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

    // Filter rows by date and return events with their tag (type)
    const events = rows
      .filter(row => row._rawData?.[headerMap['תאריך']] === date)
      .map(row => ({
        text: row._rawData?.[headerMap['אירועים']] || '',
        type: row._rawData?.[headerMap['type']] || ''
      }))
      .filter(event => event.text); // Remove empty events

    console.log(`Found ${events.length} events for ${date}`);
    
    // Store in cache
    setInCache(dailyEventsSheetId, 'daily-events', cacheKey, events);
    
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
      invalidateCache(dailyEventsSheetId);
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
    invalidateCache(caregiverNotesSheetId);
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
    
    // Check cache first
    const cacheKey = `${caregiverName}-${date}`;
    const cached = getFromCache(caregiverNotesSheetId, 'caregiver-notes', cacheKey);
    if (cached) {
      return cached;
    }
    
    const doc = await getDoc(caregiverNotesSheetId);
    
    // Find the caregiver's tab
    const caregiverSheet = doc.sheetsByTitle[caregiverName];
    if (!caregiverSheet) {
      console.log(`No sheet found for caregiver: ${caregiverName}`);
      // Cache empty result
      setInCache(caregiverNotesSheetId, 'caregiver-notes', cacheKey, []);
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
    
    // Store in cache
    setInCache(caregiverNotesSheetId, 'caregiver-notes', cacheKey, notes);
    
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
      invalidateCache(caregiverNotesSheetId);
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
