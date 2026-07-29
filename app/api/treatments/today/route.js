import { getScheduledTreatmentsFromLog, ANIMAL_TREATMENT_SHEETS, ensureConfigLoaded, getAnimalPhoto } from '../../../../src/lib/sheets.js';

export const runtime = 'nodejs';
export const maxDuration = 300; // Set to 5 minutes (requires Vercel Pro)

// app/api/treatments/today/route.ts
export const dynamic = 'force-dynamic';      // don't pre-render at build
export const fetchCache = 'force-no-store';  // don't cache in the static cache

// optionally:
export const revalidate = 0;                 // disable ISR if present

// Only these animal types are shown on the shared daily schedule.
const allowedTypes = ['donkey', 'horse', 'sheep', 'goat', 'camel', 'mule'];

// Build the client-facing treatment objects for a single log record.
// Regular time-slot rows are grouped per slot; personal treatments are emitted
// individually; general treatments are skipped (shown elsewhere).
async function buildTreatmentsFromRecord(record, photoCache, dateObj, label) {
  const { animalType, animalName, fileId, treatmentTimes } = record;
  const sheets = ANIMAL_TREATMENT_SHEETS();
  const typeInfo = sheets[animalType];
  if (!typeInfo) return [];

  // Fetch photo once per animal.
  const cacheKey = `${animalType}_${animalName}`;
  if (!photoCache.has(cacheKey)) {
    try {
      photoCache.set(cacheKey, (await getAnimalPhoto(animalType, animalName)) || null);
    } catch (error) {
      photoCache.set(cacheKey, null);
    }
  }
  const animalPhoto = photoCache.get(cacheKey);

  const out = [];
  const groupedTreatments = new Map();

  for (const timeInfo of treatmentTimes) {
    if (timeInfo.timeSlot === 'personal') {
      out.push({
        id: `${animalType}_${fileId}_personal_${label}_${Math.random()}`,
        animalName,
        animalType: typeInfo.displayName,
        animalTypeKey: animalType,
        animalImage: animalPhoto || '',
        medicalCase: timeInfo.medicalCase || timeInfo.treatment || 'ללא תיאור',
        treatmentType: geteTreatmentTypeByTimeSlot(timeInfo.timeSlot),
        time: getTimeBySlot(timeInfo.timeSlot),
        timeSlot: 'personal',
        caregiver: timeInfo.caregiver || 'נקבע לפי זמינות',
        emoji: typeInfo.emoji,
        isCompleted: timeInfo.isCompleted || false,
        treatmentDate: dateObj.toISOString().split('T')[0],
        dateLabel: label,
        rowCount: 1,
        sourceFolderId: typeInfo.folderId
      });
    } else if (timeInfo.timeSlot !== 'general') {
      if (!groupedTreatments.has(timeInfo.timeSlot)) {
        groupedTreatments.set(timeInfo.timeSlot, []);
      }
      groupedTreatments.get(timeInfo.timeSlot).push(timeInfo);
    }
  }

  for (const [timeSlot, rows] of groupedTreatments.entries()) {
    const medicalCases = rows.map(r => r.medicalCase).filter(c => c && c.trim());
    const treatmentsList = rows.map(r => r.treatment).filter(t => t && t.trim());

    let displayText;
    if (medicalCases.length > 0) {
      displayText = medicalCases[0];
    } else if (treatmentsList.length > 0) {
      displayText = treatmentsList.join(', ');
    } else {
      displayText = 'ללא תיאור';
    }

    const isCompleted = rows.every(r => r.isCompleted === true);

    out.push({
      id: `${animalType}_${fileId}_${timeSlot}_${label}_${Math.random()}`,
      animalName,
      animalType: typeInfo.displayName,
      animalTypeKey: animalType,
      animalImage: animalPhoto || '',
      medicalCase: displayText,
      treatmentType: geteTreatmentTypeByTimeSlot(timeSlot),
      time: getTimeBySlot(timeSlot),
      timeSlot,
      caregiver: 'נקבע לפי זמינות',
      emoji: typeInfo.emoji,
      isCompleted,
      treatmentDate: dateObj.toISOString().split('T')[0],
      dateLabel: label,
      rowCount: rows.length
    });
  }

  return out;
}

