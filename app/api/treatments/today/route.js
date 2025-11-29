import { time } from 'console';
import { getRecentlyEditedFilesInFolderWithTreatmentsToday, ANIMAL_TREATMENT_SHEETS ,ensureConfigLoaded} from '../../../../src/lib/sheets.js';
// app/api/treatments/today/route.ts
export const dynamic = 'force-dynamic';      // don't pre-render at build
export const fetchCache = 'force-no-store';  // don't cache in the static cache

// optionally:
export const revalidate = 0;                 // disable ISR if present

export async function GET() {
  try {
    await ensureConfigLoaded();

    const allTreatments = [];
    
    console.log('Starting to fetch treatments for today...');

    // Loop over all animal types and get treatments for today
    for (const animalType of Object.keys(ANIMAL_TREATMENT_SHEETS())) {
      if (!ANIMAL_TREATMENT_SHEETS()[animalType].folderId) {
        console.log(`Skipping ${animalType} - no folder ID configured`);
        continue;
      }

      console.log(`Fetching treatments for ${animalType} from folder ${ANIMAL_TREATMENT_SHEETS()[animalType].folderId}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const result = await getRecentlyEditedFilesInFolderWithTreatmentsToday(ANIMAL_TREATMENT_SHEETS()[animalType].folderId);
        console.log (`Received ${result.length} entries for ${animalType}`);
        if(result.length > 0) {
          //console.log('###### Entries:', result);
        }
        // The function returns an array like [fileName1, treatmentTimes1, fileName2, treatmentTimes2, ...]
        // Let's process this data properly
        for (let i = 0; i < result.length; i += 2) {
          const animalName = result[i];
          const treatmentTimes = result[i + 1] || [];
          
          if (animalName && treatmentTimes.length > 0) {
            // Create a treatment entry for each time slot
            treatmentTimes.forEach(timeSlot => {
              const treatment = {
                id: `${animalType}_${animalName}_${timeSlot}_${Date.now()}_${Math.random()}`,
                animalName: animalName.replace('.xlsx', '').replace('.xls', ''), // Remove file extension
                animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                animalTypeKey: animalType,
                animalImage: `/animal-avatars/${animalName.toLowerCase().replace('.xlsx', '').replace('.xls', '')}.jpg`,
                treatmentType: geteTreatmentTypeByTimeSlot(timeSlot),
                time: getTimeBySlot(timeSlot),
                timeSlot: timeSlot, // morning, noon, evening, general
                caregiver: "נקבע לפי זמינות",
                emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji
              };
              
              allTreatments.push(treatment);
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching treatments for ${animalType}:`, error);
      }
    }

    console.log(`Found ${allTreatments.length} total treatments for today`);
    
    return Response.json({
      success: true,
      treatments: allTreatments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching today\'s treatments:', error);
    return Response.json({
      success: false,
      error: error.message,
      treatments: []
    }, { status: 500 });
  }
}

function geteTreatmentTypeByTimeSlot(timeSlot) {
  switch (timeSlot) {
    case 'morning':
      return 'טיפול בוקר';
    case 'noon':
      return 'טיפול צהריים';
    case 'evening':
      return 'טיפול ערב';
    case 'general':
      return 'טיפול כללי';
    default:
      return 'טיפול';
  }
}

function getTimeBySlot(timeSlot) {
  switch (timeSlot) {
    case 'morning':
      return '08:00';
    case 'noon':
      return '14:00';
    case 'evening':
      return '19:00';
    case 'general':
      return '12:00';
    default:
      return '12:00';
  }
}