import { saveCaregiverNote, getCaregiverNotes, deleteCaregiverNote } from '@/src/lib/sheets.js';

export async function POST(req) {
  try {
    const { caregiverName, date, note } = await req.json();
    
    console.log('Received caregiver note:', { caregiverName, date, note });
    
    // Validate required fields
    if (!caregiverName || !date || !note) {
      return new Response(
        JSON.stringify({ error: 'Caregiver name, date, and note are required' }),
        { status: 400 }
      );
    }
    
    await saveCaregiverNote(caregiverName, date, note);
    
    return new Response(
      JSON.stringify({ success: true, message: 'Note saved successfully' }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving caregiver note:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to save note', details: error.message }),
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const caregiverName = searchParams.get('caregiverName');
    const date = searchParams.get('date');
    
    if (!caregiverName || !date) {
      return new Response(
        JSON.stringify({ error: 'Caregiver name and date parameters are required' }),
        { status: 400 }
      );
    }
    
    const notes = await getCaregiverNotes(caregiverName, date);
    
    return new Response(
      JSON.stringify({ success: true, notes }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching caregiver notes:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch notes', details: error.message }),
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { caregiverName, date, note } = await req.json();
    
    console.log('Deleting caregiver note:', { caregiverName, date, note });
    
    // Validate required fields
    if (!caregiverName || !date || !note) {
      return new Response(
        JSON.stringify({ error: 'Caregiver name, date, and note are required' }),
        { status: 400 }
      );
    }
    
    const result = await deleteCaregiverNote(caregiverName, date, note);
    
    if (result.success) {
      return new Response(
        JSON.stringify({ success: true, message: 'Note deleted successfully' }),
        { status: 200 }
      );
    } else {
      return new Response(
        JSON.stringify({ error: result.message || 'Note not found' }),
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error deleting caregiver note:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete note', details: error.message }),
      { status: 500 }
    );
  }
}
