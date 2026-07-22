'use client';

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Loader2, Pill, UserMinus, UserPlus, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
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
  isCompleted?: boolean;
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
  treatment?: string;
  medicalCase?: string;
  dosage?: string;
  date?: string;
  uncheckedTreatments?: Treatment[];
  isPersonalComplete?: boolean;
  isPersonalIncomplete?: boolean;
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
    dog: "כלב",
    camel: "גמל",
    mule: "פרד"
};

interface PersonalTreatmentsProps {
  onSelectAnimal: (animalType: string, animalName: string) => void;
  onAddTreatment?: () => void;
  email: string;
}

export function PersonalTreatments({ onSelectAnimal, onAddTreatment, email }: PersonalTreatmentsProps) {
  const [caregiverName, setCaregiverName] = useState<string>("");
  const [animalsForTodayList, setAnimalsForTodayList] = useState<Animal[]>([]);
  const [generalTreatments, setGeneralTreatments] = useState<GeneralTreatment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreamingTreatments, setIsStreamingTreatments] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmRemoveDialogOpen, setConfirmRemoveDialogOpen] = useState(false);
  const [selectedAnimalToRemove, setSelectedAnimalToRemove] = useState<string>("");
  
  // Ref to track if we're already fetching
  const fetchInProgressRef = useRef(false);
  const [selectedAnimalType, setSelectedAnimalType] = useState<string>("");
  const [selectedAnimalToAdd, setSelectedAnimalToAdd] = useState<string>("");
  const [animalSearchQuery, setAnimalSearchQuery] = useState<string>("");
  const [availableAnimals, setAvailableAnimals] = useState<Animal[]>([]);
  const [isLoadingAnimals, setIsLoadingAnimals] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  // Caregiver notes state
  const [caregiverNotes, setCaregiverNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [selectedNoteDate, setSelectedNoteDate] = useState<string>(''); // DD.MM.YYYY format
  const [dailyEvents, setDailyEvents] = useState<{text:string; type:string}[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [completingTreatment, setCompletingTreatment] = useState<string | null>(null);

  // Get today's date in DD.MM.YYYY format
  const getTodayStr = () => {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  };

  // Initialize selectedNoteDate to today when component mounts
  useEffect(() => {
    if (!selectedNoteDate) {
      setSelectedNoteDate(getTodayStr());
    }
  }, []);

  const fetchCaregiverAndAnimals = async () => {
    console.log('🔵 PersonalTreatments fetch called, email:', email);
    
    if (!email) {
      console.log('⚠️ No email, skipping fetch');
      setIsLoading(false);
      return;
    }

    // Prevent duplicate fetches
    if (fetchInProgressRef.current) {
      console.log('⚠️ Fetch already in progress, skipping duplicate');
      return;
    }

    console.log('✅ Starting fetch for email:', email);
    fetchInProgressRef.current = true;
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
        return;
      }

      // 2. Stream animals and general treatments, showing each one as it's found
      console.log('🔵 Streaming animals AND general treatments');
      setAnimalsForTodayList([]);
      setGeneralTreatments([]);
      setIsLoading(false);
      setIsStreamingTreatments(true);

      const personalList: any[] = [];
      const generalList: GeneralTreatment[] = [];

      const response = await fetch(`/api/animals?caregiver=${encodeURIComponent(name)}&includeGeneralTreatments=true`);
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.complete) {
            console.log(`✅ Caregiver stream complete - ${chunk.totalPersonal} personal, ${chunk.totalGeneral} general`);
            return;
          }
          if (!chunk.treatment) return;
          const treatment = chunk.treatment;
          if (chunk.isGeneral) {
            generalList.push(treatment);
            setGeneralTreatments([...generalList]);
          } else {
            personalList.push({
              id: `${treatment.animalTypeKey}-${treatment.animalName}`,
              name: treatment.animalName,
              animalType: treatment.animalTypeKey,
              image: treatment.image || '',
              treatment: treatment.treatment || '',
              medicalCase: treatment.medicalCase || '',
              dosage: treatment.dosage || '',
              date: treatment.date || '',
              isPersonalIncomplete: !treatment.isCompleted,
              isPersonalComplete: treatment.isCompleted
            });
            setAnimalsForTodayList([...personalList]);
          }
        } catch (parseError) {
          console.error('Error parsing caregiver stream line:', parseError, line);
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

      buffer += decoder.decode();
      if (buffer.trim()) {
        processLine(buffer);
      }

      console.log("%%%%%%%%%%%% Personal Treatments - Animals fetched:", personalList);
      console.log("%%%%%%%%%%%% Personal Treatments - General treatments fetched:", generalList);
    } catch (err) {
      console.error('Error in fetchCaregiverAndAnimals:', err);
    } finally {
      setIsLoading(false);
      setIsStreamingTreatments(false);
      fetchInProgressRef.current = false;
    }
  };

  useEffect(() => {
    fetchCaregiverAndAnimals();
  }, [email]);

  // Fetch caregiver notes for selected date
  useEffect(() => {
    const fetchNotes = async () => {
      if (!caregiverName || !selectedNoteDate) return;
      
      try {
        setLoadingNotes(true);
        const response = await fetch(`/api/caregiver-notes?caregiverName=${encodeURIComponent(caregiverName)}&date=${encodeURIComponent(selectedNoteDate)}`);
        const data = await response.json();
        
        if (response.ok) {
          setCaregiverNotes(data.notes || []);
        } else {
          console.error('Failed to fetch caregiver notes:', data.error);
        }
      } catch (err) {
        console.error('Error fetching caregiver notes:', err);
      } finally {
        setLoadingNotes(false);
      }
    };

    fetchNotes();
  }, [caregiverName, selectedNoteDate]);

  // Fetch daily events for the selected note date
  useEffect(() => {
    const fetchEvents = async () => {
      if (!selectedNoteDate) return;
      try {
        setLoadingEvents(true);
        const res = await fetch(`/api/daily-events?date=${encodeURIComponent(selectedNoteDate)}`);
        const data = await res.json();
        if (res.ok) setDailyEvents(data.events || []);
      } catch (err) {
        console.error('Error fetching daily events:', err);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
  }, [selectedNoteDate]);

  // Save caregiver note
  const handleSaveNote = async () => {
    if (!newNote.trim() || !caregiverName || !selectedNoteDate) return;
    
    try {
      setSavingNote(true);
      const response = await fetch('/api/caregiver-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverName,
          date: selectedNoteDate,
          note: newNote.trim(),

        })
      });

      const data = await response.json();
      
      if (response.ok) {
        // Always update the list since we're viewing the notes for the selected date
        setCaregiverNotes([...caregiverNotes, newNote.trim()]);
        setNewNote('');
        toast.success('הערה נשמרה בהצלחה');
      } else {
        console.error('Failed to save note:', data.error);
        toast.error('שגיאה בשמירת ההערה');
      }
    } catch (err) {
      console.error('Error saving note:', err);
      toast.error('שגיאה בחיבור לשרת');
    } finally {
      setSavingNote(false);
    }
  };

  // Delete caregiver note
  const handleDeleteNote = async (noteToDelete: string) => {
    if (!caregiverName || !selectedNoteDate) return;
    
    try {
      const response = await fetch('/api/caregiver-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverName,
          date: selectedNoteDate,
          note: noteToDelete
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setCaregiverNotes(caregiverNotes.filter(n => n !== noteToDelete));
        toast.success('הערה נמחקה בהצלחה');
      } else {
        console.error('Failed to delete note:', data.error);
        toast.error('שגיאה במחיקת ההערה');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
      toast.error('שגיאה בחיבור לשרת');
    }
  };

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

  const handleAnimalTypeChange = async (animalType: string) => {
    setSelectedAnimalType(animalType);
    setSelectedAnimalToAdd("");
    setAnimalSearchQuery("");
    setIsLoadingAnimals(true);

    try {
      const response = await fetch(`/api/treatments?animalType=${animalType}`);
      if (!response.ok) throw new Error('Failed to fetch animals');
      
      const data = await response.json();
      // API returns {animals, protocols} object where animals have displayName instead of name
      const rawAnimals = Array.isArray(data) ? data : (data.animals || []);
      // Map displayName to name for component compatibility
      const animals = rawAnimals.map((a: any) => ({
        ...a,
        id: a.id_number || a.id,
        name: a.displayName || a.name
      }));
      setAvailableAnimals(animals);
    } catch (error) {
      console.error('Error fetching animals:', error);
      toast.error("שגיאה בטעינת רשימת החיות");
      setAvailableAnimals([]);
    } finally {
      setIsLoadingAnimals(false);
    }
  };

  const handleAddAnimal = async () => {
    if (!selectedAnimalToAdd || !selectedAnimalType) {
      toast.error("אנא בחר סוג חיה ושם חיה");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch('/api/caregiver/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: selectedAnimalType,
          animalName: selectedAnimalToAdd,
          caregiverName: caregiverName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add animal');
      }

      toast.success("החיה נוספה לרשימת הטיפולים שלך");
      setAddDialogOpen(false);
      setSelectedAnimalType("");
      setSelectedAnimalToAdd("");
      setAnimalSearchQuery("");
      
      // Refresh the list
      await fetchCaregiverAndAnimals();
    } catch (error) {
      console.error('Error adding animal:', error);
      toast.error("שגיאה בהוספת החיה");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCompleteGeneralTreatment = async (animalTypeKey: string, animalName: string, date: string, index: number) => {
    setCompletingTreatment(`${animalTypeKey}-${animalName}-${date}`);
    try {
      const response = await fetch('/api/treatments/complete-general', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: animalTypeKey,
          animalName: animalName,
          date: date,
          markAsComplete: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete general treatment');
      }

      toast.success("הטיפול סומן כבוצע");
      
      // Update the treatment in the list to mark as completed
      setGeneralTreatments(prev => 
        prev.map((t, i) => 
          i === index ? { ...t, isCompleted: true } : t
        )
      );
    } catch (error) {
      console.error('Error completing general treatment:', error);
      toast.error("שגיאה בסימון הטיפול כבוצע");
    } finally {
      setCompletingTreatment(null);
    }
  };

  const handleIncompleteGeneralTreatment = async (animalTypeKey: string, animalName: string, date: string, index: number) => {
    setCompletingTreatment(`${animalTypeKey}-${animalName}-${date}`);
    try {
      const response = await fetch('/api/treatments/complete-general', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: animalTypeKey,
          animalName: animalName,
          date: date,
          markAsComplete: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark general treatment as incomplete');
      }

      toast.success("הטיפול סומן כלא בוצע");
      
      // Update the treatment in the list to mark as incomplete
      setGeneralTreatments(prev => 
        prev.map((t, i) => 
          i === index ? { ...t, isCompleted: false } : t
        )
      );
    } catch (error) {
      console.error('Error marking general treatment as incomplete:', error);
      toast.error("שגיאה בסימון הטיפול כלא בוצע");
    } finally {
      setCompletingTreatment(null);
    }
  };

  const handleCompletePersonalTreatment = async (animalType: string, animalName: string) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    
    setCompletingTreatment(`personal-${animalType}-${animalName}`);
    try {
      const response = await fetch('/api/treatments/complete-personal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: animalType,
          animalName: animalName,
          date: dateStr,
          markAsComplete: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete personal treatment');
      }

      toast.success("הטיפול האישי סומן כבוצע");
      
      // Update the animal in the list
      setAnimalsForTodayList(prev => 
        prev.map(a => 
          a.name === animalName ? { ...a, isPersonalIncomplete: false, isPersonalComplete: true } : a
        )
      );
    } catch (error) {
      console.error('Error completing personal treatment:', error);
      toast.error("שגיאה בסימון הטיפול כבוצע");
    } finally {
      setCompletingTreatment(null);
    }
  };

  const handleIncompletePersonalTreatment = async (animalType: string, animalName: string) => {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    
    setCompletingTreatment(`personal-${animalType}-${animalName}`);
    try {
      const response = await fetch('/api/treatments/complete-personal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animalType: animalType,
          animalName: animalName,
          date: dateStr,
          markAsComplete: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark personal treatment as incomplete');
      }

      toast.success("הטיפול האישי סומן כלא בוצע");
      
      // Update the animal in the list
      setAnimalsForTodayList(prev => 
        prev.map(a => 
          a.name === animalName ? { ...a, isPersonalIncomplete: true, isPersonalComplete: false } : a
        )
      );
    } catch (error) {
      console.error('Error marking personal treatment as incomplete:', error);
      toast.error("שגיאה בסימון הטיפול כלא בוצע");
    } finally {
      setCompletingTreatment(null);
    }
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
          <h1 className="mb-2 text-right text-[24px] flex items-center justify-end gap-2">
            {isStreamingTreatments && (
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A67C52' }} />
            )}
            טיפולים אישיים - {caregiverName}
          </h1>
          <p className="text-muted-foreground text-right">
            {isStreamingTreatments
              ? 'טוען טיפולים...'
              : `יש לך ${animalsForTodayList.filter(a => a.isPersonalComplete || a.isPersonalIncomplete).length} חיות עם טיפולים להיום`}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(true)}
              className="gap-2"
            >
              <UserPlus className="w-4 h-4" />
              הוסף חיה לטיפול
            </Button>
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

        {/* Grid Layout: Treatments + Notes Panel */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Main Content - 8 columns */}
          <div className="xl:col-span-8 space-y-6">

        {/* Personal Treatments Section */}
        {(animalsForTodayList.filter(a => a.isPersonalIncomplete).length > 0 || 
          animalsForTodayList.filter(a => a.isPersonalComplete).length > 0) && (
          <Card className="mb-6" style={{ backgroundColor: '#E8D7C3', borderColor: '#E8D7C3' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="w-5 h-5" />
               טיפולים אישיים להיום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Incomplete personal treatments first */}
                {animalsForTodayList
                  .filter(a => a.isPersonalIncomplete)
                  .map(animal => {
                    const isCompleting = completingTreatment === `personal-${animal.animalType}-${animal.name}`;
                    return (
                    <div 
                      key={animal.id} 
                      className="flex items-center justify-between p-3 rounded-lg gap-3"
                      style={{ backgroundColor: '#FFFFFF' }}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                        <ImageWithFallback
                          src={animal.image || ''}
                          alt={animal.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 text-right">
                        <div className="font-medium">{animal.name}</div>
                        <div className="text-sm text-muted-foreground">{animalTypeToHebrew[animal.animalType]}</div>
                        {(animal.treatment || animal.medicalCase) && (
                          <div className="text-sm mt-1">
                            <span className="font-medium">טיפול:</span> {animal.medicalCase || animal.treatment}
                          </div>
                        )}
                        {animal.dosage && (
                          <div className="text-sm">
                            <span className="font-medium">מינון:</span> {animal.dosage}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleCompletePersonalTreatment(animal.animalType, animal.name)}
                          disabled={isCompleting}
                        >
                          {isCompleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4 ml-1" />
                              סמן כבוצע
                            </>
                          )}
                        </Button>
                        <Button size="sm" onClick={() => onSelectAnimal(animal.animalType, animal.name)}>
                          פרטים
                        </Button>
                      </div>
                    </div>
                  )})}
                {/* Complete personal treatments - greyed */}
                {animalsForTodayList
                  .filter(a => a.isPersonalComplete)
                  .map(animal => {
                    const isCompleting = completingTreatment === `personal-${animal.animalType}-${animal.name}`;
                    return (
                    <div 
                      key={animal.id} 
                      className="flex items-center justify-between p-3 rounded-lg gap-3"
                      style={{ 
                        backgroundColor: '#D3D3D3',
                        opacity: 0.7
                      }}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                        <ImageWithFallback
                          src={animal.image || ''}
                          alt={animal.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 text-right">
                        <div className="font-medium">
                          {animal.name} <span className="text-sm text-muted-foreground">({animalTypeToHebrew[animal.animalType]})</span>
                        </div>
                        {(animal.treatment || animal.medicalCase) && (
                          <div className="text-sm mt-1">
                            <span className="font-medium">טיפול:</span> {animal.medicalCase || animal.treatment}
                          </div>
                        )}
                        {animal.dosage && (
                          <div className="text-sm">
                            <span className="font-medium">מינון:</span> {animal.dosage}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleIncompletePersonalTreatment(animal.animalType, animal.name)}
                          disabled={isCompleting}
                        >
                          {isCompleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <X className="w-4 h-4 ml-1" />
                              בטל
                            </>
                          )}
                        </Button>
                        <Button size="sm" onClick={() => onSelectAnimal(animal.animalType, animal.name)}>
                          פרטים
                        </Button>
                      </div>
                    </div>
                  )})}
              </div>
            </CardContent>
          </Card>
        )}

        {/* General Treatments Section */}
        {generalTreatments.length > 0 && (
          <Card className="mb-6" style={{ backgroundColor: '#E8D7C3', borderColor: '#E8D7C3' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="w-5 h-5" />
                טיפולים כלליים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Incomplete general treatments first */}
                {generalTreatments
                  .filter(t => !t.isCompleted)
                  .map((treatment, index) => {
                    const actualIndex = generalTreatments.findIndex(t => 
                      t.animalName === treatment.animalName && 
                      t.date === treatment.date && 
                      t.medicalCase === treatment.medicalCase
                    );
                    const isCompleting = completingTreatment === `${treatment.animalTypeKey}-${treatment.animalName}-${treatment.date}`;
                    
                    return (
                      <div 
                        key={actualIndex} 
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
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleCompleteGeneralTreatment(treatment.animalTypeKey, treatment.animalName, treatment.date, actualIndex)}
                            disabled={isCompleting}
                          >
                            {isCompleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 ml-1" />
                                סמן כבוצע
                              </>
                            )}
                          </Button>
                          <Button size="sm" onClick={() => onSelectAnimal(treatment.animalTypeKey, treatment.animalName)}>
                            פרטים
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                {/* Complete general treatments - greyed */}
                {generalTreatments
                  .filter(t => t.isCompleted)
                  .map((treatment, index) => {
                    const actualIndex = generalTreatments.findIndex(t => 
                      t.animalName === treatment.animalName && 
                      t.date === treatment.date && 
                      t.medicalCase === treatment.medicalCase &&
                      t.isCompleted === true
                    );
                    const isUpdating = completingTreatment === `${treatment.animalTypeKey}-${treatment.animalName}-${treatment.date}`;
                    
                    return (
                      <div 
                        key={actualIndex} 
                        className="flex items-center justify-between p-3 rounded-lg gap-3"
                        style={{ 
                          backgroundColor: '#D3D3D3',
                          opacity: 0.7
                        }}
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
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleIncompleteGeneralTreatment(treatment.animalTypeKey, treatment.animalName, treatment.date, actualIndex)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <X className="w-4 h-4 ml-1" />
                                סמן כלא בוצע
                              </>
                            )}
                          </Button>
                          <Button size="sm" onClick={() => onSelectAnimal(treatment.animalTypeKey, treatment.animalName)}>
                            פרטים
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {!isStreamingTreatments && animalsForTodayList.length === 0 && generalTreatments.length === 0 && (
          <Card style={{ backgroundColor: '#EDE7DF', borderColor: '#EDE7DF' }}>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">אין חיות שהוקצו לך</p>
            </CardContent>
          </Card>
        )}
          </div>

          {/* Caregiver Notes & Events Panel - 4 columns */}
          <div className="xl:col-span-4">
            <Card className="xl:sticky xl:top-6">
              <CardHeader>
                <CardTitle className="text-right">הערות ואירועים</CardTitle>
                {/* Date picker in header so it clearly controls what's being viewed */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-sm font-medium whitespace-nowrap">תאריך:</label>
                  <input
                    type="date"
                    value={selectedNoteDate ? selectedNoteDate.split('.').reverse().join('-') : ''}
                    onChange={e => {
                      const [year, month, day] = e.target.value.split('-');
                      setSelectedNoteDate(`${day}.${month}.${year}`);
                    }}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Personal Notes */}
                <div>
                  <p className="text-sm font-medium text-right mb-2">הערות אישיות</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {loadingNotes ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : caregiverNotes.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 text-sm">אין הערות ליום</p>
                    ) : (
                      caregiverNotes.map((note, index) => (
                        <div
                          key={index}
                          className="group p-3 bg-muted rounded-lg text-right text-sm border flex items-start justify-between gap-2 hover:bg-muted/80 transition-colors"
                          style={{ borderColor: '#E7E7E7' }}
                        >
                          <span className="flex-1">{note}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => handleDeleteNote(note)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Daily Events for the same date */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium text-right mb-2">אירועים יומיים</p>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {loadingEvents ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : dailyEvents.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 text-sm">אין אירועים ליום</p>
                    ) : (
                      dailyEvents.map((event, idx) => (
                        <div key={idx} className="p-2 bg-muted rounded-lg text-right text-sm border space-y-1" style={{ borderColor: '#E7E7E7' }}>
                          <span className="block">{event.text}</span>
                          {event.type && <span className="text-xs text-muted-foreground">{event.type}</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Note Input */}
                <div className="space-y-2 pt-3 border-t">
                  <Textarea
                    placeholder="הזן הערה..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="text-right resize-none"
                    rows={3}
                  />
                  <Button
                    onClick={handleSaveNote}
                    disabled={!newNote.trim() || savingNote || !selectedNoteDate}
                    className="w-full"
                    style={{ backgroundColor: '#A67C52' }}
                  >
                    {savingNote ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        שומר...
                      </>
                    ) : (
                      'שמור הערה'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Treatment Button - Desktop */}
      {onAddTreatment && (
        <div className="hidden md:block fixed top-24 right-8 z-10">
          <Button
            onClick={onAddTreatment}
            className="gap-2 shadow-lg"
            size="lg"
          >
            <Pill className="w-5 h-5" />
            הוסף טיפול
          </Button>
        </div>
      )}

      {/* Add Treatment Button - Mobile (Floating) */}
      {onAddTreatment && (
        <Button
          onClick={onAddTreatment}
          className="md:hidden fixed bottom-6 right-6 z-10 w-14 h-14 rounded-full shadow-xl p-0"
          size="icon"
        >
          <Pill className="w-6 h-6" />
        </Button>
      )}

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

      {/* Add Animal Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">הוסף חיה לטיפול</DialogTitle>
            <DialogDescription className="text-right">
              בחר סוג חיה וחיה להוספה לרשימת הטיפולים שלך
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-right block">סוג החיה</Label>
              <Select value={selectedAnimalType} onValueChange={handleAnimalTypeChange}>
                <SelectTrigger className="text-right" dir="rtl">
                  <SelectValue placeholder="בחר סוג חיה" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="donkey">חמור 🫏</SelectItem>
                  <SelectItem value="horse">סוס 🐴</SelectItem>
                  <SelectItem value="cow">פרה 🐄</SelectItem>
                  <SelectItem value="dog">כלב 🐕</SelectItem>
                  <SelectItem value="cat">חתול 🐈</SelectItem>
                  <SelectItem value="goat">עז 🐐</SelectItem>
                  <SelectItem value="sheep">כבשה 🐑</SelectItem>
                  <SelectItem value="rabbit">ארנב 🐰</SelectItem>
                  <SelectItem value="chicken">עופות 🐔</SelectItem>
                  <SelectItem value="pig">חזיר 🐖</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedAnimalType && (
              <div className="space-y-2">
                <Label className="text-right block">חפש חיה</Label>
                <Input
                  placeholder="חפש לפי שם..."
                  value={animalSearchQuery}
                  onChange={(e) => setAnimalSearchQuery(e.target.value)}
                  className="text-right"
                  dir="rtl"
                />
                
                {isLoadingAnimals ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <Select value={selectedAnimalToAdd} onValueChange={setSelectedAnimalToAdd}>
                    <SelectTrigger className="text-right" dir="rtl">
                      <SelectValue placeholder="בחר חיה" />
                    </SelectTrigger>
                    <SelectContent align="end" side="bottom" position="popper" sideOffset={5} avoidCollisions={false}>
                      {(availableAnimals || [])
                        .filter(animal => 
                          !animalSearchQuery || 
                          (animal.name && animal.name.toLowerCase().includes(animalSearchQuery.toLowerCase()))
                        )
                        .map((animal) => (
                          <SelectItem key={animal.id || animal.name} value={animal.name} className="text-right">
                            {animal.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setAddDialogOpen(false);
                setSelectedAnimalType("");
                setSelectedAnimalToAdd("");
                setAnimalSearchQuery("");
              }}
              disabled={isAdding}
            >
              ביטול
            </Button>
            <Button 
              onClick={handleAddAnimal}
              disabled={isAdding || !selectedAnimalToAdd || !selectedAnimalType}
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מוסיף...
                </>
              ) : (
                'הוסף'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
