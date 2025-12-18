'use client';

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Loader2, Pill, UserMinus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import React from "react";

interface Treatment {
  date: string;
  day: string;
  morning: string;
  noon: string;
  evening: string;
  treatment: string;
  dosage: string;
  administration: string;
  duration: string;
  location: string;
  case: string;
  notes: string;
}

interface GeneralTreatment {
  animalName: string;
  animalType: string;
  animalTypeKey: string;
  treatment: string;
  medicalCase: string;
  dosage: string;
  date: string;
  image?: string;
}

interface Animal {
  id: string;
  id2?: string;
  name: string;
  sex?: string;
  description?: string;
  weight?: string;
  arrival_date?: string;
  birth_date?: string;
  location?: string;
  special_trimming?: string;
  notes?: string;
  drugs?: string;
  castration?: string;
  deworming?: string;
  source?: string;
  status?: string;
  friends?: string;
  in_treatment?: string;
  animalType: string;
  image?: string;
  uncheckedTreatments?: Treatment[];
}
const animalTypeToHebrew: { [key: string]: string } = {
    donkey: "חמור", 
    horse: "סוס", 
    goat: "עז",
    sheep: "כבשה", 
    pig: "חזיר", 
    cow: "פרה",
    cat: "חתול", 
    rabbit: "ארנב", 
    poultrey: "עוף",
    dog: "כלב"
};  

interface PersonalTreatmentsProps {
  onSelectAnimal: (animalType: string, animalName: string) => void;
  email: string;
}

