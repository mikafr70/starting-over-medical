import { NextResponse } from 'next/server';
import { removeCaregiverFromAnimal } from '../../../../src/lib/sheets.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { animalType, animalName, caregiverName, removeAll } = body;

    if (!animalType || !animalName) {
      return NextResponse.json(
        { error: 'Missing required fields: animalType, animalName' },
        { status: 400 }
      );
    }

    await removeCaregiverFromAnimal(animalType, animalName, caregiverName, removeAll);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing caregiver from animal:', error);
    return NextResponse.json(
      { error: 'Failed to remove caregiver from animal' },
      { status: 500 }
    );
  }
}
