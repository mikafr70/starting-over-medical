'use client';

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Calendar, Pill, AlertCircle, Plus, Loader2 } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { AddAnimal } from "./AddAnimal";
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
  treatment: string;
  medicalCase: string;
  dosage: string;
  date: string;
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


interface DashboardProps {
  onSelectAnimal: (animalType: string , animalName: string) => void;
  onAddTreatment: () => void;
  email: string;
  username?: string;
}

export function Dashboard({ onSelectAnimal, onAddTreatment, email }: DashboardProps) {
  const [caregiverName, setCaregiverName] = useState<string>("");
  const [uncheckedTreatments] = useState<Animal[]>([]);
  const [addAnimalOpen, setAddAnimalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const lastEmailRef = useRef<string>("");

  useEffect(() => {
    async function fetchCaregiver() {
      if (!email) {
        setIsLoading(false);
        return;
      }

      // Prevent duplicate fetches
      if (isFetchingRef.current) {
        return;
      }
      
      // If we already fetched for this email, skip the fetch
      if (lastEmailRef.current === email) {
        setIsLoading(false);
        return;
      }

      isFetchingRef.current = true;
      lastEmailRef.current = email;
      setIsLoading(true);

      try {
        // Get caregiver name from backend
        const caregiverNameRes = await fetch(`/api/caregiver?email=${encodeURIComponent(email)}`);
        const nameObj = await caregiverNameRes.json();
        let nameRaw = nameObj?.caregiverName ?? nameObj ?? '';
        if (Array.isArray(nameRaw)) nameRaw = nameRaw[0] || '';
        const name = typeof nameRaw === 'string' ? nameRaw : '';
        setCaregiverName(name || "");
      } catch (err) {
        console.error('Error in fetchCaregiver:', err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    }
    fetchCaregiver();
  }, [email]);

  // Update document title
  useEffect(() => {
    const baseTitle = "Starting Over Medical";

    if (typeof document !== "undefined") {
      if (caregiverName) {
        document.title = `${caregiverName} - ${baseTitle}`;
      } else {
        document.title = baseTitle;
      }
    }
  }, [caregiverName]);

  // Show loading screen while fetching data
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F3ED' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: '#A67C52' }} />
          <p className="text-lg text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col" style={{ backgroundColor: '#F7F3ED' }}>
      {/* make this a fixed width container centered */}
      <div className="max-w-7xl mx-auto w-full flex-shrink-0">
        <div className="mb-8">
            <h1 className="mb-2 text-5xl sm:text-6xl md:text-7xl text-center font-bold">שלום, {caregiverName}</h1>
        </div>

        {uncheckedTreatments.length > 0 && (
          <Card className="mb-6" style={{ backgroundColor: '#CFE4D3', borderColor: '#CFE4D3' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                טיפולים לא מסומנים להיום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uncheckedTreatments.map((animal) => (
                  <div
                    key={animal.id}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: '#FFFFFF' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        <ImageWithFallback
                          src={animal.image}
                          alt={animal.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-right">{animal.name}</p>
                        <p className="text-sm text-muted-foreground">{animal.animalType}</p>
                        <ul className="text-xs text-red-600">
                          {(animal.uncheckedTreatments ?? []).map((t, i) => (
                            <li key={i}>
                              {t.treatment} - בוקר: {t.morning} | צהריים: {t.noon} | ערב: {t.evening}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={() => onSelectAnimal(animal.animalType, animal.name)}>
                        פרטים
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex gap-4">
          <Button
            onClick={onAddTreatment}
            className="px-8 py-6 rounded-2xl text-white transition-all hover:scale-105 hover:shadow-lg"
            style={{ 
              backgroundColor: '#A67C52',
            }}
          >
            <span className="text-xl">הוסף טיפול חדש</span>
          </Button>
          
          <Button
            onClick={() => setAddAnimalOpen(true)}
            className="px-8 py-6 rounded-2xl text-white transition-all hover:scale-105 hover:shadow-lg"
            style={{ 
              backgroundColor: '#6B9080',
            }}
          >
            <span className="text-xl">הוסף חיה חדשה</span>
          </Button>
        </div>
      </div>

      <AddAnimal 
        open={addAnimalOpen} 
        onOpenChange={setAddAnimalOpen}
        onSuccess={() => {
          // Optionally refresh animals list
        }}
      />
    </div>
  );
}
