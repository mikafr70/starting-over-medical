import { NextResponse } from 'next/server';
import { getAnimalPhoto, saveAnimalPhoto } from '../../../../src/lib/sheets.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const animalType = searchParams.get('animalType');
    const animalName = searchParams.get('animalName');

    if (!animalType || !animalName) {
      return NextResponse.json(
        { error: 'Missing required fields: animalType, animalName' },
        { status: 400 }
      );
    }

    const photo = await getAnimalPhoto(animalType, animalName);

    return NextResponse.json({ photo });
  } catch (error) {
    console.error('Error fetching animal photo:', error);
    return NextResponse.json(
      { error: 'Failed to fetch animal photo' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { animalType, animalName, photo } = body;

    if (!animalType || !animalName || !photo) {
      return NextResponse.json(
        { error: 'Missing required fields: animalType, animalName, photo' },
        { status: 400 }
      );
    }

    // Validate photo size (Google Sheets has 50,000 character limit per cell)
    if (photo.length > 45000) {
      console.error(`Photo too large: ${photo.length} characters`);
      return NextResponse.json(
        { error: 'Photo is too large. Please compress the image more.' },
        { status: 400 }
      );
    }

    console.log(`Saving photo of ${photo.length} characters for ${animalType} ${animalName}`);
    await saveAnimalPhoto(animalType, animalName, photo);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving animal photo:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save animal photo' },
      { status: 500 }
    );
  }
}
