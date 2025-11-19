import { getProtocolsFromSheet } from '../../../../utils/sheets';

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

    // Use a fixed sheet ID for protocols - replace this with your actual protocols sheet ID
    const PROTOCOLS_SHEET_ID = '1dGZSpZYUDrw_xQjlHOWjvHzdj-iT6Q77kdm1U0TABeg';
    
    const protocols = await getProtocolsFromSheet(PROTOCOLS_SHEET_ID, animalType);
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