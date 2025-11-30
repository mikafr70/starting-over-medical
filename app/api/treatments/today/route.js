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
          const fileName = result[i];
          const treatmentTimes = result[i + 1] || [];
          
          if (fileName && treatmentTimes.length > 0) {
            // Extract animal name from filename
            // Format: "עותק של <name> <id>" or just "<name> <id>" or "<name>.xlsx"
            let animalName = fileName
              .replace('.xlsx', '')
              .replace('.xls', '')
              .replace(/^עותק של\s+/i, '') // Remove "עותק של " prefix
              .trim();
            
            // Remove the ID number at the end if present (e.g., "939000007662875")
            animalName = animalName.replace(/\s+\d{15}$/, '').trim();
            
            // If still no name extracted, use the filename as-is
            if (!animalName) {
              animalName = fileName.replace('.xlsx', '').replace('.xls', '');
            }
            
            // Create a treatment entry for each time slot
            treatmentTimes.forEach(timeInfo => {
              const treatment = {
                id: `${animalType}_${fileName}_${timeInfo.timeSlot}_${Date.now()}_${Math.random()}`,
                animalName: animalName,
                animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                animalTypeKey: animalType,
                animalImage: `/animal-avatars/${animalName.toLowerCase()}.jpg`,
                medicalCase: timeInfo.medicalCase || 'ללא תיאור',
                treatmentType: geteTreatmentTypeByTimeSlot(timeInfo.timeSlot),
                time: getTimeBySlot(timeInfo.timeSlot),
                timeSlot: timeInfo.timeSlot, // morning, noon, evening, general
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