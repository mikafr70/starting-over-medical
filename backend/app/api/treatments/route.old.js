import { updateAnimalInList } from '@/src/lib/sheets';

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
    // Update the animal in the main animals sheet
    const success = await updateAnimalInList(animalType, updatedAnimal['name'], updatedAnimal);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Animal not found in sheet' }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }
    // Return the updated animal
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
  return new Date(year, month - 1, day); // month is 0-based
}


import { log } from 'console';
import { ANIMAL_TREATMENT_SHEETS, getAnimalTreatments, addTreatmentAtTop, getAnimalsFromSheet, getAnimals, getProtocolsFromSheet, readRecentSheetsAndRows, ensureConfigLoaded, getAllAnimalTypes } from '@/src/lib/sheets';


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
    // Ensure configuration is loaded before accessing sheets
    await ensureConfigLoaded();
    
    const { searchParams } = new URL(request.url);
    const animalId = searchParams.get('animalId');
    const animalType = searchParams.get('animalType');
    const profile = searchParams.get('profile');

    console.log('searchParams:', { searchParams});

    console.log('Fetching treatments with params:', { animalId, animalType, profile });
    // Profile endpoint: /api/treatments?profile=1&animalId=XXX
    if (profile && animalId) {
      //console.log('Received animalId for profile:', animalId);
      // Get all animals from the main animals sheet
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
      // Get all treatments for this animal from its individual sheet
      const allTreatments = await getAnimalTreatments(animalType, animalId);

      //console.log('All treatments fetched for animal:', allTreatments);

      // Filter treatments to only those within 1 week before/after today
      // treatment date is the first column 
      const now = new Date();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const treatments = allTreatments.filter(tr => {
        const parsedDate = parseDDMMYYYY(tr.date);
        const trDate = parsedDate ? new Date(parsedDate) : null;
        if (!parsedDate || isNaN(parsedDate.getTime())) return false;
        return Math.abs(parsedDate.getTime() - now.getTime()) <= oneWeekMs;
        
      });

      return new Response(JSON.stringify({ animal, treatments }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // Return list of animal types
    if (!animalId && !animalType) {
      const types = getAllAnimalTypes();
      console.log('Returning animal types:', types);
      return new Response(JSON.stringify(types), { 
        status: 200, 
        headers: CORS_HEADERS 
      });
    }

    // Return animals of a specific type (read the sheet by sheetId)
    if (animalType && !animalId) {
      const typeInfo = ANIMAL_TREATMENT_SHEETS[animalType];
      if (!typeInfo) {
        return new Response(JSON.stringify({ 
          error: 'Invalid animal type',
          type: animalType 
        }), {
          status: 404,
          headers: CORS_HEADERS
        });
      }

      // Prefer live sheet data when a sheetId is configured
      if (typeInfo.sheetId) {
        const liveAnimals = await getAnimalsFromSheet(typeInfo.sheetId);
        const liveProtocols = await getProtocolsFromSheet(protocolsSheetId, animalType);

        // Map to lightweight shape for frontend
        const animals = liveAnimals.map(a => ({
           displayName: a.name , 
           id_number: a.id_number
/*           ,
            gender: a.gender,
             location: a.location ,
             in_treatment: a.in_treatment,
             id_number2: a.id_number2,
             weight: a.weight,
              arrival_date: a.arrival_date,
              birth_date: a.birth_date,
              special_trimming: a.special_trimming,
              description: a.description,
              notes: a.notes,
              drugs: a.drugs,
              castration: a.castration,
              deworming: a.deworming,
              source: a.source,
              status: a.status,
              friends: a.friends*/
            }));
        const protocols = liveProtocols.map((it, idx) => ({
            case: it.case, 
            medication: it.medication,
            days: it.days,
            frequency: it.frequency,
            morning: it.morning,
            noon: it.noon,
            evening: it.evening,
          }));
        return new Response(JSON.stringify({animals,protocols} ), { status: 200, headers: CORS_HEADERS });
      }

      // Fallback to static mapping in the dictionary
      const animals = Object.entries(typeInfo.animals || {}).map(([id, animal]) => ({
        id,
        displayName: animal.displayName
      }));

      return new Response(JSON.stringify(animals), { status: 200, headers: CORS_HEADERS });
    }
    console.log('@@@@@@@@Fetching treatments for animalType:', animalType, 'animalId:');


    // Get treatments for a specific animal
    const animalTypeInfo = Object.values(ANIMAL_TREATMENT_SHEETS).find(
      type => Object.keys(type.animals).includes(animalId)
    );

    console.log('@@@@@@@@Fetching treatments for animalTypeInfo:', animalTypeInfo);


    if (!animalTypeInfo) {
      return new Response(JSON.stringify({ 
        error: 'No treatment sheet found for this animal',
        animalId 
      }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }

    //const treatments = await getAnimalTreatments(animalTypeInfo.sheetId);
    //return new Response(JSON.stringify(treatments), { 
    //  status: 200, 
    //  headers: CORS_HEADERS 
    //});

  } catch (err) {
    console.error('Failed to fetch treatments:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch treatments' }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const animalId = searchParams.get('animalId');

    log('Received animalId:', animalId);
    if (!animalId) {
      return new Response(JSON.stringify({ error: 'animalId is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    // Check if we have a treatment sheet for this animal
    const animalInfo = ANIMAL_TREATMENT_SHEETS[animalId];
    if (!animalInfo) {
      return new Response(JSON.stringify({ 
        error: 'No treatment sheet found for this animal',
        animalId 
      }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }

    const body = await request.json();
    // If the mapping contains a sheetId, write the row at the top of that sheet
    if (animalInfo && animalInfo.sheetId) {
      try {
        const result = await addTreatmentAtTop(animalInfo.sheetId, body);
        return new Response(JSON.stringify(result), { status: 201, headers: CORS_HEADERS });
      } catch (err) {
        console.error('Failed to add treatment at top:', err);
        return new Response(JSON.stringify({ error: 'Failed to add treatment to sheet' }), { status: 500, headers: CORS_HEADERS });
      }
    }

  } catch (err) {
    console.error('Failed to add treatment:', err);
    return new Response(JSON.stringify({ error: 'Failed to add treatment' }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}
