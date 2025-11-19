import { getAnimals, getAnimalsForCaregiverWithTreatementsToday } from '../../../utils/sheets';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    //console.log('Fetching animals...');
    //console.log('Environment variables check:');
    //console.log('ANIMALS_SHEET_ID:', process.env.ANIMALS_SHEET_ID);
    //console.log('GOOGLE_SERVICE_ACCOUNT_EMAIL:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
    //console.log('GOOGLE_SHEETS_PRIVATE_KEY exists:', !!process.env.GOOGLE_SHEETS_PRIVATE_KEY);
    //console.log('DRIVE_FOLDER_ID:', process.env.DRIVE_FOLDER_ID);

    const { searchParams } = new URL(request.url);
    const caregiver = searchParams.get('caregiver');

    if(caregiver ){
      console.log('Filtering animals for caregiver:', caregiver);
      const animals = await getAnimalsForCaregiverWithTreatementsToday(caregiver);
      //const animals = await getAnimals();
      console.log('Animals fetched:', animals);
      return new Response(JSON.stringify(animals), { 
        status: 200, 
        headers: CORS_HEADERS 
      });
    }
 
  } catch (err) {
    console.error('Failed to fetch animals:', err);
    // Return more detailed error information
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch animals',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}