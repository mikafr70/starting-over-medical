import { useState } from "react";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { DailySchedule } from "./components/DailySchedule";
import { AnimalProfile } from "./components/AnimalProfile";
import { AddTreatment } from "./components/AddTreatment";
import { Navbar } from "./components/Navbar";
import { Toaster } from "./components/ui/sonner";
import { MedicalRecords } from "./components/MedicalRecords";
import React from "react";

type Screen = "login" | "dashboard" | "schedule" | "profile" | "medicalRecords" | "addTreatment" | "addTreatmentFromSchedule";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("login");
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [selectedAnimalType, setSelectedAnimalType] = useState<string>("");
  const [selectedAnimalId, setSelectedAnimalId] = useState<number>(1);
  const [previousScreen, setPreviousScreen] = useState<Screen>("dashboard");

  const handleLogin = (nameOrEmail: string) => {
    setUsername(nameOrEmail);
    setUserEmail(nameOrEmail);
    setCurrentScreen("dashboard");
  };

  const handleLogout = () => {
    setUsername("");
    setCurrentScreen("login");
  };

  const handleNavigate = (screen: string) => {
    if (screen === "dashboard" || screen === "schedule" || screen === "medicalRecords") {
      setCurrentScreen(screen as Screen);
    }
  };

  const handleSelectAnimal = (animalTypeOrId: string | number, animalId?: string | number) => {
    // Supports two call signatures:
    // - handleSelectAnimal(animalId)
    // - handleSelectAnimal(animalType, animalId)
    if (animalId !== undefined) {
      // two-arg form: first arg is animalType
      setSelectedAnimalType(String(animalTypeOrId));
      const parsed = typeof animalId === 'string' ? parseInt(animalId, 10) : animalId;
      setSelectedAnimalId(isNaN(Number(parsed)) ? 1 : Number(parsed));
    } else {
      // single-arg form: only id provided
      setSelectedAnimalType("");
      const parsed = typeof animalTypeOrId === 'string' ? parseInt(animalTypeOrId, 10) : animalTypeOrId;
      setSelectedAnimalId(isNaN(Number(parsed)) ? 1 : Number(parsed));
    }
    setCurrentScreen("profile");
  };

  const handleAddTreatment = (animalId: number) => {
    setSelectedAnimalId(animalId);
    setCurrentScreen("addTreatment");
  };

  const handleAddTreatmentFromSchedule = () => {
    setPreviousScreen("schedule");
    setCurrentScreen("addTreatmentFromSchedule");
  };

  const handleAddTreatmentFromDashboard = () => {
    setPreviousScreen("dashboard");
    setCurrentScreen("addTreatmentFromSchedule");
  };

  const handleBackFromProfile = () => {
    setCurrentScreen("dashboard");
  };

  const handleBackFromAddTreatment = () => {
    setCurrentScreen("profile");
  };

  const handleBackFromAddTreatmentSchedule = () => {
    setCurrentScreen(previousScreen);
  };

  if (currentScreen === "login") {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toaster position="top-center" />
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F3ED' }}>
      <Navbar
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        username={username}
      />

      {currentScreen === "dashboard" && (
        <Dashboard 
          onSelectAnimal={handleSelectAnimal} 
          onAddTreatment={handleAddTreatmentFromDashboard}
          username={username}
          email={userEmail}
        />
      )}

      {currentScreen === "schedule" && (
        <DailySchedule 
          onSelectAnimal={handleSelectAnimal}
          onAddTreatment={handleAddTreatmentFromSchedule}
        />
      )}

      {currentScreen === "profile" && (
        <AnimalProfile
          animalType={selectedAnimalType}
          animalId={String(selectedAnimalId)}
          onBack={handleBackFromProfile}
          onAddTreatment={handleAddTreatment}
        />
      )}

      {currentScreen === "medicalRecords" && (
        <MedicalRecords
          onOpenProfile={(animalType: string, animalId: string) => {
            setSelectedAnimalType(animalType);
            const parsed = parseInt(animalId, 10);
            setSelectedAnimalId(isNaN(parsed) ? 1 : parsed);
            setCurrentScreen("profile");
          }}
          onBack={() => setCurrentScreen("dashboard")}
        />
      )}

      {currentScreen === "addTreatment" && (
        <AddTreatment
          
          animalName={String(selectedAnimalId)}
          onBack={handleBackFromAddTreatment}
        />
      )}

      {currentScreen === "addTreatmentFromSchedule" && (
        <AddTreatment
          onBack={handleBackFromAddTreatmentSchedule}
        />
      )}

      <Toaster position="top-center" />
    </div>
  );
}