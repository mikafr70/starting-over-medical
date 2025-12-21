import { authenticateCaregiver, ensureConfigLoaded } from '@/src/lib/sheets';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(),
  });
}

export async function POST(req) {
  try {
    await ensureConfigLoaded();
    
    const body = await req.json();
    const { email, password } = body;
    
    console.log("Login attempt for email:", email);
    
    if (!email || !password) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Email and password are required' 
      }), { 
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    const result = await authenticateCaregiver(email, password);
    
    if (result.success) {
      console.log("Login successful for:", email);
      return new Response(JSON.stringify({ 
        success: true, 
        caregiverName: result.caregiverName,
        email: email
      }), { 
        status: 200,
        headers: getCorsHeaders(),
      });
    } else {
      console.log("Login failed for:", email);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid email or password' 
      }), { 
        status: 401,
        headers: getCorsHeaders(),
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), { 
      status: 500,
      headers: getCorsHeaders(),
    });
  }
}
