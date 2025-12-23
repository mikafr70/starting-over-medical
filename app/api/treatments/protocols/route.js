import { getProtocolsFromSheet } from '@/src/lib/sheets';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
    const { searchParams } = new URL(request.url);
    const animalType = searchParams.get('type');

    if (!animalType) {
      return new Response(JSON.stringify({ error: 'Animal type is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

   
    const protocols = await getProtocolsFromSheet(process.env.PROTOCOLS_SHEET_ID, animalType);
    return new Response(JSON.stringify(protocols), {
      status: 200,
      headers: CORS_HEADERS
    });

  } catch (err) {
    console.error('Failed to fetch protocols:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch protocols' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
