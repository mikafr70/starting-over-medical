import { NextResponse } from 'next/server';
import { markPersonalTreatmentComplete, markPersonalTreatmentIncomplete } from '@/src/lib/sheets';

export async function POST(request) {
  try {
    const { animalType, animalName, date, markAsComplete } = await request.json();
    
    console.log(`>>> API complete-personal: ${animalType} / ${animalName} / ${date} / markAsComplete: ${markAsComplete}`);

    if (!animalType || !animalName || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: animalType, animalName, date' },
        { status: 400 }
      );
    }

    // Convert DD.MM.YYYY to DD/MM/YYYY for sheets.js functions
    const dateForSheet = date.replace(/\./g, '/');

    if (markAsComplete) {
      await markPersonalTreatmentComplete(animalType, animalName, dateForSheet);
      return NextResponse.json({ 
        success: true, 
        message: 'Personal treatment marked as complete'
      });
    } else {
      await markPersonalTreatmentIncomplete(animalType, animalName, dateForSheet);
      return NextResponse.json({ 
        success: true, 
        message: 'Personal treatment marked as incomplete'
      });
    }
  } catch (error) {
    console.error('Error in complete-personal API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update personal treatment status' },
      { status: 500 }
    );
  }
}
