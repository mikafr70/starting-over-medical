import { NextResponse } from 'next/server';
import { markGeneralTreatmentComplete, markGeneralTreatmentIncomplete } from '../../../../src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  try {
    const { animalType, animalName, date, markAsComplete } = await request.json();
    
    console.log('>>> Complete/Incomplete general treatment request:', { animalType, animalName, date, markAsComplete });
    
    if (!animalType || !animalName || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: animalType, animalName, date' },
        { status: 400 }
      );
    }
    
    // Default to marking as complete if not specified
    const shouldComplete = markAsComplete !== false;
    
    const result = shouldComplete 
      ? await markGeneralTreatmentComplete(animalType, animalName, date)
      : await markGeneralTreatmentIncomplete(animalType, animalName, date);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating general treatment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update general treatment' },
      { status: 500 }
    );
  }
}
