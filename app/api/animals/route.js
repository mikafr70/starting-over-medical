import { getAnimals, getAnimalsForCaregiverWithTreatementsToday, ensureConfigLoaded } from '@/src/lib/sheets';

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
    await ensureConfigLoaded();

    const { searchParams } = new URL(request.url);
    const caregiver = searchParams.get('caregiver');

    if(caregiver ){
      console.log('Filtering animals for caregiver:', caregiver);
      const animals = await getAnimalsForCaregiverWithTreatementsToday(caregiver);
      console.log('Animals fetched:', animals);
      return new Response(JSON.stringify(animals), { 
        status: 200, 
        headers: CORS_HEADERS 
      });
    }
 
  } catch (err) {
    console.error('Failed to fetch animals:', err);
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
