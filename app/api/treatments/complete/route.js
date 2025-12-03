// app/api/treatments/complete/route.js
// API endpoint to mark a treatment as complete/incomplete in Google Sheets

import { ensureConfigLoaded, findSheetIdByName, ANIMAL_TREATMENT_SHEETS } from '../../../../src/lib/sheets.js';
import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Helper to get credentials
function getCredentials() {
  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY
      ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
      : ''
  };
}

// Helper to get JWT auth
function getSheetsAuth() {
  const email = getCredentials().client_email;
  const key = getCredentials().private_key;
  
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY env vars');
  }
  
  return new google.auth.JWT(
    email,
    null,
    key,
    [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  );
}

// Helper function to parse date in DD/MM/YYYY format
function parseDMY(str) {
  if (!str) return 0;
  if (str.includes('T')) {
    str = str.split('T')[0];
  }
  const parts_slash = str.toString().split('/');
  const parts_dash = str.toString().split('-');
  if (parts_slash.length === 3) {
    const [day, month, year] = parts_slash.map(Number);  
    return (year * 10000) + (month * 100) + day;
  }
  if (parts_dash.length === 3) {
    const [year, month, day] = parts_dash.map(Number);  
    return (year * 10000) + (month * 100) + day;
  }
  console.log('Date string not in expected format:', str);
  return 0;
}

export async function POST(request) {
  try {
    await ensureConfigLoaded();
    
    const body = await request.json();
    const { animalName, animalType, medicalCase, timeSlot, isCompleted } = body;
    
    console.log('>>> Marking treatment as', isCompleted ? 'complete' : 'incomplete');
    console.log('Animal:', animalName, 'Type:', animalType, 'Case:', medicalCase, 'TimeSlot:', timeSlot);
    
    if (!animalName || !animalType || !timeSlot) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters' 
      }), { 
        status: 400, 
        headers: CORS_HEADERS 
      });
    }
    
    // Find the animal type key
    const sheets = ANIMAL_TREATMENT_SHEETS();
    let animalTypeKey = animalType;
    
    // Check if we need to convert from displayName to key
    if (!sheets[animalType]) {
      const entry = Object.entries(sheets).find(([key, value]) => value.displayName === animalType);
      if (entry) {
        animalTypeKey = entry[0];
      }
    }
    
    const folderId = sheets[animalTypeKey].folderId;
    if (!folderId) {
      throw new Error('No folder ID found for animal type: ' + animalType);
    }
    
    // Find the spreadsheet for this animal
    const spreadsheetId = await findSheetIdByName(folderId, animalName);
    if (!spreadsheetId) {
      throw new Error('Could not find treatment sheet for animal: ' + animalName);
    }
    
    console.log('Found spreadsheet:', spreadsheetId);
    
    // Get today's date in DD/MM/YYYY format
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const todayParsed = parseDMY(todayStr);
    
    // Load the spreadsheet
    const auth = getSheetsAuth();
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    
    const headers = sheet.headerValues;
    const headerMap = {};
    headers.forEach((name, idx) => {
      headerMap[name.trim()] = idx;
    });
    
    const rows = await sheet.getRows();
    
    // Find the matching row(s) for today with this medical case
    const timeSlotColumnMap = {
      'morning': 'בוקר',
      'noon': 'צהריים',
      'evening': 'ערב'
    };
    
    const timeSlotColumn = timeSlotColumnMap[timeSlot];
    if (!timeSlotColumn) {
      throw new Error('Invalid time slot: ' + timeSlot);
    }
    
    const timeSlotColIndex = headerMap[timeSlotColumn];
    const caseColIndex = headerMap['סיבת טיפול'];
    
    let updated = false;
    let updatedRowNumbers = [];
    
    // Find ALL rows matching today's date and the medical case
    const matchingRows = [];
    for (const row of rows) {
      const rowDateStr = row._rawData?.[0];
      const rowDate = parseDMY(rowDateStr);
      const rowCase = row._rawData?.[caseColIndex];
      
      // Match: same date and same medical case (or if medicalCase is not specified)
      if (rowDate === todayParsed && (!medicalCase || rowCase === medicalCase)) {
        const timeSlotValue = row._rawData?.[timeSlotColIndex];
        console.log(`Found matching row ${row._rowNumber}: date=${rowDateStr}, case=${rowCase}, ${timeSlotColumn}=${timeSlotValue}`);
        
        // Only include rows where this time slot has a checkbox (TRUE or FALSE)
        if (timeSlotValue === true || timeSlotValue === 'TRUE' || timeSlotValue === false || timeSlotValue === 'FALSE') {
          matchingRows.push({ row, timeSlotValue });
          console.log(`  ✓ Row ${row._rowNumber} has checkbox in ${timeSlotColumn} column`);
        } else {
          console.log(`  ✗ Row ${row._rowNumber} does NOT have checkbox in ${timeSlotColumn} column (value: ${timeSlotValue})`);
        }
      }
    }
    
    // Update ALL matching rows that have a checkbox in this time slot
    if (matchingRows.length > 0) {
      console.log(`Found ${matchingRows.length} row(s) with checkboxes for this case/time, updating all...`);
      
      for (const { row } of matchingRows) {
        console.log(`Updating row ${row._rowNumber}: ${timeSlotColumn} → ${isCompleted ? 'TRUE' : 'FALSE'}`);
        
        // Update the checkbox value
        // TRUE = checked (completed), FALSE = unchecked (pending)
        row._rawData[timeSlotColIndex] = isCompleted ? 'TRUE' : 'FALSE';
        await row.save();
        
        console.log(`✓ Updated ${timeSlotColumn} to ${isCompleted ? 'TRUE' : 'FALSE'} in row ${row._rowNumber}`);
        updatedRowNumbers.push(row._rowNumber);
        updated = true;
      }
      
      console.log(`✓ Successfully updated ${updatedRowNumbers.length} row(s): ${updatedRowNumbers.join(', ')}`);
    }
    
    if (!updated) {
      console.warn(`No matching row with checkbox found for today with case: ${medicalCase}, timeSlot: ${timeSlot}`);
      return new Response(JSON.stringify({ 
        success: false,
        error: `No treatment row found with a checkbox in the ${timeSlot} column for case: ${medicalCase || 'unspecified'}`
      }), { 
        status: 404, 
        headers: CORS_HEADERS 
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: `Treatment marked as ${isCompleted ? 'complete' : 'incomplete'}`,
      rowsUpdated: updatedRowNumbers.length,
      rowNumbers: updatedRowNumbers
    }), { 
      status: 200, 
      headers: CORS_HEADERS 
    });
    
  } catch (error) {
    console.error('Error updating treatment status:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update treatment status',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}
