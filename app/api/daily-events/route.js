import { saveDailyEvent, getDailyEvents, deleteDailyEvent } from '@/src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req) {
  try {
    const { date, event } = await req.json();
    
    console.log('Received daily event:', { date, event });
    
    // Validate required fields
    if (!date || !event) {
      return new Response(
        JSON.stringify({ error: 'Date and event are required' }),
        { status: 400 }
      );
    }
    
    await saveDailyEvent(date, event);
    
    return new Response(
      JSON.stringify({ success: true, message: 'Event saved successfully' }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving daily event:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to save event', details: error.message }),
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    
    if (!date) {
      return new Response(
        JSON.stringify({ error: 'Date parameter is required' }),
        { status: 400 }
      );
    }
    
    const events = await getDailyEvents(date);
    
    return new Response(
      JSON.stringify({ success: true, events }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching daily events:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch events', details: error.message }),
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { date, event } = await req.json();
    
    console.log('Deleting daily event:', { date, event });
    
    // Validate required fields
    if (!date || !event) {
      return new Response(
        JSON.stringify({ error: 'Date and event are required' }),
        { status: 400 }
      );
    }
    
    const result = await deleteDailyEvent(date, event);
    
    if (result.success) {
      return new Response(
        JSON.stringify({ success: true, message: 'Event deleted successfully' }),
        { status: 200 }
      );
    } else {
      return new Response(
        JSON.stringify({ error: result.message || 'Event not found' }),
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error deleting daily event:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete event', details: error.message }),
      { status: 500 }
    );
  }
}