export async function GET(request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔵 NEW API REQUEST [${requestId}] - Starting to fetch treatments`);
  console.log(`${'='.repeat(80)}\n`);

  const url = new URL(request.url);
  const useStreaming = url.searchParams.get('stream') !== 'false';

  // Optional ?date=YYYY-MM-DD (or DD/MM/YYYY) lets the client view other days.
  const dateParam = url.searchParams.get('date');

  try {
    await ensureConfigLoaded();

    const photoCache = new Map();

    // Resolve the requested date (defaults to today).
    let targetDate = new Date();
    if (dateParam) {
      const parsed = parseDateParam(dateParam);
      if (parsed) targetDate = parsed;
    }
    const dateStr = `${targetDate.getDate()}/${targetDate.getMonth() + 1}/${targetDate.getFullYear()}`;
    const isToday = targetDate.toDateString() === new Date().toDateString();
    const label = isToday ? 'today' : 'other';

    console.log(`Fetching treatments for ${dateStr} (label: ${label}) via treatment log...`);

    if (!useStreaming) {
      // Non-streaming: read the log, resolve all files, return one array.
      const records = await getScheduledTreatmentsFromLog(dateStr, allowedTypes);
      const allTreatments = [];
      for (const record of records) {
        const built = await buildTreatmentsFromRecord(record, photoCache, targetDate, label);
        allTreatments.push(...built);
      }

      console.log(`Found ${allTreatments.length} total treatments`);
      return Response.json({
        success: true,
        treatments: allTreatments,
        timestamp: new Date().toISOString()
      });
    }

    // Streaming response: emit each file's treatments the moment it's resolved.
    const encoder = new TextEncoder();
    let totalSent = 0;

    const streamResponse = new ReadableStream({
      async start(controller) {
        try {
          const ping = { type: 'ping', message: 'Stream started' };
          controller.enqueue(encoder.encode(JSON.stringify(ping) + '\n'));
          console.log('📡 Sent initial ping');

          let processedAnimalsCount = 0;

          const onFileChecked = async (record) => {
            const built = await buildTreatmentsFromRecord(record, photoCache, targetDate, label);
            if (built.length === 0) return;

            for (const treatment of built) {
              const data = JSON.stringify({ treatments: [treatment], more: true }) + '\n';
              controller.enqueue(encoder.encode(data));
              totalSent += 1;
              console.log(`📨 Sent treatment for ${treatment.animalName} (${treatment.timeSlot}) - total: ${totalSent}`);
            }

            processedAnimalsCount++;
            // Yield so Node.js flushes the HTTP buffer to the socket.
            await new Promise(resolve => setTimeout(resolve, 0));
          };

          console.log('🔄 Resolving scheduled treatments from log...');
          await getScheduledTreatmentsFromLog(dateStr, allowedTypes, onFileChecked);

          const finalChunk = {
            treatments: [],
            more: false,
            complete: true,
            total: totalSent
          };
          controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + '\n'));
          console.log(`✅ Streaming complete - sent ${totalSent} treatments for ${processedAnimalsCount} animals`);

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

// Accept both YYYY-MM-DD (HTML date input) and DD/MM/YYYY.
function parseDateParam(str) {
  if (!str) return null;
  if (str.includes('-')) {
    const [year, month, day] = str.split('-').map(Number);
    if (year && month && day) return new Date(year, month - 1, day);
  }
  if (str.includes('/')) {
    const [day, month, year] = str.split('/').map(Number);
    if (year && month && day) return new Date(year, month - 1, day);
  }
  return null;
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
