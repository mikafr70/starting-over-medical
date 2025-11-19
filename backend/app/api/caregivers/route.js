import { getAllCaregivers } from '../../../utils/sheets';

export async function GET(req) {
  try {
    const caregivers = await getAllCaregivers();
    return new Response(JSON.stringify(caregivers), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
