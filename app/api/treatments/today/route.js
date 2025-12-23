import { time } from 'console';
import { getRecentlyEditedFilesInFolderWithTreatmentsToday, ANIMAL_TREATMENT_SHEETS ,ensureConfigLoaded, getAnimalPhoto} from '../../../../src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 300; // Set to 5 minutes (requires Vercel Pro)

// app/api/treatments/today/route.ts
export const dynamic = 'force-dynamic';      // don't pre-render at build
export const fetchCache = 'force-no-store';  // don't cache in the static cache

// optionally:
export const revalidate = 0;                 // disable ISR if present

export async function GET() {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔵 NEW API REQUEST [${requestId}] - Starting to fetch treatments`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    await ensureConfigLoaded();

    const allTreatments = [];
    const photoCache = new Map(); // Cache photos to avoid duplicate fetches
    
    console.log('Starting to fetch treatments for today only (optimized for performance)...');

    // Only fetch today's treatments to avoid timeout
    const today = new Date();
    
    const datesToFetch = [
      { date: today, label: 'today' }
    ];
    
    // If you need yesterday/tomorrow, consider implementing a separate endpoint
    // or upgrading to Vercel Pro for longer function execution time

    // Process animal types in parallel with limited concurrency
    const animalTypes = Object.keys(ANIMAL_TREATMENT_SHEETS()).filter(
      type => ANIMAL_TREATMENT_SHEETS()[type].folderId
    );
    
    // Process ALL animal types in parallel to maximize speed
    const CONCURRENT_ANIMAL_TYPES = animalTypes.length; // Process all at once
    
    for (let i = 0; i < animalTypes.length; i += CONCURRENT_ANIMAL_TYPES) {
      const batch = animalTypes.slice(i, i + CONCURRENT_ANIMAL_TYPES);
      
      await Promise.all(batch.map(async (animalType) => {
        console.log(`Fetching treatments for ${animalType} from folder ${ANIMAL_TREATMENT_SHEETS()[animalType].folderId}`);
        
        // Fetch all three dates in parallel for this animal type
        const dateResults = await Promise.all(datesToFetch.map(async ({ date, label }) => {
          try {
            const result = await getRecentlyEditedFilesInFolderWithTreatmentsToday(
              ANIMAL_TREATMENT_SHEETS()[animalType].folderId,
              date
            );
            console.log(`Received ${result.length} entries for ${animalType} on ${label}`);
            return { result, date, label, animalType };
          } catch (error) {
            console.error(`Error fetching ${animalType} for ${label}:`, error.message);
            return { result: [], date, label, animalType };
          }
        }));
        
        // Process results for this animal type
        for (const { result, date, label, animalType } of dateResults) {
          // The function returns an array like [fileName1, treatmentTimes1, fileName2, treatmentTimes2, ...]
          for (let i = 0; i < result.length; i += 2) {
            const fileName = result[i];
            const treatmentTimes = result[i + 1] || [];
            
            if (fileName && treatmentTimes.length > 0) {
              // Extract animal name from filename
              let animalName = fileName
                .replace('.xlsx', '')
                .replace('.xls', '')
                .replace(/^עותק של\s+/i, '') // Remove "עותק של " prefix
                .trim();
              
              // Remove the ID number at the end if present
              animalName = animalName.replace(/\s+\d{15}$/, '').trim();
              
              if (!animalName) {
                animalName = fileName.replace('.xlsx', '').replace('.xls', '');
              }

              // Fetch photo once per animal
              const cacheKey = `${animalType}_${animalName}`;
              if (!photoCache.has(cacheKey)) {
                try {
                  const photo = await getAnimalPhoto(animalType, animalName);
                  photoCache.set(cacheKey, photo || null);
                } catch (error) {
                  console.log(`No photo found for ${animalName} (${animalType})`);
                  photoCache.set(cacheKey, null);
                }
              }
              
              const animalPhoto = photoCache.get(cacheKey);
              
              // Create a treatment entry for each time slot
              treatmentTimes.forEach(timeInfo => {
                const treatment = {
                  id: `${animalType}_${fileName}_${timeInfo.timeSlot}_${label}_${Math.random()}`,
                  animalName: animalName,
                  animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                  animalTypeKey: animalType,
                  animalImage: animalPhoto || '',
                  medicalCase: timeInfo.medicalCase || 'ללא תיאור',
                  treatmentType: geteTreatmentTypeByTimeSlot(timeInfo.timeSlot),
                  time: getTimeBySlot(timeInfo.timeSlot),
                  timeSlot: timeInfo.timeSlot,
                  caregiver: "נקבע לפי זמינות",
                  emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji,
                  isCompleted: timeInfo.isCompleted || false,
                  treatmentDate: date.toISOString().split('T')[0], // Add date field
                  dateLabel: label // Add label field (yesterday/today/tomorrow)
                };
                
                allTreatments.push(treatment);
              });
            }
          }
        }
      }));
    }

    console.log(`Found ${allTreatments.length} total treatments for today`);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ API REQUEST [${requestId}] COMPLETE - Returning ${allTreatments.length} treatments`);
    console.log(`${'='.repeat(80)}\n`);
    
    return Response.json({
      success: true,
      treatments: allTreatments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ API REQUEST ERROR:`, error);
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