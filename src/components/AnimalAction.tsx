'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface AnimalActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ActionType = "" | "אימוץ" | "פטירה" | "קליטה" | "המתת חסד" | "המלטה";

export function AnimalAction({ open, onOpenChange, onSuccess }: AnimalActionProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>("");
  
  // Common fields for all actions
  const [animalName, setAnimalName] = useState("");
  const [gender, setGender] = useState("");
  const [date, setDate] = useState("");
  const [animalType, setAnimalType] = useState("");
  const [chipId, setChipId] = useState("");
  const [shelterLocation, setShelterLocation] = useState("");
  
  // Form fields for different actions
  const [adopter_name, setAdopterName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [background, setBackground] = useState("");
  const [description, setDescription] = useState("");
  const [motherName, setMotherName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    
    try {
      // Build action data
      const actionData: any = {
        actionType: selectedAction,
        animalName,
        gender,
        date,
        animalType,
        chipId,
        shelterLocation,
      };

      // Add fields based on action type
      switch (selectedAction) {
        case "אימוץ":
          actionData.adopter_name = adopter_name;
          actionData.phoneNumber = phoneNumber;
          actionData.location = location;
          break;
        case "פטירה":
          actionData.reason = reason;
          break;
        case "קליטה":
          actionData.background = background;
          actionData.description = description;
          break;
        case "המתת חסד":
          actionData.reason = reason;
          break;
        case "המלטה":
          actionData.motherName = motherName;
          actionData.description = description;
          break;
      }

      console.log("Sending action data:", actionData);
      
      // Send to API
      const response = await fetch('/api/animal-action', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actionData) 
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save action');
      }
      
      console.log("Action saved successfully:", result);
      
      // Reset form and close
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error saving action:", error);
      alert('שגיאה בשמירת הפעולה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedAction("");
    setAnimalName("");
    setGender("");
    setDate("");
    setAnimalType("");
    setChipId("");
    setShelterLocation("");
    setAdopterName("");
    setPhoneNumber("");
    setLocation("");
    setReason("");
    setBackground("");
    setMotherName("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-xs text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">בחר פעולה חדשה</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-3 mt-2 text-right" dir="rtl">
          {/* Action Type Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="action-type" dir="rtl" className="text-right block">סוג פעולה</Label>
            <Select
              value={selectedAction}
              onValueChange={(value) => setSelectedAction(value as ActionType)}
            >
              <SelectTrigger id="action-type" className="text-right" dir="rtl">
                <SelectValue placeholder="בחר פעולה" />
              </SelectTrigger>
              <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                <SelectItem value="אימוץ" className="justify-end text-right cursor-pointer">אימוץ</SelectItem>
                <SelectItem value="פטירה" className="justify-end text-right cursor-pointer">פטירה</SelectItem>
                <SelectItem value="קליטה" className="justify-end text-right cursor-pointer">קליטה</SelectItem>
                <SelectItem value="המתת חסד" className="justify-end text-right cursor-pointer">המתת חסד</SelectItem>
                <SelectItem value="המלטה" className="justify-end text-right cursor-pointer">המלטה</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Common Fields - Always shown when an action is selected */}
          {selectedAction && (
            <>
              <div className="space-y-2">
                <Label htmlFor="animal-name" dir="rtl" className="text-right block">שם החיה</Label>
                <Input
                  id="animal-name"
                  value={animalName}
                  onChange={(e) => setAnimalName(e.target.value)}
                  placeholder="הכנס שם החיה"
                  required
                  className="text-right"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender" dir="rtl" className="text-right block">מין</Label>
                <Select
                  value={gender}
                  onValueChange={(value) => setGender(value)}
                >
                  <SelectTrigger id="gender" className="text-right" dir="rtl">
                    <SelectValue placeholder="בחר מין" />
                  </SelectTrigger>
                  <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                    <SelectItem value="זכר" className="justify-end text-right cursor-pointer">זכר</SelectItem>
                    <SelectItem value="נקבה" className="justify-end text-right cursor-pointer">נקבה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date" dir="rtl" className="text-right block">תאריך</Label>
                <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                dir="rtl"
                className="text-right"
                />

              </div>
              <div className="space-y-2">
                <Label htmlFor="animal-type" dir="rtl" className="text-right block">סוג החיה</Label>
                <Select
                  value={animalType}
                  onValueChange={(value) => setAnimalType(value)}
                >
                  <SelectTrigger id="animal-type" className="text-right" dir="rtl">
                    <SelectValue placeholder="בחר סוג חיה" />
                  </SelectTrigger>
                  <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                    <SelectItem value="חמור" className="justify-end text-right cursor-pointer">חמור 🫏</SelectItem>
                    <SelectItem value="סוס" className="justify-end text-right cursor-pointer">סוס 🐴</SelectItem>
                    <SelectItem value="פרה" className="justify-end text-right cursor-pointer">פרה 🐄</SelectItem>
                    <SelectItem value="כלב" className="justify-end text-right cursor-pointer">כלב 🐕</SelectItem>
                    <SelectItem value="חתול" className="justify-end text-right cursor-pointer">חתול 🐈</SelectItem>
                    <SelectItem value="עז" className="justify-end text-right cursor-pointer">עז 🐐</SelectItem>
                    <SelectItem value="כבשה" className="justify-end text-right cursor-pointer">כבשה 🐑</SelectItem>
                    <SelectItem value="ארנב" className="justify-end text-right cursor-pointer">ארנב 🐰</SelectItem>
                    <SelectItem value="עופות" className="justify-end text-right cursor-pointer">עופות 🐔</SelectItem>
                    <SelectItem value="חזיר" className="justify-end text-right cursor-pointer">חזיר 🐖</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chip-id" dir="rtl" className="text-right block">שבב</Label>
                <Input
                  id="chip-id"
                  value={chipId}
                  onChange={(e) => setChipId(e.target.value)}
                  placeholder="הכנס מספר שבב"
                  className="text-right"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shelter-location" dir="rtl" className="text-right block">מתחם במקלט</Label>
                <Input
                  id="shelter-location"
                  value={shelterLocation}
                  onChange={(e) => setShelterLocation(e.target.value)}
                  placeholder="הכנס מתחם במקלט"
                  className="text-right"
                  dir="rtl"
                />
              </div>
            </>
          )}

          {/* Conditional Fields Based on Action Type */}
          {selectedAction === "אימוץ" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="adopter-name" dir="rtl" className="text-right block">שם מאמץ</Label>
                <Input
                  id="adopter-name"
                  value={adopter_name}
                  onChange={(e) => setAdopterName(e.target.value)}
                  placeholder="הכנס שם מאמץ"
                  className="text-right"
                  dir="rtl"  
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" dir="rtl" className="text-right block">מספר טלפון</Label>
                <Input
                  id="phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="הכנס מספר טלפון"
                  className="text-right"
                  dir="rtl"                   
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" dir="rtl" className="text-right block">מיקום</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="הכנס מיקום"
                  className="text-right"
                  dir="rtl"                   
                />
              </div>
            </>
          )}

          {selectedAction === "פטירה" && (
            <div className="space-y-2">
              <Label htmlFor="reason" dir="rtl" className="text-right block">סיבה</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="הכנס סיבה"
                className="text-right"
                dir="rtl"
              />
            </div>
          )}

          {selectedAction === "קליטה" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="description" dir="rtl" className="text-right block">תיאור</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="הכנס תיאור"
                  className="text-right"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="background" dir="rtl" className="text-right block">רקע</Label>
                <Input
                  id="background"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="הכנס רקע"
                  className="text-right"
                  dir="rtl"
                />
              </div>
            </>
          )}

          {selectedAction === "המתת חסד" && (
            <div className="space-y-2">
              <Label htmlFor="reason-euthanasia" dir="rtl" className="text-right block">סיבה</Label>
              <Input
                id="reason-euthanasia"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="הכנס סיבה"
                className="text-right"
                dir="rtl"
              />
            </div>
          )}

          {selectedAction === "המלטה" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="description" dir="rtl" className="text-right block">תיאור</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="הכנס תיאור"
                  className="text-right"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mother-name" dir="rtl" className="text-right block">שם אם</Label>
                <Input
                  id="mother-name"
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="הכנס שם אם"
                  className="text-right"
                  dir="rtl"
                />
              </div>
            </>
          )}

          {/* Submit Button */}
          {selectedAction && (
            <div className="flex justify-center pt-2">
              <Button
                type="submit"
                className="px-6 py-2 text-sm"
                style={{ backgroundColor: '#A67C52' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
