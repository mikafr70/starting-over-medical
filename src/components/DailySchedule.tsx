import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
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
  animalImage: string;
  treatmentType: string;
  medicalCase: string;
  time: string;
  timeSlot?: string; // morning, noon, evening, general
  caregiver: string;
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

  const selectedDay = scheduleDays[selectedDayIndex];

  // Fetch treatments from API
  useEffect(() => {
    const fetchTreatments = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/treatments/today');
        const data = await response.json();
        
        if (data.success) {
          console.log('Fetched treatments data:', data);
          // Convert API data to our Treatment interface
          const formattedTreatments: Treatment[] = data.treatments.map((treatment: any) => ({
            id: Math.abs(hashCode(treatment.id)), // Convert string ID to number
            animalName: treatment.animalName,
            animalType: treatment.animalType,
            animalImage: treatment.animalImage,
            treatmentType: treatment.treatmentType,
            medicalCase: treatment.medicalCase || 'ללא תיאור',
            time: treatment.time,
            timeSlot: treatment.timeSlot,
            caregiver: treatment.caregiver
          }));
          
          setTreatments(formattedTreatments);
          console.log(`Loaded ${formattedTreatments.length} treatments from Google Sheets`);
        } else {
          setError(data.error || 'Failed to fetch treatments');
          console.error('Failed to fetch treatments:', data.error);
        }
      } catch (err) {
        setError('Failed to connect to server');
        console.error('Error fetching treatments:', err);
      } finally {
        setLoading(false);
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
    // First, group by animal name + medical case to combine multiple time slots
    const byAnimalCase = treatments
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

  // Get all treatments for the overview (right side) - includes general treatments
  const overviewTreatments = treatments;

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
      params.set('profile', '1');
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
    onSelectAnimal(treatment.animalType, treatment.animalName);
  };

  const handleConfirmToggle = () => {
    if (!confirmDialog.treatmentKey) return;
    
    const newCompletedTreatments = new Set(completedTreatments);
    
    if (confirmDialog.isCompleted) {
      // Unmarking as completed
      newCompletedTreatments.delete(confirmDialog.treatmentKey);
      toast.success("הטיפול סומן כממתין");
    } else {
      // Marking as completed
      newCompletedTreatments.add(confirmDialog.treatmentKey);
      toast.success("הטיפול סומן כבוצע");
    }
    
    setCompletedTreatments(newCompletedTreatments);
    setConfirmDialog({ open: false, treatmentKey: null, isCompleted: false });
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
            <p className="text-lg font-semibold">מעבד...</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="mb-2 text-right text-[24px]">לוח זמנים יומי</h1>
          <p className="text-muted-foreground text-right">טיפולים מתוכננים לפי יום ושעה</p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="ml-2">טוען טיפולים מגוגל שיטס...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-right">שגיאה בטעינת הטיפולים: {error}</p>
          </div>
        )}

        {/* Split Layout Container */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Side: Current Schedule View */}
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

            {/* Right Side: Overall Treatments for Today */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-right">טיפולים כלליים להיום</CardTitle>
                  <CardDescription className="text-right">
                    סקירה כללית של כל הטיפולים המתוכננים ל-{selectedDay.date}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Statistics */}
                    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {overviewTreatments.filter(t => {
                            const key = `${t.animalName}_${t.medicalCase}_${t.timeSlot}`;
                            return completedTreatments.has(key);
                          }).length}
                        </div>
                        <div className="text-sm text-gray-600">בוצעו</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {overviewTreatments.filter(t => {
                            const key = `${t.animalName}_${t.medicalCase}_${t.timeSlot}`;
                            return !completedTreatments.has(key);
                          }).length}
                        </div>
                        <div className="text-sm text-gray-600">ממתינים</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{overviewTreatments.length}</div>
                        <div className="text-sm text-gray-600">סה"כ</div>
                      </div>
                    </div>

                    {/* Treatment Overview by Animal */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-right">טיפולים לפי חיה</h3>
                      {overviewTreatments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          אין טיפולים להיום
                        </div>
                      ) : (
                        Object.entries(
                          overviewTreatments.reduce((acc, treatment) => {
                            const key = treatment.animalName;
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(treatment);
                            return acc;
                          }, {} as Record<string, Treatment[]>)
                        ).map(([animalName, animalTreatments]) => (
                          <div key={animalName} className="p-3 border rounded-lg bg-white">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{animalName}</h4>
                              <Badge variant="outline">
                                {animalTreatments.length} טיפולים
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              {animalTreatments.map(treatment => {
                                const treatmentKey = `${treatment.animalName}_${treatment.medicalCase}_${treatment.timeSlot}`;
                                return (
                                  <div key={treatment.id} className="flex items-center justify-between text-sm">
                                    <span>{treatment.medicalCase}</span>
                                    <div className="flex items-center gap-1">
                                      {completedTreatments.has(treatmentKey) ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      ) : (
                                        <Clock className="w-4 h-4 text-orange-500" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
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