import { useState } from "react";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import DailySchedule from "./components/DailySchedule";
import { AnimalProfile } from "./components/AnimalProfile";
import { AddTreatment } from "./components/AddTreatment";
import { Navbar } from "./components/Navbar";
import { Toaster } from "./components/ui/sonner";
import { MedicalRecords } from "./components/MedicalRecords";
import { PersonalTreatments } from "./components/PersonalTreatments";
import React from "react";
import { useEffect } from "react";

type Screen = "login" | "dashboard" | "schedule" | "profile" | "medicalRecords" | "addTreatment" | "addTreatmentFromSchedule" | "personalTreatments";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("login");
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [selectedAnimalType, setSelectedAnimalType] = useState<string>("");
  const [selectedAnimalName, setSelectedAnimalName] = useState<string>("");
  const [previousScreen, setPreviousScreen] = useState<Screen>("dashboard");
  
  const rtlStyle: React.CSSProperties = {
    direction: 'rtl',
    textAlign: 'right',
    minHeight: '100vh',
    padding: '20px'
  };

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
    if (screen === "dashboard" || screen === "schedule" || screen === "medicalRecords" || screen === "personalTreatments") {
      // Don't update previousScreen when navigating via navbar, keep it for back navigation
      setCurrentScreen(screen as Screen);
    }
  };

  const handleSelectAnimal = (animalType: string , animalName: string ) => {
    // Supports multiple call signatures:
    // - handleSelectAnimal(animalType, animalName) - from DailySchedule
    // - handleSelectAnimal(animalType, animalName) - from Dashboard
    
    // Track previous screen before navigating to profile
    console.log(`Navigating to profile from: ${currentScreen}`);
    setPreviousScreen(currentScreen);
    setSelectedAnimalType(animalType);
    setSelectedAnimalName(animalName);
    setCurrentScreen("profile");
  };

  const handleAddTreatment = (animalName: string) => {
    setSelectedAnimalName(animalName);
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

  const handleAddTreatmentFromProfile = () => {
    setPreviousScreen("profile");
    setCurrentScreen("addTreatmentFromSchedule");
  };

  const handleBackFromProfile = () => {
    console.log(`Going back to: ${previousScreen}`);
    setCurrentScreen(previousScreen);
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

      {currentScreen === "personalTreatments" && (
        <PersonalTreatments 
          onSelectAnimal={handleSelectAnimal}
          email={userEmail}
        />
      )}

      {currentScreen === "profile" && (
        <AnimalProfile
          animalType={selectedAnimalType}
          animalName={selectedAnimalName}
          onBack={handleBackFromProfile}
          onAddTreatment={handleAddTreatmentFromProfile}
        />
      )}

      {currentScreen === "medicalRecords" && (
        <MedicalRecords
          onOpenProfile={(animalType: string, animalName: string) => {
            setPreviousScreen("medicalRecords");
            setSelectedAnimalType(animalType);
            setSelectedAnimalName(animalName);
            setCurrentScreen("profile");
          }}
          onBack={() => setCurrentScreen("dashboard")}
        />
      )}

      {currentScreen === "addTreatment" && (
        <AddTreatment
          
          animalName={selectedAnimalName}
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