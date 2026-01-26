import { time } from 'console';
import { getRecentlyEditedFilesWithTreatmentsForDates, ANIMAL_TREATMENT_SHEETS ,ensureConfigLoaded, getAnimalPhoto} from '../../../../src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 300; // Set to 5 minutes (requires Vercel Pro)

// app/api/treatments/today/route.ts
export const dynamic = 'force-dynamic';      // don't pre-render at build
export const fetchCache = 'force-no-store';  // don't cache in the static cache

// optionally:
export const revalidate = 0;                 // disable ISR if present

export async function GET(request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔵 NEW API REQUEST [${requestId}] - Starting to fetch treatments`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Check if client supports streaming
  const url = new URL(request.url);
  const useStreaming = url.searchParams.get('stream') !== 'false';
  
  try {
    await ensureConfigLoaded();

    const photoCache = new Map(); // Cache photos to avoid duplicate fetches
    
    console.log('Starting to fetch treatments for today...');

    // Calculate today's date
    const today = new Date();
    
    const datesToFetch = [
      { date: today, label: 'today' }
    ];

    // Process animal types in parallel with limited concurrency
    // Filter to only include donkeys, horses, sheep, and goats
    const allowedTypes = ['donkey', 'horse', 'sheep', 'goat'];
    const animalTypes = Object.keys(ANIMAL_TREATMENT_SHEETS()).filter(
      type => allowedTypes.includes(type) && ANIMAL_TREATMENT_SHEETS()[type].folderId
    );
    
    console.log(`Processing animal types: ${animalTypes.join(', ')}`);
    
    if (!useStreaming) {
      // Original non-streaming behavior
      const allTreatments = [];
      
      await Promise.all(animalTypes.map(async (animalType) => {
        console.log(`Fetching treatments for ${animalType} from folder ${ANIMAL_TREATMENT_SHEETS()[animalType].folderId}`);
        
        try {
          const resultsByDate = await getRecentlyEditedFilesWithTreatmentsForDates(
            ANIMAL_TREATMENT_SHEETS()[animalType].folderId,
            datesToFetch.map(d => d.date)
          );
          
          for (const { date, label } of datesToFetch) {
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
            const result = resultsByDate[dateStr] || [];
            
            for (let i = 0; i < result.length; i += 2) {
              const fileName = result[i];
              const treatmentTimes = result[i + 1] || [];
            
              if (fileName && treatmentTimes.length > 0) {
                let animalName = fileName
                  .replace('.xlsx', '')
                  .replace('.xls', '')
                  .replace(/^עותק של\s+/i, '')
                  .trim();
                
                animalName = animalName.replace(/\s+\d{15}$/, '').trim();
                
                if (!animalName) {
                  animalName = fileName.replace('.xlsx', '').replace('.xls', '');
                }

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
                
                treatmentTimes.forEach(timeInfo => {
                  if (timeInfo.timeSlot === 'personal' || timeInfo.timeSlot === 'general') {
                    return;
                  }
                  
                  const medicalCaseValue = timeInfo.medicalCase || timeInfo.treatment || 'ללא תיאור';
                  
                  const treatment = {
                    id: `${animalType}_${fileName}_${timeInfo.timeSlot}_${label}_${Math.random()}`,
                    animalName: animalName,
                    animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                    animalTypeKey: animalType,
                    animalImage: animalPhoto || '',
                    medicalCase: medicalCaseValue,
                    treatmentType: geteTreatmentTypeByTimeSlot(timeInfo.timeSlot),
                    time: getTimeBySlot(timeInfo.timeSlot),
                    timeSlot: timeInfo.timeSlot,
                    caregiver: "נקבע לפי זמינות",
                    emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji,
                    isCompleted: timeInfo.isCompleted || false,
                    treatmentDate: date.toISOString().split('T')[0],
                    dateLabel: label
                  };
                  
                  allTreatments.push(treatment);
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching ${animalType}:`, error.message);
        }
      }));

      console.log(`Found ${allTreatments.length} total treatments`);
      return Response.json({
        success: true,
        treatments: allTreatments,
        timestamp: new Date().toISOString()
      });
    }
    
    // Streaming response: send chunks as they're ready
    const encoder = new TextEncoder();
    let totalSent = 0;
    
    const streamResponse = new ReadableStream({
      async start(controller) {
        try {
          // Send initial ping to open stream immediately
          const ping = { type: 'ping', message: 'Stream started' };
          controller.enqueue(encoder.encode(JSON.stringify(ping) + '\n'));
          console.log('📡 Sent initial ping');
          
          let pendingTreatments = [];
          let processedAnimalsCount = 0;
          const CHUNK_SIZE = 5; // Send every 5 animals
          
          // Function to send a chunk immediately
          const sendChunk = (treatments) => {
            if (treatments.length === 0) return;
            
            const chunk = {
              treatments: [...treatments], // Copy array
              more: true
            };
            const data = JSON.stringify(chunk) + '\n';
            controller.enqueue(encoder.encode(data));
            totalSent += treatments.length;
            console.log(`📦 ✨ SENT chunk with ${treatments.length} treatments (${processedAnimalsCount} animals processed, total treatments: ${totalSent})`);
          };
          
          console.log('🔄 Starting to process all animal types...');
          
          // Process ALL animal types and collect all animals
          for (const animalType of animalTypes) {
            console.log(`🐾 Processing ${animalType}...`);
            const startTime = Date.now();
            
            try {
              const resultsByDate = await getRecentlyEditedFilesWithTreatmentsForDates(
                ANIMAL_TREATMENT_SHEETS()[animalType].folderId,
                datesToFetch.map(d => d.date)
              );
              
              console.log(`✓ ${animalType} data fetched in ${Date.now() - startTime}ms`);
              
              // First, collect all unique animals across all dates
              const animalMap = new Map(); // Map of animalName -> { fileName, allTreatments: [{date, label, timeInfo}] }
              
              for (const { date, label } of datesToFetch) {
                const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
                const result = resultsByDate[dateStr] || [];
                
                console.log(`   📅 Processing ${animalType} for ${dateStr}: ${result.length / 2} animals found`);
                
                // Process each animal in this result
                for (let i = 0; i < result.length; i += 2) {
                  const fileName = result[i];
                  const treatmentTimes = result[i + 1] || [];
                
                  if (fileName && treatmentTimes.length > 0) {
                    let animalName = fileName
                      .replace('.xlsx', '')
                      .replace('.xls', '')
                      .replace(/^עותק של\s+/i, '')
                      .trim();
                    
                    animalName = animalName.replace(/\s+\d{15}$/, '').trim();
                    
                    if (!animalName) {
                      animalName = fileName.replace('.xlsx', '').replace('.xls', '');
                    }
                    
                    console.log(`      🐾 ${animalName}: ${treatmentTimes.length} total time slots`);
                    
                    // Add to map
                    if (!animalMap.has(animalName)) {
                      animalMap.set(animalName, { fileName, allTreatments: [] });
                    }
                    
                    // Group treatments by date and timeSlot to combine multiple rows
                    treatmentTimes.forEach(timeInfo => {
                      console.log(`         - Slot: ${timeInfo.timeSlot}, Treatment: ${timeInfo.treatment || timeInfo.medicalCase || 'N/A'}`);
                      if (timeInfo.timeSlot !== 'personal' && timeInfo.timeSlot !== 'general') {
                        animalMap.get(animalName).allTreatments.push({ date, label, timeInfo });
                      } else {
                        console.log(`         ⚠️ SKIPPED (personal/general)`);
                      }
                    });
                  }
                }
              }
              
              // Now process each unique animal
              for (const [animalName, animalData] of animalMap.entries()) {
                // Check if this animal has treatments for TODAY
                const todayTreatments = animalData.allTreatments.filter(t => t.label === 'today');
                
                // Only process animals that have treatments TODAY
                if (todayTreatments.length === 0) {
                  continue;
                }
                
                // Fetch photo once per animal
                const cacheKey = `${animalType}_${animalName}`;
                if (!photoCache.has(cacheKey)) {
                  try {
                    const photo = await getAnimalPhoto(animalType, animalName);
                    photoCache.set(cacheKey, photo || null);
                  } catch (error) {
                    photoCache.set(cacheKey, null);
                  }
                }
                
                const animalPhoto = photoCache.get(cacheKey);
                
                // Group treatments by date and timeSlot, combining multiple rows
                const groupedTreatments = new Map(); // key: `${dateLabel}_${timeSlot}`
                
                animalData.allTreatments.forEach(({ date, label, timeInfo }) => {
                  const key = `${label}_${timeInfo.timeSlot}`;
                  
                  if (!groupedTreatments.has(key)) {
                    groupedTreatments.set(key, {
                      date,
                      label,
                      timeSlot: timeInfo.timeSlot,
                      rows: []
                    });
                  }
                  
                  groupedTreatments.get(key).rows.push(timeInfo);
                });
                
                // Process each grouped treatment (one row per date+timeSlot combination)
                for (const [key, groupedData] of groupedTreatments.entries()) {
                  const { date, label, timeSlot, rows } = groupedData;
                  
                  // Determine display text: use medicalCase if any row has it, otherwise list all treatments
                  let displayText = '';
                  const medicalCases = rows.map(r => r.medicalCase).filter(c => c && c.trim());
                  const treatments = rows.map(r => r.treatment).filter(t => t && t.trim());
                  
                  if (medicalCases.length > 0) {
                    // If there's a medical case/reason, show it
                    displayText = medicalCases[0]; // Use the first medical case
                  } else if (treatments.length > 0) {
                    // Otherwise, show all treatments separated by commas
                    displayText = treatments.join(', ');
                  } else {
                    displayText = 'ללא תיאור';
                  }
                  
                  // Check if all rows have the same completion status
                  const allCompleted = rows.every(r => r.isCompleted === true);
                  const allIncomplete = rows.every(r => r.isCompleted === false);
                  const isCompleted = allCompleted; // Consider completed only if ALL rows are completed
                  
                  const treatment = {
                    id: `${animalType}_${animalData.fileName}_${timeSlot}_${label}_${Math.random()}`,
                    animalName: animalName,
                    animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                    animalTypeKey: animalType,
                    animalImage: animalPhoto || '',
                    medicalCase: displayText,
                    treatmentType: geteTreatmentTypeByTimeSlot(timeSlot),
                    time: getTimeBySlot(timeSlot),
                    timeSlot: timeSlot,
                    caregiver: "נקבע לפי זמינות",
                    emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji,
                    isCompleted: isCompleted,
                    treatmentDate: date.toISOString().split('T')[0],
                    dateLabel: label,
                    rowCount: rows.length // Track how many rows this represents
                  };
                  
                  pendingTreatments.push(treatment);
                }
                
                // Increment count and send chunk every CHUNK_SIZE animals
                processedAnimalsCount++;
                console.log(`   Animal ${processedAnimalsCount}: ${animalName} (${animalType}) - ${todayTreatments.length} today treatments, ${pendingTreatments.length} total pending`);
                
                if (processedAnimalsCount % CHUNK_SIZE === 0) {
                  console.log(`🎯 Reached ${CHUNK_SIZE} animals, sending chunk now!`);
                  sendChunk(pendingTreatments);
                  pendingTreatments = [];
                  // Small delay to avoid quota errors
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              }
              
            } catch (error) {
              console.error(`❌ Error processing ${animalType}:`, error.message);
            }
          }
          
          // Send any remaining treatments
          if (pendingTreatments.length > 0) {
            sendChunk(pendingTreatments);
          }
          
          // Send final completion message
          const finalChunk = {
            treatments: [],
            more: false,
            complete: true,
            total: totalSent
          };
          controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + '\n'));
          console.log(`✅ Streaming complete - sent ${totalSent} treatments total for ${processedAnimalsCount} animals with today treatments`);
          
        } catch (error) {
          console.error('❌ Streaming error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });
    
    return new Response(streamResponse, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Transfer-Encoding': 'chunked',
      },
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