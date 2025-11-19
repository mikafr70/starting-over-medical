import { ANIMAL_TREATMENT_SHEETS, getAnimalTreatments, getAnimalsFromSheet, getAnimals, getProtocolsFromSheet, updateAnimalInList, ensureConfigLoaded, getAllAnimalTypes } from '@/src/lib/sheets';

const protocolsSheetId = "1DJhnTRnEImO-gD7a6gBHLvS374xkpv-_Z18tAS3AuPQ";
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    await ensureConfigLoaded();
    
    const { searchParams } = new URL(request.url);
    const animalId = searchParams.get('animalId');
    const animalType = searchParams.get('animalType');
    const profile = searchParams.get('profile');

    console.log('searchParams:', { searchParams});
    console.log('Fetching treatments with params:', { animalId, animalType, profile });

    // Profile endpoint: /api/treatments?profile=1&animalId=XXX
    if (profile && animalId) {
      const allAnimals = await getAnimals(animalType);
      console.log('All animals fetched:', allAnimals.length);

      const animal = allAnimals.find(a => a.id === animalId || a.id_number === animalId || a.id2 === animalId);
      console.log('Animal found: ', animal.name);

      if (!animal) {
        return new Response(JSON.stringify({ error: 'Animal not found', animalId }), {
          status: 404,
          headers: CORS_HEADERS
        });
      }

      const allTreatments = await getAnimalTreatments(animalType, animalId);
      const now = new Date();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      
      const treatments = allTreatments.filter(tr => {
        const parsedDate = parseDDMMYYYY(tr.date);
        console.log('Parsed date for treatment:', tr.date, '->', parsedDate);
        const trDate = parsedDate ? new Date(parsedDate) : null;
        if (!trDate || isNaN(trDate.getTime())) return false;
        return Math.abs(trDate.getTime() - now.getTime()) <= oneWeekMs;
      });

      return new Response(JSON.stringify({ animal, treatments }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // Animal type endpoint: /api/treatments?animalType=XXX (returns animals + protocols)
    if (animalType) {
      console.log('Fetching animals and protocols for type:', animalType);
      const animals = await getAnimals(animalType);
      const protocols = await getProtocolsFromSheet(protocolsSheetId, animalType);
      return new Response(JSON.stringify({ animals, protocols }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // Default endpoint: /api/treatments (returns all animal types)
    console.log('Fetching all animal types');
    const types = await getAllAnimalTypes();
    console.log('Returning animal types:', types);
    return new Response(JSON.stringify(types), {
      status: 200,
      headers: CORS_HEADERS
    });

  } catch (err) {
    console.error('Failed to fetch treatments:', err);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch treatments',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}

export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const animalId = searchParams.get('animalId');
    if (!animalId) {
      return new Response(JSON.stringify({ error: 'animalId is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    const body = await request.json();
    const { animalType, updatedAnimal } = body;
    console.log('Updating animal:', animalId, 'of type:', animalType, 'with data:', updatedAnimal);
    if (!animalType) {
      return new Response(JSON.stringify({ error: 'animalType is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    const success = await updateAnimalInList(animalType, updatedAnimal['name'], updatedAnimal);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Animal not found in sheet' }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }
    return new Response(JSON.stringify({ animal: updatedAnimal }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    console.error('Failed to update animal:', err);
    return new Response(JSON.stringify({ error: 'Failed to update animal' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split(/[\/.-]/).map(Number);
  return new Date(year, month - 1, day);
}
