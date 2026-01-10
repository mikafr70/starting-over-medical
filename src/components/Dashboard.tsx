'use client';

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Calendar, Pill, AlertCircle, Plus, Loader2 } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { AddAnimal } from "./AddAnimal";
import { AnimalAction } from "./AnimalAction";
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
  const [animalActionOpen, setAnimalActionOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCaregiver() {
      if (!email) {
        setIsLoading(false);
        return;
      }

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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F3ED' }}>
      <header style={{ paddingTop: '200px', paddingBottom: '40px' }}>
        <div style={{ marginBottom: '2rem' }}>
        <h1
          style={{
            fontSize: '2.5rem',    // ~40px, normal big title
            fontWeight: 600,
            textAlign: 'center',
            margin: 0,
          }}
        >
          ברוך הבא, {caregiverName}!
        </h1>
      </div>
      </header>
      <div className="flex-1 flex items-start justify-center pt-20">
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
            onClick={() => setAnimalActionOpen(true)}
            className="px-8 py-6 rounded-2xl text-white transition-all hover:scale-105 hover:shadow-lg"
            style={{ 
              backgroundColor: '#6B9080',
            }}
          >
            <span className="text-xl">פעולה חדשה</span>
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

      <AnimalAction 
        open={animalActionOpen} 
        onOpenChange={setAnimalActionOpen}
        onSuccess={() => {
          // Optionally refresh or perform action
        }}
      />
    </div>
  );
}
