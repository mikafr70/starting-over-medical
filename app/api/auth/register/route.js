import { addCaregiver } from '../../../../src/lib/sheets.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return Response.json({
        success: false,
        error: 'Name, email, and password are required'
      }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
    }

    // Add caregiver to sheet
    const result = await addCaregiver({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password
    });

    if (result.success) {
      return Response.json({
        success: true,
        message: 'Caregiver registered successfully',
        caregiverName: name.trim()
      });
    } else {
      return Response.json({
        success: false,
        error: result.error || 'Registration failed'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Register error:', error);
    return Response.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
