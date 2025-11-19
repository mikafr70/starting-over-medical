import { Folder } from 'lucide-react';
import { ANIMAL_TREATMENT_SHEETS, addTreatmentAtTop ,findSheetIdByName,deleteAnimalTreatmentsBetweenDates, sortAnimalTreatmentsByDateDescending} from '../../../../utils/sheets';

import { env } from 'process';


const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
 
    const { searchParams } = new URL(request.url);
    const animalName = searchParams.get('animalName');
    const animalType = searchParams.get('animalType');
    const deleteFlag = searchParams.get('delete');

    console.log('@@@@@@@@ bulk add treatments for animal type:', animalType);
    console.log('@@@@@@@@ bulk add treatments for animal name:', animalName);
    console.log('@@@@@@@@ bulk add treatments deleteFlag:', deleteFlag);
   
    if (!animalName) {
      return new Response(JSON.stringify({ error: 'animalName is required' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    console.log('search for the animal sheet for:', animalName);
    const animalSheetId = await findSheetIdByName(ANIMAL_TREATMENT_SHEETS[animalType].folderId, animalName);
    console.log('found sheet id:', animalSheetId);

    if (!animalSheetId) {
      return new Response(JSON.stringify({ error: 'No sheet found for this animal', animalName }), {
        status: 404,
        headers: CORS_HEADERS
      });
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
      // Delete existing treatments for the animal before adding new ones
      const startDate = treatments.reduce((min, t) => t.date < min ? t.date : min, treatments[0].date);
      const endDate = treatments.reduce((max, t) => t.date > max ? t.date : max, treatments[0].date);
      console.log(`Deleting existing treatments for ${animalName} from ${startDate} to ${endDate}`);
      await deleteAnimalTreatmentsBetweenDates(animalType, animalName, startDate.toString("DD/MM/YYYY"), endDate.toString("DD/MM/YYYY"));
    }



    // Add all treatments in one operation
    try {
      const result = await addTreatmentAtTop(animalSheetId, treatments);
      await sortAnimalTreatmentsByDateDescending(animalSheetId, animalName);  
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