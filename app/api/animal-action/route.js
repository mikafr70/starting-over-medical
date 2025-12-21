import { saveAdoptionData, saveEuthanasiaData, saveBirthData, saveArrivalData, saveDeathData } from '@/src/lib/sheets.js';

export async function POST(req) {
  try {
    const actionData = await req.json();
    
    console.log('Received animal action data:', actionData);
    
    // Validate required fields
    if (!actionData.actionType) {
      return new Response(
        JSON.stringify({ error: 'Action type is required' }),
        { status: 400 }
      );
    }
    
    // Validate common required fields
    if (!actionData.animalName || !actionData.date || !actionData.animalType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (name, date, or animal type)' }),
        { status: 400 }
      );
    }
    
    // Handle different action types
    switch (actionData.actionType) {
      case 'אימוץ':
        await saveAdoptionData(actionData);
        return new Response(
          JSON.stringify({ success: true, message: 'Adoption data saved successfully' }),
          { status: 200 }
        );
      
      case 'המתת חסד':
        await saveEuthanasiaData(actionData);
        return new Response(
          JSON.stringify({ success: true, message: 'Euthanasia data saved successfully' }),
          { status: 200 }
        );
      
      case 'המלטה':
        await saveBirthData(actionData);
        return new Response(
          JSON.stringify({ success: true, message: 'Birth data saved successfully' }),
          { status: 200 }
        );
      
      case 'קליטה':
        await saveArrivalData(actionData);
        return new Response(
          JSON.stringify({ success: true, message: 'Arrival data saved successfully' }),
          { status: 200 }
        );
      
      case 'פטירה':
        await saveDeathData(actionData);
        return new Response(
          JSON.stringify({ success: true, message: 'Death data saved successfully' }),
          { status: 200 }
        );
      
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action type: ' + actionData.actionType }),
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error processing animal action:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process animal action', details: error.message }),
      { status: 500 }
    );
  }
}
