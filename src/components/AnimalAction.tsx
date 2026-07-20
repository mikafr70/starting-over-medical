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
      <DialogContent
        className="w-full max-w-md p-0"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '90svh', overflow: 'hidden' }}
        dir="rtl"
      >
        {/* Fixed header */}
        <DialogHeader className="px-6 pt-6 pb-2 text-right" style={{ flexShrink: 0 }}>
          <DialogTitle className="text-center text-xl">בחר פעולה חדשה</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="text-right"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
          dir="rtl"
        >
          {/* Scrollable fields area */}
          <div style={{ overflowY: 'auto', flex: 1 }} className="px-6 pb-4 space-y-4">

            {/* Action Type */}
            <div className="space-y-2">
              <Label htmlFor="action-type" className="text-right block font-medium">סוג פעולה</Label>
              <Select
                value={selectedAction}
                onValueChange={(value) => setSelectedAction(value as ActionType)}
              >
                <SelectTrigger id="action-type" className="text-right h-12 text-base" dir="rtl">
                  <SelectValue placeholder="בחר פעולה" />
                </SelectTrigger>
                <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                  <SelectItem value="אימוץ" className="justify-end text-right cursor-pointer text-base py-3">אימוץ</SelectItem>
                  <SelectItem value="פטירה" className="justify-end text-right cursor-pointer text-base py-3">פטירה</SelectItem>
                  <SelectItem value="קליטה" className="justify-end text-right cursor-pointer text-base py-3">קליטה</SelectItem>
                  <SelectItem value="המתת חסד" className="justify-end text-right cursor-pointer text-base py-3">המתת חסד</SelectItem>
                  <SelectItem value="המלטה" className="justify-end text-right cursor-pointer text-base py-3">המלטה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Common Fields */}
            {selectedAction && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="animal-name" className="text-right block font-medium">שם החיה</Label>
                  <Input
                    id="animal-name"
                    value={animalName}
                    onChange={(e) => setAnimalName(e.target.value)}
                    placeholder="הכנס שם החיה"
                    required
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender" className="text-right block font-medium">מין</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="gender" className="text-right h-12 text-base" dir="rtl">
                      <SelectValue placeholder="בחר מין" />
                    </SelectTrigger>
                    <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                      <SelectItem value="זכר" className="justify-end text-right cursor-pointer text-base py-3">זכר</SelectItem>
                      <SelectItem value="נקבה" className="justify-end text-right cursor-pointer text-base py-3">נקבה</SelectItem>
                      <SelectItem value="מסורס" className="justify-end text-right cursor-pointer text-base py-3">מסורס</SelectItem>
                      <SelectItem value="מעוקרת" className="justify-end text-right cursor-pointer text-base py-3">מעוקרת</SelectItem>
                      <SelectItem value="זכר V" className="justify-end text-right cursor-pointer text-base py-3">זכר V</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-right block font-medium">תאריך</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    dir="rtl"
                    className="text-right h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="animal-type" className="text-right block font-medium">סוג החיה</Label>
                  <Select value={animalType} onValueChange={setAnimalType}>
                    <SelectTrigger id="animal-type" className="text-right h-12 text-base" dir="rtl">
                      <SelectValue placeholder="בחר סוג חיה" />
                    </SelectTrigger>
                    <SelectContent align="end" side="bottom" dir="rtl" className="text-right">
                      <SelectItem value="חמור" className="justify-end text-right cursor-pointer text-base py-3">חמור 🫏</SelectItem>
                      <SelectItem value="סוס" className="justify-end text-right cursor-pointer text-base py-3">סוס 🐴</SelectItem>
                      <SelectItem value="פרה" className="justify-end text-right cursor-pointer text-base py-3">פרה 🐄</SelectItem>
                      <SelectItem value="כלב" className="justify-end text-right cursor-pointer text-base py-3">כלב 🐕</SelectItem>
                      <SelectItem value="חתול" className="justify-end text-right cursor-pointer text-base py-3">חתול 🐈</SelectItem>
                      <SelectItem value="עז" className="justify-end text-right cursor-pointer text-base py-3">עז 🐐</SelectItem>
                      <SelectItem value="כבשה" className="justify-end text-right cursor-pointer text-base py-3">כבשה 🐑</SelectItem>
                      <SelectItem value="ארנב" className="justify-end text-right cursor-pointer text-base py-3">ארנב 🐰</SelectItem>
                      <SelectItem value="עופות" className="justify-end text-right cursor-pointer text-base py-3">עופות 🐔</SelectItem>
                      <SelectItem value="חזיר" className="justify-end text-right cursor-pointer text-base py-3">חזיר 🐖</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chip-id" className="text-right block font-medium">שבב</Label>
                  <Input
                    id="chip-id"
                    value={chipId}
                    onChange={(e) => setChipId(e.target.value)}
                    placeholder="הכנס מספר שבב"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelter-location" className="text-right block font-medium">מתחם במקלט</Label>
                  <Input
                    id="shelter-location"
                    value={shelterLocation}
                    onChange={(e) => setShelterLocation(e.target.value)}
                    placeholder="הכנס מתחם במקלט"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
              </>
            )}

            {/* Conditional Fields */}
            {selectedAction === "אימוץ" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="adopter-name" className="text-right block font-medium">שם מאמץ</Label>
                  <Input
                    id="adopter-name"
                    value={adopter_name}
                    onChange={(e) => setAdopterName(e.target.value)}
                    placeholder="הכנס שם מאמץ"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-right block font-medium">מספר טלפון</Label>
                  <Input
                    id="phone"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="הכנס מספר טלפון"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location" className="text-right block font-medium">מיקום</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="הכנס מיקום"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
              </>
            )}

            {selectedAction === "פטירה" && (
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-right block font-medium">סיבה</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="הכנס סיבה"
                  className="text-right h-12 text-base"
                  dir="rtl"
                />
              </div>
            )}

            {selectedAction === "קליטה" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-right block font-medium">תיאור</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="הכנס תיאור"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="background" className="text-right block font-medium">רקע</Label>
                  <Input
                    id="background"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    placeholder="הכנס רקע"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
              </>
            )}

            {selectedAction === "המתת חסד" && (
              <div className="space-y-2">
                <Label htmlFor="reason-euthanasia" className="text-right block font-medium">סיבה</Label>
                <Input
                  id="reason-euthanasia"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="הכנס סיבה"
                  className="text-right h-12 text-base"
                  dir="rtl"
                />
              </div>
            )}

            {selectedAction === "המלטה" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="description-birth" className="text-right block font-medium">תיאור</Label>
                  <Input
                    id="description-birth"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="הכנס תיאור"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mother-name" className="text-right block font-medium">שם אם</Label>
                  <Input
                    id="mother-name"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder="הכנס שם אם"
                    className="text-right h-12 text-base"
                    dir="rtl"
                  />
                </div>
              </>
            )}
          </div>

          {/* Fixed footer buttons */}
          <div className="flex justify-center gap-3 px-6 py-4 border-t" style={{ flexShrink: 0 }}>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 text-base"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            {selectedAction && (
              <Button
                type="submit"
                className="flex-1 h-12 text-base"
                style={{ backgroundColor: '#A67C52' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'שומר...' : 'שמור'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
