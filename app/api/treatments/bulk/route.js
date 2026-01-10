import { ANIMAL_TREATMENT_SHEETS, addTreatmentAtTop, findSheetIdByName, deleteAnimalTreatmentsBetweenDates, sortAnimalTreatmentsByDateDescending, ensureConfigLoaded, getAnimalTypeKey, setCaregiverForAnimal, createAnimalTreatmentSheet, getAnimals } from '@/src/lib/sheets';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function formatDMY(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}


export async function POST(request) {
  try {
    await ensureConfigLoaded();
    
    const { searchParams } = new URL(request.url);
    const animalName = searchParams.get('animalName');
    const animalType = searchParams.get('animalType');
    const deleteFlag = searchParams.get('delete');
    const caregiverName = searchParams.get('caregiver');
    const animalTypeKey = await getAnimalTypeKey(animalType);

    console.log(`@@@@@@@@ bulk add treatments for animal type: ${animalTypeKey}, animal name: ${animalName}. Delete flag: ${deleteFlag}, Caregiver: ${caregiverName}`);
   
    if (!animalName) {
      return new Response(JSON.stringify({ error: 'animalName is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    console.log('search for the animal sheet on:', ANIMAL_TREATMENT_SHEETS()[animalTypeKey].folderId);
    let animalSheetId = await findSheetIdByName(ANIMAL_TREATMENT_SHEETS()[animalTypeKey].folderId, animalName);
    console.log('found sheet id:', animalSheetId);

    // If no sheet exists, create one with format "name id"
    if (!animalSheetId) {
      console.log(`No treatment sheet found for ${animalName}, creating new sheet...`);
      
      // Get animal info to find the ID
      const animals = await getAnimals(animalTypeKey);
      const animal = animals.find(a => a.name === animalName);
      
      if (!animal || !animal.id) {
        return new Response(JSON.stringify({ error: 'Animal not found in main list or missing ID', animalName }), {
          status: 404,
          headers: CORS_HEADERS
        });
      }
      
      // Create sheet with format "name id"
      const sheetName = `${animalName} ${animal.id}`;
      console.log(`Creating treatment sheet with name: ${sheetName}`);
      
      try {
        animalSheetId = await createAnimalTreatmentSheet(animalTypeKey, sheetName);
        console.log(`Successfully created treatment sheet with ID: ${animalSheetId}`);
      } catch (createError) {
        console.error('Failed to create treatment sheet:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create treatment sheet for animal', details: createError.message }), {
          status: 500,
          headers: CORS_HEADERS
        });
      }
    }

    const { treatments } = await request.json();
    console.log('Received treatments to add:', treatments.length);

    if (!Array.isArray(treatments)) {
      return new Response(JSON.stringify({ error: 'treatments must be an array' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
   
    if(deleteFlag == 'TRUE') {
      if(treatments.length === 0) { 
        // start date is a week back, end date is a month forward from today
        const startDateObj = new Date();startDateObj.setDate(startDateObj.getDate() - 7);
        const endDateObj = new Date();endDateObj.setDate(endDateObj.getDate() + 30);
        const startDate = formatDMY(startDateObj);
        const endDate = formatDMY(endDateObj);
        console.log(`Deleting existing treatments for ${animalName} from ${startDate} to ${endDate}`);
        await deleteAnimalTreatmentsBetweenDates(animalTypeKey, animalName, startDate, endDate);
        return new Response(JSON.stringify({ message: 'No treatments provided to determine deletion range' }), { status: 200, headers: CORS_HEADERS });
      }
      const startDate = treatments.reduce((min, t) => t.date < min ? t.date : min, treatments[0].date);
      const endDate = treatments.reduce((max, t) => t.date > max ? t.date : max, treatments[0].date);
      console.log(`Deleting existing treatments for ${animalName} from ${startDate} to ${endDate}`);
      await deleteAnimalTreatmentsBetweenDates(animalTypeKey, animalName, startDate.toString("DD/MM/YYYY"), endDate.toString("DD/MM/YYYY"));
    }

    try {
      if (treatments.length === 0) { 
        return new Response(JSON.stringify({ message: 'No treatments to add' }), { status: 200, headers: CORS_HEADERS });
      }
      
      // Check if general caregiver is selected
      const isGeneralCaregiver = caregiverName && caregiverName.trim() === 'כללי';
      const isPersonalCaregiver = caregiverName && caregiverName.trim() !== 'כללי';
      console.log(`Is general caregiver selected: ${isGeneralCaregiver}`);
      
      const result = await addTreatmentAtTop(animalSheetId, treatments, isGeneralCaregiver, isPersonalCaregiver);
      await sortAnimalTreatmentsByDateDescending(animalSheetId, animalName);
      
      // Update caregiver if provided
      if (caregiverName && caregiverName.trim()) {
        try {
          console.log(`Setting caregiver ${caregiverName} for animal ${animalName}`);
          await setCaregiverForAnimal(animalTypeKey, animalName, caregiverName);
        } catch (caregiverErr) {
          console.error('Failed to set caregiver, but treatments were added:', caregiverErr);
          // Continue anyway - treatments were already added successfully
        }
      }
      
      return new Response(JSON.stringify(result), { status: 201, headers: CORS_HEADERS });
      
    } catch (err) {
      console.error('Failed to add treatments in bulk:', err);
      return new Response(JSON.stringify({ error: 'Failed to add treatments to sheet' }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }

  } catch (err) {
    console.error('Failed to process bulk add request:', err);
    return new Response(JSON.stringify({ error: 'Failed to add treatments' }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}

export async function GET(request) {
  try {
    return new Response(JSON.stringify({ message: 'Bulk treatments endpoint is operational' }), { 
      status: 200, 
      headers: CORS_HEADERS 
    });
  } catch (err) {
    console.error('Error in GET /bulk:', err);
    return new Response(JSON.stringify({ error: 'Failed to process GET request' }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}
