import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Sunrise, Sun, Moon, CheckCircle2, Plus, Loader2 } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";

interface Treatment {
  id: number;
  animalName: string;
  animalType: string;
  animalTypeKey: string;
  animalImage: string;
  treatmentType: string;
  medicalCase: string;
  time: string;
  timeSlot: string; // morning, noon, evening, general
  caregiver: string;
  isCompleted?: boolean;
  treatmentDate?: string; // ISO date string (YYYY-MM-DD)
  dateLabel?: string; // yesterday, today, tomorrow
}

interface DailyScheduleProps {
  onSelectAnimal: (animalName: string, animalType: string) => void;
  onAddTreatment: () => void;
}

interface ConfirmDialog {
  open: boolean;
  treatmentKey: string | null;
  isCompleted: boolean;
}

const timeSections = [
  {
    id: "morning",
    title: "בוקר",
    icon: Sunrise,
    headerBgColor: "#FFF2CC",
    bgColor: "#FFFBF0"
  },
  {
    id: "afternoon", 
    title: "צהריים",
    icon: Sun,
    headerBgColor: "#FFE6CC",
    bgColor: "#FFF8F0"
  },
  {
    id: "evening",
    title: "ערב",
    icon: Moon,
    headerBgColor: "#E6F3FF",
    bgColor: "#F0F8FF"
  }
];

// Helper function to get Hebrew day name
const getHebrewDayName = (date: Date): string => {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[date.getDay()];
};

// Helper function to format date as DD.MM.YYYY
const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

// Generate schedule days dynamically (2 days before today, today, 2 days after)
const generateScheduleDays = () => {
  const today = new Date();
  const days = [];
  
  for (let i = -2; i <= 2; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      date: formatDate(date),
      day: getHebrewDayName(date),
      isToday: i === 0,
      dateObj: date
    });
  }
  
  return days;
};

