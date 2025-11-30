import { updateAnimalInList } from '@/src/lib/sheets'; // ...existing code...

export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const animalName = searchParams.get('animalName');
    if (!animalName) {
      return new Response(JSON.stringify({ error: 'animalName is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    const body = await request.json();
    const { animalType, updatedAnimal } = body;
    console.log('Updating animal:', animalName, 'of type:', animalType, 'with data:', updatedAnimal);
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

// ...existing code...
import { log } from 'console';
import { ANIMAL_TREATMENT_SHEETS, getAnimalTreatments, addTreatmentAtTop, getAnimalsFromSheet, getAnimals, getProtocolsFromSheet, readRecentSheetsAndRows, ensureConfigLoaded, getAllAnimalTypes } from '@/src/lib/sheets'; // ...existing code...


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
    const animalType = searchParams.get('animalType');
    const profile = searchParams.get('profile');
    const animalName = searchParams.get('animalName');

    console.log('searchParams:', { searchParams});

    console.log('Fetching treatments with params:', { animalName, animalType, profile });
    // Profile endpoint: /api/treatments?profile=1&animalName=XXX or &animalName=NAME
    if (profile && animalName) {
      // Allow lookup by ID or by name
      const allAnimals = await getAnimals(animalType);
      console.log('All animals fetched:', allAnimals.length);

      const targetAnimal = allAnimals.find(a => a.name === animalName || a.displayName === animalName || (a.name && a.name.includes(animalName)));

      if (!targetAnimal) {
        return new Response(JSON.stringify({ error: 'Animal not found', animalName }), {
          status: 404,
          headers: CORS_HEADERS
        });
      }

      console.log('Animal found: ', targetAnimal.name || targetAnimal.displayName);
      // Get all treatments for this animal from its individual sheet
      const allTreatments = await getAnimalTreatments(animalType, targetAnimal.name);

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

      return new Response(JSON.stringify({ animal: targetAnimal, treatments }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // Return list of animal types
    if (!animalName && !animalType) {
      const types = getAllAnimalTypes();
      console.log('Returning animal types:', types);
      return new Response(JSON.stringify(types), { 
        status: 200, 
        headers: CORS_HEADERS 
      });
    }

    // Return animals of a specific type (read the sheet by sheetId)
    if (animalType && !animalName) {
      const sheets = ANIMAL_TREATMENT_SHEETS();   // <-- CALL the function
      const typeInfo = sheets[animalType];         // <-- lookup inside returned object

      if (!typeInfo) {
        return new Response(
          JSON.stringify({
            error: 'Invalid animal type',
            type: animalType
          }),
          {
            status: 404,
            headers: CORS_HEADERS
          }
        );
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
    console.log('@@@@@@@@Fetching treatments for animalType:', animalType, 'animalName:', animalName);


    // Get treatments for a specific animal
    const animalTypeInfo = Object.values(ANIMAL_TREATMENT_SHEETS()).find(
      type => Object.keys(type.animals).includes(animalName)
    );

    console.log('@@@@@@@@Fetching treatments for animalTypeInfo:', animalTypeInfo);


    if (!animalTypeInfo) {
      return new Response(JSON.stringify({ 
        error: 'No treatment sheet found for this animal',
        animalName 
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
    const animalName = searchParams.get('animalName');

    log('Received animalName:', animalName);
    if (!animalName) {
      return new Response(JSON.stringify({ error: 'animalName is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    // Check if we have a treatment sheet for this animal
    const animalInfo = ANIMAL_TREATMENT_SHEETS()[animalType];
    if (!animalInfo) {
      return new Response(JSON.stringify({ 
        error: 'No treatment sheet found for this animal',
        animalType 
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
