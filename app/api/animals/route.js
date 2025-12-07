import { getAnimals, getAnimalsForCaregiverWithTreatementsToday, getGeneralTreatmentsForCaregiver, ensureConfigLoaded, addAnimalToList, createAnimalTreatmentSheet } from '@/src/lib/sheets';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
    const caregiver = searchParams.get('caregiver');
    const generalTreatments = searchParams.get('generalTreatments');

    if(caregiver && generalTreatments === 'true'){
      console.log('Fetching general treatments for caregiver:', caregiver);
      const treatments = await getGeneralTreatmentsForCaregiver(caregiver);
      return new Response(JSON.stringify(treatments), { 
        status: 200, 
        headers: CORS_HEADERS 
      });
    }

    if(caregiver ){
      console.log('Filtering animals for caregiver:', caregiver);
      const animals = await getAnimalsForCaregiverWithTreatementsToday(caregiver);
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

export async function POST(request) {
  try {
    await ensureConfigLoaded();

    const body = await request.json();
    const { animalType, name, id, ...otherFields } = body;

    if (!animalType || !name) {
      return new Response(JSON.stringify({ 
        error: 'Animal type and name are required' 
      }), { 
        status: 400, 
        headers: CORS_HEADERS 
      });
    }

    // 1. Add animal to the main list (alphabetically sorted)
    await addAnimalToList(animalType, { name, id, ...otherFields });
    
    // 2. Try to create a new treatment sheet for the animal (non-blocking)
    const sheetName = id ? `${name} ${id}` : name;
    let sheetCreated = false;
    let sheetError = null;
    
    try {
      await createAnimalTreatmentSheet(animalType, sheetName);
      sheetCreated = true;
    } catch (sheetErr) {
      console.error('Warning: Could not create treatment sheet:', sheetErr.message);
      sheetError = sheetErr.message;
      // Continue anyway - animal is already added to the list
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: sheetCreated 
        ? 'Animal and treatment sheet added successfully' 
        : 'Animal added successfully (treatment sheet creation failed - check Google Drive storage)',
      animalName: name,
      sheetCreated,
      sheetError
    }), { 
      status: 200, 
      headers: CORS_HEADERS 
    });

  } catch (err) {
    console.error('Failed to add animal:', err);
    return new Response(JSON.stringify({ 
      error: 'Failed to add animal',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }), { 
      status: 500, 
      headers: CORS_HEADERS 
    });
  }
}
