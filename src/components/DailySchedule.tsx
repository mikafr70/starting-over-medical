import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Sunrise, Sun, Moon, CheckCircle2, Plus } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";

interface Treatment {
  id: number;
  time: string;
  animalName: string;
  animalType: string;
  animalImage: string;
  treatmentType: string;
  caregiver: string;
  status: "pending" | "completed";
}

interface DailyScheduleProps {
  onSelectAnimal: (animalId: number) => void;
  onAddTreatment: () => void;
}

type TimePeriod = "morning" | "noon" | "evening";

interface TimeSection {
  id: TimePeriod;
  title: string;
  timeRange: string;
  icon: any;
  bgColor: string;
  headerBgColor: string;
}

const timeSections: TimeSection[] = [
  {
    id: "morning",
    title: "בוקר",
    timeRange: "06:00–11:59",
    icon: Sunrise,
    bgColor: "#FFFFFF",
    headerBgColor: "#E8F5E9"
  },
  {
    id: "noon",
    title: "צהריים",
    timeRange: "12:00–17:59",
    icon: Sun,
    bgColor: "#F7F3ED",
    headerBgColor: "#FFF9F0"
  },
  {
    id: "evening",
    title: "ערב",
    timeRange: "18:00–23:59",
    icon: Moon,
    bgColor: "#F5F5F5",
    headerBgColor: "#E3F2FD"
  }
];

const scheduleDays = [
  { date: "22.10.2025", day: "רביעי", isToday: true },
  { date: "23.10.2025", day: "חמישי", isToday: false },
  { date: "24.10.2025", day: "שישי", isToday: false },
  { date: "25.10.2025", day: "שבת", isToday: false },
];

const treatmentsByDay: Record<string, Treatment[]> = {
  "22.10.2025": [
    {
      id: 1,
      time: "08:00",
      animalName: "מקס",
      animalType: "כלב",
      animalImage: "https://images.unsplash.com/photo-1672664408117-a58d7e489264?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXNjdWVkJTIwZG9nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "בדיקת בוקר",
      caregiver: "דנה כהן",
      status: "completed"
    },
    {
      id: 2,
      time: "10:00",
      animalName: "לונה",
      animalType: "חתולה",
      animalImage: "https://images.unsplash.com/photo-1752966597883-fc8714aac10a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXQlMjByZXNjdWUlMjBhbmltYWx8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "מתן אנטיביוטיקה",
      caregiver: "יוסי לוי",
      status: "completed"
    },
    {
      id: 3,
      time: "14:00",
      animalName: "מקס",
      animalType: "כלב",
      animalImage: "https://images.unsplash.com/photo-1672664408117-a58d7e489264?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXNjdWVkJTIwZG9nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "תרופות יומיות",
      caregiver: "דנה כהן",
      status: "pending"
    },
    {
      id: 4,
      time: "16:30",
      animalName: "סנדי",
      animalType: "סוס",
      animalImage: "https://images.unsplash.com/photo-1688798498307-7a8ae27a3d27?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob3JzZSUyMGZhcm0lMjBhbmltYWx8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "החלפת חבישה",
      caregiver: "דנה כהן",
      status: "pending"
    },
    {
      id: 9,
      time: "19:00",
      animalName: "לונה",
      animalType: "חתולה",
      animalImage: "https://images.unsplash.com/photo-1752966597883-fc8714aac10a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXQlMjByZXNjdWUlMjBhbmltYWx8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "תרופות ערב",
      caregiver: "דנה כהן",
      status: "pending"
    }
  ],
  "23.10.2025": [
    {
      id: 5,
      time: "09:00",
      animalName: "שוקולד",
      animalType: "ארנב",
      animalImage: "https://images.unsplash.com/photo-1639060127790-01bf9ce1e048?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyYWJiaXQlMjBhbmltYWx8ZW58MXx8fHwxNzYxMTIwMzU5fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "בדיקת שיניים",
      caregiver: "ד״ר משה אבידן",
      status: "pending"
    },
    {
      id: 6,
      time: "10:00",
      animalName: "לונה",
      animalType: "חתולה",
      animalImage: "https://images.unsplash.com/photo-1752966597883-fc8714aac10a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXQlMjByZXNjdWUlMjBhbmltYWx8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "בדיקת מעקב",
      caregiver: "ד״ר משה אבידן",
      status: "pending"
    },
    {
      id: 10,
      time: "15:00",
      animalName: "מקס",
      animalType: "כלב",
      animalImage: "https://images.unsplash.com/photo-1672664408117-a58d7e489264?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXNjdWVkJTIwZG9nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYxMTI3MTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "תרופות יומיות",
      caregiver: "יוסי לוי",
      status: "pending"
    }
  ],
  "24.10.2025": [
    {
      id: 7,
      time: "09:00",
      animalName: "בילי",
      animalType: "עז",
      animalImage: "https://images.unsplash.com/photo-1629713816766-e6fcab2867bf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb2F0JTIwZmFybSUyMGFuaW1hbHxlbnwxfHx8fDE3NjEwNDA1NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "חיסון שנתי",
      caregiver: "ד״ר משה אבידן",
      status: "pending"
    }
  ],
  "25.10.2025": [
    {
      id: 8,
      time: "08:00",
      animalName: "צמר",
      animalType: "כבשה",
      animalImage: "https://images.unsplash.com/photo-1614183654058-0bac05af5ab0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaGVlcCUyMGZhcm18ZW58MXx8fHwxNzYxMTE5Mjg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
      treatmentType: "גזירת צמר ובדיקה",
      caregiver: "יוסי לוי",
      status: "pending"
    }
  ]
};

