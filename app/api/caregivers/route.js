import { getAllCaregivers, ensureConfigLoaded } from '@/src/lib/sheets';

function getCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    
    const caregivers = await getAllCaregivers();
    return new Response(JSON.stringify(caregivers), { 
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
