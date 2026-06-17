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
    // Filter to only include donkeys, horses, sheep, goats, camels, and mules
    const allowedTypes = ['donkey', 'horse', 'sheep', 'goat', 'camel', 'mule'];
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
          
          let processedAnimalsCount = 0;

          // Send a single treatment immediately as it's found
          const sendTreatment = (treatment) => {
            const data = JSON.stringify({ treatments: [treatment], more: true }) + '\n';
            controller.enqueue(encoder.encode(data));
            totalSent += 1;
            console.log(`📨 Sent treatment for ${treatment.animalName} (${treatment.timeSlot}) - total: ${totalSent}`);
          };
          
          console.log('🔄 Starting to process all animal types...');
          
          // Process ALL animal types. Each file's treatments are sent to the
          // client the moment that file is checked, instead of waiting for
          // the whole folder (all ~20-30 files) to be scanned first.
          for (const animalType of animalTypes) {
            const folderIdUsed = ANIMAL_TREATMENT_SHEETS()[animalType].folderId;
            console.log(`🐾 Processing ${animalType}... (folderId: ${folderIdUsed})`);
            const startTime = Date.now();
            const { date, label } = datesToFetch[0];
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

            const onFileChecked = async (fileName, dateResults) => {
              const fileResult = dateResults[dateStr];
              if (!fileResult || !fileResult.hasTreatment) return;

              const treatmentTimes = fileResult.treatmentTimes || [];
              if (treatmentTimes.length === 0) return;

              let animalName = fileName
                .replace('.xlsx', '')
                .replace('.xls', '')
                .replace(/^עותק של\s+/i, '')
                .trim();
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
                  photoCache.set(cacheKey, null);
                }
              }
              const animalPhoto = photoCache.get(cacheKey);

              // Group regular treatments by timeSlot to combine multiple rows;
              // personal treatments are sent individually, general ones skipped.
              const groupedTreatments = new Map();
              for (const timeInfo of treatmentTimes) {
                if (timeInfo.timeSlot === 'personal') {
                  const personalTreatment = {
                    id: `${animalType}_${fileName}_personal_${label}_${Math.random()}`,
                    animalName,
                    animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                    animalTypeKey: animalType,
                    animalImage: animalPhoto || '',
                    medicalCase: timeInfo.medicalCase || timeInfo.treatment || 'ללא תיאור',
                    treatmentType: geteTreatmentTypeByTimeSlot(timeInfo.timeSlot),
                    time: getTimeBySlot(timeInfo.timeSlot),
                    timeSlot: 'personal',
                    caregiver: timeInfo.caregiver || 'נקבע לפי זמינות',
                    emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji,
                    isCompleted: timeInfo.isCompleted || false,
                    treatmentDate: date.toISOString().split('T')[0],
                    dateLabel: label,
                    rowCount: 1,
                    sourceFolderId: folderIdUsed
                  };
                  sendTreatment(personalTreatment);
                } else if (timeInfo.timeSlot !== 'general') {
                  if (!groupedTreatments.has(timeInfo.timeSlot)) {
                    groupedTreatments.set(timeInfo.timeSlot, []);
                  }
                  groupedTreatments.get(timeInfo.timeSlot).push(timeInfo);
                }
              }

              for (const [timeSlot, rows] of groupedTreatments.entries()) {
                let displayText = '';
                const medicalCases = rows.map(r => r.medicalCase).filter(c => c && c.trim());
                const treatmentsList = rows.map(r => r.treatment).filter(t => t && t.trim());

                if (medicalCases.length > 0) {
                  displayText = medicalCases[0];
                } else if (treatmentsList.length > 0) {
                  displayText = treatmentsList.join(', ');
                } else {
                  displayText = 'ללא תיאור';
                }

                const isCompleted = rows.every(r => r.isCompleted === true);

                const treatment = {
                  id: `${animalType}_${fileName}_${timeSlot}_${label}_${Math.random()}`,
                  animalName,
                  animalType: ANIMAL_TREATMENT_SHEETS()[animalType].displayName,
                  animalTypeKey: animalType,
                  animalImage: animalPhoto || '',
                  medicalCase: displayText,
                  treatmentType: geteTreatmentTypeByTimeSlot(timeSlot),
                  time: getTimeBySlot(timeSlot),
                  timeSlot,
                  caregiver: "נקבע לפי זמינות",
                  emoji: ANIMAL_TREATMENT_SHEETS()[animalType].emoji,
                  isCompleted,
                  treatmentDate: date.toISOString().split('T')[0],
                  dateLabel: label,
                  rowCount: rows.length
                };

                sendTreatment(treatment);
              }

              processedAnimalsCount++;
              console.log(`   Animal ${processedAnimalsCount}: ${animalName} (${animalType}) - sent immediately`);
              // Yield to macrotask queue so Node.js flushes the HTTP buffer to the socket.
              // Without this, synchronous enqueue calls after a cached-photo microtask
              // are never flushed until controller.close() fires.
              await new Promise(resolve => setTimeout(resolve, 0));
            };

            try {
              await getRecentlyEditedFilesWithTreatmentsForDates(
                ANIMAL_TREATMENT_SHEETS()[animalType].folderId,
                datesToFetch.map(d => d.date),
                onFileChecked
              );

              console.log(`✓ ${animalType} data fetched in ${Date.now() - startTime}ms`);
            } catch (error) {
              console.error(`❌ Error processing ${animalType}:`, error.message);
            }
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