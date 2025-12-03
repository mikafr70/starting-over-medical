import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { API_ENDPOINTS } from "../config/api";

interface AnimalType {
  id: string;
  displayName: string;
  emoji?: string;
}

interface AddAnimalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddAnimal({ open, onOpenChange, onSuccess }: AddAnimalProps) {
  const [animalTypes, setAnimalTypes] = useState<AnimalType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [formData, setFormData] = useState({
    animalType: "",
    name: "",
    id: "",
    sex: "",
    location: "",
    in_treatment: "",
    id2: "",
    weight: "",
    arrival_date: "",
    birth_date: "",
    special_trimming: "",
    description: "",
    notes: "",
    drugs: "",
    castration: "",
    deworming: "",
    source: "",
    status: "",
    friends: "",
  });

  // Load animal types
  useEffect(() => {
    const loadTypes = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.treatments());
        if (!res.ok) throw new Error('Failed to load types');
        const data = await res.json();
        setAnimalTypes(data);
      } catch (err) {
        console.error(err);
        toast.error('לא ניתן לטעון סוגי חיות');
      }
    };
    if (open) {
      loadTypes();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.animalType || !formData.name) {
      toast.error("נא למלא לפחות סוג חיה ושם");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/animals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add animal');
      }

      toast.success(`${formData.name} נוסף בהצלחה!`);
      
      // Reset form
      setFormData({
        animalType: "",
        name: "",
        id: "",
        sex: "",
        location: "",
        in_treatment: "",
        id2: "",
        weight: "",
        arrival_date: "",
        birth_date: "",
        special_trimming: "",
        description: "",
        notes: "",
        drugs: "",
        castration: "",
        deworming: "",
        source: "",
        status: "",
        friends: "",
      });
      
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error adding animal:', err);
      toast.error((err as Error).message || 'שגיאה בהוספת החיה');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">הוסף חיה חדשה</DialogTitle>
          <DialogDescription className="text-right">
            מלא את פרטי החיה החדשה
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Animal Type */}
          <div className="space-y-1">
            <Label className="text-right block text-sm">סוג חיה *</Label>
            <Select value={formData.animalType} onValueChange={(val) => handleChange('animalType', val)}>
              <SelectTrigger className="text-right h-9">
                <SelectValue placeholder="בחר סוג חיה" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {animalTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.emoji ? `${t.emoji} ${t.displayName}` : t.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name and ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">שם *</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="שם החיה"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">שבב</Label>
              <Input
                value={formData.id}
                onChange={(e) => handleChange('id', e.target.value)}
                placeholder="מספר שבב"
                className="text-right h-9"
              />
            </div>
          </div>

          {/* All other fields from AnimalProfile */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">מין</Label>
              <Input
                value={formData.sex}
                onChange={(e) => handleChange('sex', e.target.value)}
                placeholder="מין"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">מיקום</Label>
              <Input
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="מיקום"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">בטיפול</Label>
              <Input
                value={formData.in_treatment}
                onChange={(e) => handleChange('in_treatment', e.target.value)}
                placeholder="בטיפול"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">שבב נוסף</Label>
              <Input
                value={formData.id2}
                onChange={(e) => handleChange('id2', e.target.value)}
                placeholder="שבב נוסף"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">משקל</Label>
              <Input
                value={formData.weight}
                onChange={(e) => handleChange('weight', e.target.value)}
                placeholder="משקל"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">תאריך הגעה</Label>
              <Input
                value={formData.arrival_date}
                onChange={(e) => handleChange('arrival_date', e.target.value)}
                placeholder="תאריך הגעה"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">תאריך לידה</Label>
              <Input
                value={formData.birth_date}
                onChange={(e) => handleChange('birth_date', e.target.value)}
                placeholder="תאריך לידה"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">טילוף מיוחד</Label>
              <Input
                value={formData.special_trimming}
                onChange={(e) => handleChange('special_trimming', e.target.value)}
                placeholder="טילוף מיוחד"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-right block text-sm">תיאור</Label>
            <Input
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="תיאור"
              className="text-right h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-right block text-sm">הערות</Label>
            <Input
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="הערות"
              className="text-right h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">תרופות</Label>
              <Input
                value={formData.drugs}
                onChange={(e) => handleChange('drugs', e.target.value)}
                placeholder="תרופות"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">סירוס</Label>
              <Input
                value={formData.castration}
                onChange={(e) => handleChange('castration', e.target.value)}
                placeholder="סירוס"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">תילוע</Label>
              <Input
                value={formData.deworming}
                onChange={(e) => handleChange('deworming', e.target.value)}
                placeholder="תילוע"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">מקור</Label>
              <Input
                value={formData.source}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="מקור"
                className="text-right h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-right block text-sm">סטטוס</Label>
              <Input
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                placeholder="סטטוס"
                className="text-right h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-right block text-sm">חברויות</Label>
              <Input
                value={formData.friends}
                onChange={(e) => handleChange('friends', e.target.value)}
                placeholder="חברויות"
                className="text-right h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
              ביטול
            </Button>
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                'שמור'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
