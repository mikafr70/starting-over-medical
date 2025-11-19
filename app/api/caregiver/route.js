import { getCaregiverNameFromSheet, ensureConfigLoaded } from '@/src/lib/sheets';

function getCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(),
  });
}

export async function GET(req) {
  try {
    await ensureConfigLoaded();
    
    console.log("Caregiver fetching from req:", req);
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    console.log("Caregiver fetching from email:", email);
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email parameter' }), { 
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    const caregiverName = await getCaregiverNameFromSheet(email);
    console.log("Caregiver name fetched in backend:", caregiverName);
    return new Response(JSON.stringify({ caregiverName }), { 
      status: 200,
      headers: getCorsHeaders(),
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: getCorsHeaders(),
    });
  }
}
