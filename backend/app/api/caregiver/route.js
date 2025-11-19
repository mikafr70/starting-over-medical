import { Folder } from 'lucide-react';
import { getCaregiverNameFromSheet } from '../../../utils/sheets';
import { env } from 'process';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email parameter' }), { status: 400 });
    }
    const caregiverName = await getCaregiverNameFromSheet(email);
    console.log("%%%%%%% Caregiver name fetched in backend:", caregiverName);
    return new Response(JSON.stringify({ caregiverName }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