export function PersonalTreatments({ onSelectAnimal, email }: PersonalTreatmentsProps) {
  const [caregiverName, setCaregiverName] = useState<string>("");
  const [animalsForTodayList, setAnimalsForTodayList] = useState<Animal[]>([]);
  const [generalTreatments, setGeneralTreatments] = useState<GeneralTreatment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [confirmRemoveDialogOpen, setConfirmRemoveDialogOpen] = useState(false);
  const [selectedAnimalToRemove, setSelectedAnimalToRemove] = useState<string>("");
  const [isRemoving, setIsRemoving] = useState(false);
  const isFetchingRef = useRef(false);
  const lastEmailRef = useRef<string>("");

  useEffect(() => {
    async function fetchCaregiverAndAnimals() {
      console.log('🔵 PersonalTreatments useEffect called, email:', email);
      console.log('🔵 isFetchingRef.current:', isFetchingRef.current);
      console.log('🔵 lastEmailRef.current:', lastEmailRef.current);
      
      if (!email) {
        console.log('⚠️ No email, skipping fetch');
        setIsLoading(false);
        return;
      }

      // Prevent duplicate fetches
      if (isFetchingRef.current) {
        console.log('⚠️ Already fetching, skipping');
        return;
      }
      
      // If we already fetched for this email, skip the fetch
      if (lastEmailRef.current === email && animalsForTodayList.length > 0) {
        console.log('⚠️ Already fetched for this email, skipping');
        setIsLoading(false);
        return;
      }

      console.log('✅ Starting fetch for email:', email);
      isFetchingRef.current = true;
      lastEmailRef.current = email;
      setIsLoading(true);

      try {
        // 1. Get caregiver name from backend
        const caregiverNameRes = await fetch(`/api/caregiver?email=${encodeURIComponent(email)}`);
        const nameObj = await caregiverNameRes.json();
        let nameRaw = nameObj?.caregiverName ?? nameObj ?? '';
        if (Array.isArray(nameRaw)) nameRaw = nameRaw[0] || '';
        const name = typeof nameRaw === 'string' ? nameRaw : '';
        setCaregiverName(name || "");

        if (!name) {
          setAnimalsForTodayList([]);
          isFetchingRef.current = false;
          return;
        }

        // 2. Fetch both animals and general treatments in ONE API call
        console.log('🔵 Fetching animals AND general treatments in single call');
        const response = await fetch(`/api/animals?caregiver=${encodeURIComponent(name)}&includeGeneralTreatments=true`);
        const data = await response.json();
        
        const list = Array.isArray(data.animals) ? data.animals : [];
        const generalList = Array.isArray(data.generalTreatments) ? data.generalTreatments : [];
        
        setAnimalsForTodayList(list);
        setGeneralTreatments(generalList);
        
        console.log("%%%%%%%%%%%% Personal Treatments - Animals fetched:", list);
        console.log("%%%%%%%%%%%% Personal Treatments - General treatments fetched:", generalList);
      } catch (err) {
        console.error('Error in fetchCaregiverAndAnimals:', err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    }
    fetchCaregiverAndAnimals();
  }, [email]);

  const handleRemoveCaregiver = async (removeForEveryone: boolean) => {
    if (!selectedAnimalToRemove) {
      toast.error("אנא בחר חיה");
      return;
    }

    setIsRemoving(true);
    try {
      const selectedAnimal = animalsForTodayList.find(a => a.name === selectedAnimalToRemove);
      if (!selectedAnimal) {
        toast.error("חיה לא נמצאה");
        return;
      }

      const response = await fetch('/api/caregiver/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: selectedAnimal.animalType,
          animalName: selectedAnimal.name,
          caregiverName: removeForEveryone ? '' : caregiverName,
          removeAll: removeForEveryone,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove caregiver');
      }

      toast.success(removeForEveryone ? "כל המטפלים הוסרו בהצלחה" : "המטפל הוסר בהצלחה");
      setConfirmRemoveDialogOpen(false);
      setRemoveDialogOpen(false);
      setSelectedAnimalToRemove("");
      
      // Refresh the list
      setAnimalsForTodayList(prev => prev.filter(a => a.name !== selectedAnimalToRemove));
    } catch (error) {
      console.error('Error removing caregiver:', error);
      toast.error("שגיאה בהסרת המטפל");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleOpenConfirmDialog = () => {
    if (!selectedAnimalToRemove) {
      toast.error("אנא בחר חיה");
      return;
    }
    setRemoveDialogOpen(false);
    setConfirmRemoveDialogOpen(true);
  };

  // Show loading screen while fetching data
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F3ED' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: '#A67C52' }} />
          <p className="text-lg text-muted-foreground">טוען טיפולים אישיים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="max-w-7xl mx-auto w-full flex-shrink-0">
        <div className="mb-8">
          <h1 className="mb-2 text-right text-[24px]">טיפולים אישיים - {caregiverName}</h1>
          <p className="text-muted-foreground text-right">
            יש לך {animalsForTodayList.length} חיות שהוקצו לך
            {animalsForTodayList.filter((a: any) => a.hasTreatmentToday).length > 0 && 
              ` (${animalsForTodayList.filter((a: any) => a.hasTreatmentToday).length} עם טיפולים להיום)`
            }
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(true)}
              className="gap-2"
              disabled={animalsForTodayList.length === 0}
            >
              <UserMinus className="w-4 h-4" />
              הסר חיה מהרשימה
            </Button>
          </div>
        </div>

        {/* General Treatments Section */}
        {generalTreatments.length > 0 && (
          <Card className="mb-6" style={{ backgroundColor: '#E8D7C3', borderColor: '#E8D7C3' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="w-5 h-5" />
                טיפולים כלליים להיום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {generalTreatments.map((treatment, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 rounded-lg gap-3"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      <ImageWithFallback
                        src={treatment.image || ''}
                        alt={treatment.animalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="font-medium">{treatment.animalName}</div>
                      <div className="text-sm text-muted-foreground">{treatment.animalType}</div>
                      <div className="text-sm mt-1" style={{ color: '#A67C52' }}>
                        <span className="font-medium">טיפול:</span> {treatment.treatment}
                        {treatment.dosage && <span> | <span className="font-medium">מינון:</span> {treatment.dosage}</span>}
                      </div>
                      {treatment.medicalCase && (
                        <div className="text-sm" style={{ color: '#6B9080' }}>
                          <span className="font-medium">סיבה:</span> {treatment.medicalCase}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        תאריך: {treatment.date}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => onSelectAnimal(treatment.animalTypeKey, treatment.animalName)}>
                      פרטים
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show all animals assigned to caregiver */}
        {animalsForTodayList.length > 0 && (
          <Card className="mb-6" style={{ backgroundColor: '#EDE7DF', borderColor: '#EDE7DF' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">החיות שלך</CardTitle>
              <CardDescription>לחץ על "פרטים" לפתיחת תיק החיה</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {animalsForTodayList.map(animal => (
                  <div 
                    key={animal.id} 
                    className="flex items-center justify-between p-3 rounded-lg gap-3"
                    style={{ 
                      backgroundColor: (animal as any).hasTreatmentToday ? '#D3D3D3' : '#FFFFFF',
                      opacity: (animal as any).hasTreatmentToday ? 0.7 : 1
                    }}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      <ImageWithFallback
                        src={animal.image || ''}
                        alt={animal.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-right font-medium">{animal.name}</div>
                      <div className="text-sm text-muted-foreground text-right">{animalTypeToHebrew[animal.animalType]}</div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onSelectAnimal(animal.animalType, animal.name)}
                    >
                      פרטים
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {animalsForTodayList.length === 0 && (
          <Card style={{ backgroundColor: '#EDE7DF', borderColor: '#EDE7DF' }}>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">אין חיות שהוקצו לך</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Remove Caregiver Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">הסר חיה מהרשימה</DialogTitle>
            <DialogDescription className="text-right">
              בחר חיה שתרצה להסיר מרשימת החיות שלך
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedAnimalToRemove} onValueChange={setSelectedAnimalToRemove}>
              <SelectTrigger className="text-right">
                <SelectValue placeholder="בחר חיה" />
              </SelectTrigger>
              <SelectContent>
                {animalsForTodayList.map((animal) => (
                  <SelectItem key={animal.id} value={animal.name}>
                    {animal.name} - {animalTypeToHebrew[animal.animalType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setRemoveDialogOpen(false);
                setSelectedAnimalToRemove("");
              }}
              disabled={isRemoving}
            >
              ביטול
            </Button>
            <Button 
              onClick={handleOpenConfirmDialog}
              disabled={isRemoving || !selectedAnimalToRemove}
            >
              המשך
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Remove Dialog */}
      <Dialog open={confirmRemoveDialogOpen} onOpenChange={setConfirmRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">בחר אופן הסרה</DialogTitle>
            <DialogDescription className="text-right">
              האם ברצונך להסיר את החיה רק מרשימתך או מכל המטפלים?
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 py-4">
            <Button 
              onClick={() => handleRemoveCaregiver(false)}
              disabled={isRemoving}
              variant="outline"
              className="w-full"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מסיר...
                </>
              ) : (
                'הסר רק עבורי'
              )}
            </Button>
            <Button 
              onClick={() => handleRemoveCaregiver(true)}
              disabled={isRemoving}
              variant="destructive"
              className="w-full"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מסיר...
                </>
              ) : (
                'הסר עבור כולם'
              )}
            </Button>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setConfirmRemoveDialogOpen(false);
                setRemoveDialogOpen(true);
              }}
              disabled={isRemoving}
            >
              חזור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
