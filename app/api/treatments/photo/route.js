import { saveTreatmentPhoto, getTreatmentPhotoFromRow, ensureConfigLoaded } from '@/src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req) {
  try {
    await ensureConfigLoaded();
    const { searchParams } = new URL(req.url);
    const animalType = searchParams.get('animalType');
    const animalName = searchParams.get('animalName');
    const rowIndex = parseInt(searchParams.get('rowIndex') || '0', 10);

    if (!animalType || !animalName || !rowIndex) {
      return new Response(JSON.stringify({ error: 'animalType, animalName and rowIndex are required' }), { status: 400, headers: CORS });
    }

    const photo = await getTreatmentPhotoFromRow(animalType, animalName, rowIndex);
    return new Response(JSON.stringify({ photo: photo || null }), { status: 200, headers: CORS });
  } catch (err) {
    console.error('GET /api/treatments/photo error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}

export async function POST(req) {
  try {
    await ensureConfigLoaded();
    const { animalType, animalName, rowIndex, photo } = await req.json();

    if (!animalType || !animalName || !rowIndex || !photo) {
      return new Response(JSON.stringify({ error: 'animalType, animalName, rowIndex and photo are required' }), { status: 400, headers: CORS });
    }

    await saveTreatmentPhoto(animalType, animalName, rowIndex, photo);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  } catch (err) {
    console.error('POST /api/treatments/photo error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