// Helper function to determine time period from time string
const getTimePeriod = (timeString: string): TimePeriod => {
  const [hours] = timeString.split(":").map(Number);
  
  if (hours >= 6 && hours < 12) return "morning";
  if (hours >= 12 && hours < 18) return "noon";
  return "evening";
};

// Helper function to group treatments by time period
const groupTreatmentsByPeriod = (treatments: Treatment[]) => {
  const grouped: Record<TimePeriod, Treatment[]> = {
    morning: [],
    noon: [],
    evening: []
  };

  treatments.forEach(treatment => {
    const period = getTimePeriod(treatment.time);
    grouped[period].push(treatment);
  });

  return grouped;
};

export function DailySchedule({ onSelectAnimal, onAddTreatment }: DailyScheduleProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [completedTreatments, setCompletedTreatments] = useState<Set<number>>(new Set([1, 2])); // Initialize with already completed treatments
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    treatmentId: number | null;
    isCompleted: boolean;
  }>({ open: false, treatmentId: null, isCompleted: false });
  
  const selectedDay = scheduleDays[selectedDayIndex];
  const treatments = treatmentsByDay[selectedDay.date] || [];
  const groupedTreatments = groupTreatmentsByPeriod(treatments);

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

  const handleCheckboxClick = (e: React.MouseEvent, treatmentId: number) => {
    e.stopPropagation(); // Prevent card click
    const isCurrentlyCompleted = completedTreatments.has(treatmentId);
    
    setConfirmDialog({
      open: true,
      treatmentId,
      isCompleted: isCurrentlyCompleted
    });
  };

  const handleConfirmToggle = () => {
    if (confirmDialog.treatmentId === null) return;

    const newCompletedTreatments = new Set(completedTreatments);
    
    if (confirmDialog.isCompleted) {
      // Unmarking as completed
      newCompletedTreatments.delete(confirmDialog.treatmentId);
      toast.success("הטיפול סומן כממתין");
    } else {
      // Marking as completed
      newCompletedTreatments.add(confirmDialog.treatmentId);
      toast.success("הטיפול סומן כבוצע");
    }
    
    setCompletedTreatments(newCompletedTreatments);
    setConfirmDialog({ open: false, treatmentId: null, isCompleted: false });
  };

  const handleCancelToggle = () => {
    setConfirmDialog({ open: false, treatmentId: null, isCompleted: false });
  };

  const renderTreatment = (treatment: Treatment) => {
    const isCompleted = completedTreatments.has(treatment.id);
    
    return (
      <Card
        key={treatment.id}
        className={`overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer ${
          isCompleted ? "opacity-60" : ""
        }`}
        onClick={() => onSelectAnimal(1)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Checkbox */}
            <div 
              className="flex-shrink-0"
              onClick={(e) => handleCheckboxClick(e, treatment.id)}
            >
              <Checkbox
                checked={isCompleted}
                className="w-6 h-6 rounded-md transition-all"
              />
            </div>

            <div
              className="flex items-center justify-center px-4 py-2 rounded-lg flex-shrink-0"
              style={{ backgroundColor: '#CFE4D3' }}
            >
              <div className="text-center">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="mt-1">{treatment.time}</div>
              </div>
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
              <p className="text-sm text-right">{treatment.treatmentType}</p>
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
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="mb-2 text-right text-[24px]">לוח זמנים יומי</h1>
          <p className="text-muted-foreground text-right">טיפולים מתוכננים לפי יום ושעה</p>
        </div>

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

        {treatments.length === 0 ? (
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
                        <p className="text-sm text-muted-foreground">{section.timeRange}</p>
                      </div>
                      <Badge variant="outline" className="mr-auto">
                        {sectionTreatments.length} טיפולים
                      </Badge>
                    </div>
                  </div>

                  <div 
                    className="p-4"
                    style={{ backgroundColor: section.bgColor }}
                  >
                    {sectionTreatments.length === 0 ? (
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
            <AlertDialogTitle>
              {confirmDialog.isCompleted ? "ביטול סימון טיפול" : "סימון טיפול כבוצע"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.isCompleted 
                ? "האם אתה בטוח שברצונך לסמן את הטיפול כממתין?" 
                : "האם אתה בטוח שברצונך לסמן את הטיפול כבוצע?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
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