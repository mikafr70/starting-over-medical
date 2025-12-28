import { addCaregiverToAnimal } from '../../../../src/lib/sheets.js';

export async function POST(req) {
  try {
    const { animalType, animalName, caregiverName } = await req.json();
    
    if (!animalType || !animalName || !caregiverName) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400 }
      );
    }

    await addCaregiverToAnimal(animalType, animalName, caregiverName);
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Error adding caregiver to animal:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to add caregiver to animal' }),
      { status: 500 }
    );
  }
}