export default function DailySchedule({ onSelectAnimal, onAddTreatment }: DailyScheduleProps) {
  const [scheduleDays] = useState(generateScheduleDays());
  const [selectedDayIndex, setSelectedDayIndex] = useState(2); // Index 2 is today (middle of the array)
  const [completedTreatments, setCompletedTreatments] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ 
    open: boolean; 
    treatmentKey: string | null; 
    isCompleted: boolean 
  }>({ 
    open: false, 
    treatmentKey: null, 
    isCompleted: false 
  });
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Ref to prevent duplicate fetches
  const fetchInProgressRef = useRef(false);

  const selectedDay = scheduleDays[selectedDayIndex];

  // Fetch treatments from API with streaming support
  useEffect(() => {
    const fetchTreatments = async () => {
      // Prevent duplicate fetches
      if (fetchInProgressRef.current) {
        console.log('⚠️ Fetch already in progress, skipping duplicate call');
        return;
      }

      try {
        fetchInProgressRef.current = true;
        setLoading(true);
        setError(null);
        
        console.log('🚀 Starting streaming fetch...');
        const response = await fetch('/api/treatments/today?stream=true');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('Stream not available');
        }
        
        let buffer = '';
        const allTreatments: Treatment[] = [];
        const initialCompleted = new Set<string>();
        
        const processLine = (line: string) => {
            if (!line.trim()) return;
            try {
              const chunk = JSON.parse(line);
              if (chunk.type === 'ping') return;
              if (chunk.complete) {
                console.log(`✅ Complete - ${chunk.total} treatments`);
                setLoading(false);
                return;
              }
              if (chunk.treatments && chunk.treatments.length > 0) {
                const formattedChunk: Treatment[] = chunk.treatments.map((treatment: any) => ({
                  id: Math.abs(hashCode(treatment.id)),
                  animalName: treatment.animalName,
                  animalType: treatment.animalType,
                  animalTypeKey: treatment.animalTypeKey,
                  animalImage: treatment.animalImage,
                  treatmentType: treatment.treatmentType,
                  medicalCase: treatment.medicalCase || 'ללא תיאור',
                  time: treatment.time,
                  timeSlot: treatment.timeSlot,
                  caregiver: treatment.caregiver,
                  isCompleted: treatment.isCompleted || false,
                  treatmentDate: treatment.treatmentDate,
                  dateLabel: treatment.dateLabel
                }));
                allTreatments.push(...formattedChunk);
                formattedChunk.forEach(treatment => {
                  if (treatment.isCompleted) {
                    const key = `${treatment.animalName}_${treatment.medicalCase}_${treatment.timeSlot}`;
                    initialCompleted.add(key);
                  }
                });
                setTreatments([...allTreatments]);
                setCompletedTreatments(new Set(initialCompleted));
                const timestamp = new Date().toLocaleTimeString();
                console.log(`📦 [${timestamp}] +${formattedChunk.length} (total: ${allTreatments.length})`);
              }
            } catch (parseError) {
              console.error('Parse error:', parseError);
            }
          };

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line);
          }
        }

        // Flush decoder and process any remaining data after stream ends
        buffer += decoder.decode();
        if (buffer.trim()) {
          processLine(buffer);
        }
        
      } catch (err) {
        console.error('Error fetching treatments:', err);
        setError('Failed to load treatments');
      } finally {
        setLoading(false);
        fetchInProgressRef.current = false;
      }
    };

    fetchTreatments();
  }, []);

  // Helper function to convert string to number hash
  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  };

  // Group treatments by animal+case combination, then by time section
  const groupedTreatments = (() => {
    // Filter treatments by selected date first
    const selectedDateStr = selectedDay.dateObj.toISOString().split('T')[0];
    console.log('Selected date string:', selectedDateStr);
    console.log('Total treatments before filtering:', treatments.length);
    console.log('Sample treatment dates:', treatments.slice(0, 3).map(t => ({ name: t.animalName, date: t.treatmentDate })));
    
    const filteredByDate = treatments.filter(t => t.treatmentDate === selectedDateStr);
    console.log('Treatments after date filtering:', filteredByDate.length);
    
    // First, group by animal name + medical case to combine multiple time slots
    const byAnimalCase = filteredByDate
      .filter(treatment => treatment.timeSlot !== 'general')
      .reduce((acc, treatment) => {
        const key = `${treatment.animalName}_${treatment.medicalCase}`;
        if (!acc[key]) {
          acc[key] = {
            ...treatment,
            timeSlots: [treatment.timeSlot]
          };
        } else {
          // Add this time slot to the existing entry
          if (!acc[key].timeSlots.includes(treatment.timeSlot)) {
            acc[key].timeSlots.push(treatment.timeSlot);
          }
        }
        return acc;
      }, {} as Record<string, Treatment & { timeSlots: string[] }>);
    
    // Then organize by time section - add to ALL sections where the treatment appears
    // Create unique IDs for each time section instance
    return Object.values(byAnimalCase).reduce((acc, treatment) => {
      // Add treatment to each time section it belongs to
      treatment.timeSlots.forEach(timeSlot => {
        let section: string;
        
        switch (timeSlot) {
          case 'morning':
            section = "morning";
            break;
          case 'noon':
            section = "afternoon";
            break;
          case 'evening':
            section = "evening";
            break;
          default:
            section = "morning";
        }
        
        if (!acc[section]) acc[section] = [];
        // Create a unique treatment instance for this specific time slot
        const uniqueTreatment = {
          ...treatment,
          timeSlot: timeSlot, // Set the correct timeSlot for this instance
          id: Math.abs(hashCode(`${treatment.animalName}_${treatment.medicalCase}_${timeSlot}`))
        };
        acc[section].push(uniqueTreatment);
      });
      
      return acc;
    }, {} as Record<string, (Treatment & { timeSlots: string[] })[]>);
  })();

  // Get all treatments for the overview (right side) - filter by selected date and exclude general treatments
  const selectedDateStr = selectedDay.dateObj.toISOString().split('T')[0];
  const overviewTreatments = treatments.filter(t => 
    t.treatmentDate === selectedDateStr && t.timeSlot !== 'general'
  );

  const nextDay = () => {
    if (selectedDayIndex < scheduleDays.length - 1) {
      setSelectedDayIndex(selectedDayIndex + 1);
    }
  };

  const prevDay = () => {
    if (selectedDayIndex > 0) {
      setSelectedDayIndex(selectedDayIndex - 1);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent, treatment: Treatment) => {
    e.stopPropagation();
    
    // Create unique key combining animal name, case, and time slot
    const treatmentKey = `${treatment.animalName}_${treatment.medicalCase}_${treatment.timeSlot}`;
    const isCompleted = completedTreatments.has(treatmentKey);
    setConfirmDialog({ 
      open: true, 
      treatmentKey, 
      isCompleted 
    });
  };

  // When clicking a treatment item: call the treatments profile endpoint by name/type
  const handleTreatmentClick = async (treatment: Treatment) => {
    setIsProcessing(true);
    try {
      const params = new URLSearchParams();
      // temp temp temp temp temp temp temp temp temp
      //params.set('profile', '1');
      params.set('profile', '555');
      params.set('animalType', treatment.animalType);
      params.set('animalName', treatment.animalName);
      const url = `/api/treatments?${params.toString()}`;
      console.log('Fetching treatment profile for click:', url);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('Profile fetch failed for', treatment.animalName, res.status);
      } else {
        const data = await res.json();
        console.log('Profile fetch returned:', data);
      }
    } catch (err) {
      console.error('Error fetching profile on click:', err);
    } finally {
      setIsProcessing(false);
    }
    // Navigate to profile view using the provided callback (type first, then name)
    onSelectAnimal(treatment.animalTypeKey, treatment.animalName);
  };

  const handleConfirmToggle = async () => {
    if (!confirmDialog.treatmentKey) return;
    
    // Extract treatment info from the key
    const [animalName, medicalCase, timeSlot] = confirmDialog.treatmentKey.split('_');
    
    // Find the treatment to get animalType
    const treatment = treatments.find(t => 
      `${t.animalName}_${t.medicalCase}_${t.timeSlot}` === confirmDialog.treatmentKey
    );
    
    if (!treatment) {
      toast.error('לא נמצא טיפול');
      setConfirmDialog({ open: false, treatmentKey: null, isCompleted: false });
      return;
    }
    
    const newCompletedState = !confirmDialog.isCompleted;
    
    try {
      setIsProcessing(true);
      
      // Call API to update the Google Sheet
      const response = await fetch('/api/treatments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animalName: treatment.animalName,
          animalType: treatment.animalType,
          medicalCase: treatment.medicalCase,
          timeSlot: treatment.timeSlot,
          isCompleted: newCompletedState
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update treatment');
      }
      
      // Update local state only after successful API call
      const newCompletedTreatments = new Set(completedTreatments);
      
      if (newCompletedState) {
        newCompletedTreatments.add(confirmDialog.treatmentKey);
        toast.success("הטיפול סומן כבוצע");
      } else {
        newCompletedTreatments.delete(confirmDialog.treatmentKey);
        toast.success("הטיפול סומן כממתין");
      }
      
      setCompletedTreatments(newCompletedTreatments);
      
    } catch (error) {
      console.error('Error updating treatment:', error);
      toast.error('שגיאה בעדכון הטיפול');
    } finally {
      setIsProcessing(false);
      setConfirmDialog({ open: false, treatmentKey: null, isCompleted: false });
    }
  };

  const handleCancelToggle = () => {
    setConfirmDialog({ open: false, treatmentKey: null, isCompleted: false });
  };

  const renderTreatment = (treatment: Treatment) => {
    const treatmentKey = `${treatment.animalName}_${treatment.medicalCase}_${treatment.timeSlot}`;
    const isCompleted = completedTreatments.has(treatmentKey);
    
    return (
      <Card
        key={treatment.id}
        className={`overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer ${
          isCompleted ? "opacity-60" : ""
        }`}
        onClick={() => handleTreatmentClick(treatment)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Checkbox */}
            <div 
              className="flex-shrink-0"
              onClick={(e) => handleCheckboxClick(e, treatment)}
            >
              <Checkbox
                checked={isCompleted}
                className="w-6 h-6 rounded-md transition-all"
              />
            </div>

            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
              <ImageWithFallback
                src={treatment.animalImage}
                alt={treatment.animalName}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3>{treatment.animalName}</h3>
                <span className="text-sm text-muted-foreground">({treatment.animalType})</span>
              </div>
              <p className="text-sm text-right font-medium">{treatment.medicalCase}</p>
              <p className="text-sm text-muted-foreground text-right">מטפל/ת: {treatment.caregiver}</p>
            </div>

            <div className="flex items-center gap-2">
              {isCompleted ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 animate-in zoom-in duration-300" />
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    בוצע
                  </Badge>
                </>
              ) : (
                <Badge variant="outline">ממתין</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg font-semibold"></p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="mb-2 text-right text-[24px]">לוח זמנים יומי</h1>
          <p className="text-muted-foreground text-right">טיפולים מתוכננים לפי יום ושעה</p>
        </div>

        {/* Loading State - Show spinner but don't hide content */}
        {loading && treatments.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <span className="ml-2">טוען טיפולים...</span>
          </div>
        )}
        
        {/* Loading indicator when streaming (show count) */}
        {loading && treatments.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-blue-700">טוען... ({treatments.length} טיפולים נטענו)</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-right">שגיאה בטעינת הטיפולים: {error}</p>
          </div>
        )}

        {/* Full Width Schedule - Show always, even while loading */}
        <div className="space-y-6">
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={prevDay}
                      disabled={selectedDayIndex === 0}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>

                    <div className="text-center">
                      <CardTitle className="flex items-center justify-center gap-2">
                        <CalendarIcon className="w-5 h-5" />
                        {selectedDay.day}, {selectedDay.date}
                      </CardTitle>
                      {selectedDay.isToday && (
                        <Badge className="mt-2" style={{ backgroundColor: '#CFE4D3', color: '#333333' }}>
                          היום
                        </Badge>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={nextDay}
                      disabled={selectedDayIndex === scheduleDays.length - 1}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {treatments.filter(t => t.timeSlot !== 'general').length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    אין טיפולים מתוכננים ליום זה
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {timeSections.map((section) => {
                    const sectionTreatments = groupedTreatments[section.id];
                    const Icon = section.icon;

                    return (
                      <div key={section.id} className="rounded-xl overflow-hidden border" style={{ borderColor: '#E7E7E7' }}>
                        <div 
                          className="p-4 border-b" 
                          style={{ 
                            backgroundColor: section.headerBgColor,
                            borderColor: '#E7E7E7'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-6 h-6" style={{ color: '#A67C52' }} />
                            <div>
                              <h3 className="text-right">{section.title}</h3>
                            </div>
                            <Badge variant="outline" className="mr-auto">
                              {sectionTreatments?.length || 0} טיפולים
                            </Badge>
                          </div>
                        </div>

                        <div 
                          className="p-4"
                          style={{ backgroundColor: section.bgColor }}
                        >
                          {!sectionTreatments || sectionTreatments.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              אין טיפולים מתוכננים ב{section.title.toLowerCase()}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {sectionTreatments.map(renderTreatment)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
        </div>

        {/* Add Treatment Button - Desktop */}
        <div className="hidden md:block fixed top-24 left-8 z-10">
          <Button
            onClick={onAddTreatment}
            className="gap-2 shadow-lg"
            size="lg"
          >
            <Plus className="w-5 h-5" />
            הוסף טיפול
          </Button>
        </div>

        {/* Add Treatment Button - Mobile (Floating) */}
        <Button
          onClick={onAddTreatment}
          className="md:hidden fixed bottom-6 left-6 z-10 w-14 h-14 rounded-full shadow-xl p-0"
          size="icon"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && handleCancelToggle()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {confirmDialog.isCompleted ? "ביטול סימון טיפול" : "סימון טיפול כבוצע"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {confirmDialog.isCompleted 
                ? "האם אתה בטוח שברצונך לסמן את הטיפול כממתין?" 
                : "האם אתה בטוח שברצונך לסמן את הטיפול כבוצע?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 flex justify-center sm:justify-center">
            <AlertDialogCancel onClick={handleCancelToggle}>
              ביטול
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmToggle}
              style={{ backgroundColor: '#A67C52' }}
              className="hover:opacity-90"
            >
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}