/** @jsxImportSource react */
import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "../config/api";
import { cn } from "./ui/utils";

// Type definitions
interface AnimalType {
  id: string;
  displayName: string;
  emoji?: string;
}

type Treatment = {
  type: string;
  case: string;
  id?: string;
  medication: string;
  days: string;
  frequency: string;
  dosage?: string;
  bodyPart?: string;
  morning: string;
  noon: string;
  evening: string;
};

interface Animal {
  id: string;
  id2?: string;
  name: string;
  animalType?: string;
  id_number?: string;
  age?: string;
  sex?: string;
  description?: string;
  arrival_date?: string;
  birth_date?: string;
  location?: string;
  status?: string;
}

interface AddTreatmentProps {
  animalType?: string;
  animalName?: string;
  onBack: () => void;
}

// Will be populated from protocols
//const [treatmentTypes, setTreatmentTypes] = useState<string[]>([]);



export function AddTreatment({ animalName, onBack }: AddTreatmentProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalTypes, setAnimalTypes] = useState<AnimalType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AF const [treatmentTypes, setTreatmentTypes] = useState<string[]>([]);
  const [treatmentTypes, setTreatmentTypes] = useState<string[]>([]);
  const [treatmentType, setTreatmentType] = useState<string>('');   // ← selected value
  const [mappedTreatments, setMappedTreatments] = useState<Treatment[]>([]);



  // Fetch animal types for the type dropdown
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.treatments());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // data expected: [{ id, displayName, emoji }]
        setAnimalTypes(data);
        setError(null);
      } catch (e) {
        console.error('Error fetching animal types:', e);
        setError('Failed to load animal types. Please try again.');
        toast.error('Failed to load animal types');
      } finally {
        setLoading(false);
      }
    };

    fetchTypes();
  }, []);
  const [selectedAnimalType, setSelectedAnimalType] = useState("");
  const [selectedAnimal, setSelectedAnimal] = useState(animalName?.toString() || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [caregiver, setCaregiver] = useState("");
  const [notes, setNotes] = useState("");

  // Caregivers list (fetched from backend caregivers sheet)
  const [caregivers, setCaregivers] = useState<string[]>([]);
  useEffect(() => {
    const loadCaregivers = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.caregivers());
        if (!res.ok) throw new Error('Failed to load caregivers');
        const data = await res.json();
        if (Array.isArray(data)) setCaregivers(data);
      } catch (e) {
        console.error('Error loading caregivers:', e);
      }
    };
    loadCaregivers();
  }, []);

  // Filter animals by search query (name or id_number or id)
  const filteredAnimals = animals.filter(a => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const name = a.name?.toLowerCase() || "";
    const idNum = a.id_number?.toString().toLowerCase() || "";
    const id = a.id?.toLowerCase() || "";
    return name.includes(query) || idNum.includes(query) || id.includes(query);
  });

  // (selected animal object not currently used)

  // Mapped treatments filtered by selected treatment type
  const visibleMappedTreatments = mappedTreatments.filter((m) => m.case === treatmentType);

  // When type changes, fetch animals for that type
  const handleTypeChange = async (value: string) => {
    setSelectedAnimalType(value);
    setSelectedAnimal("");
    setSearchQuery("");
    setLoading(true);
    try {
      console.log('Fetching animals for type:', value);
      const res = await fetch(API_ENDPOINTS.treatmentsByType(value));
      console.log('Response status:', res.status);
      if (!res.ok) throw new Error(`Failed to load animals for type ${value}`);
      const data = await res.json();
      // data expected: [{ id, displayName }]
      // Map the backend data to our Animal interface

      const mappedAnimals: Animal[] = data.animals.map((it: any) => ({
      id: it.id ?? '',
      id2: it.id2 ?? '',
      name: it.displayName ?? it.name ?? '',
      animalType: value,
      id_number: it.id_number ?? '',
      age: it.age ?? '',
      sex: it.sex ?? it.gender ?? '',
      description: it.description ?? '',
      arrival_date: it.arrival_date ?? '',
      birth_date: it.birth_date ?? '',
      location: it.location ?? '',
      status: it.status ?? '',
      }));
      console.log('Mapped animals for UI:', mappedAnimals);
      setAnimals(mappedAnimals);
   
      // treatment types: unique list of 'case' strings
      const cases = Array.from(new Set(
        (data.protocols ?? [])
          .map((it: any) => it?.case)
          .filter(Boolean)
      )) as string[];
      setTreatmentTypes(cases);
      setTreatmentType(''); // reset current selection

      const mappedTreatmentsLocal: Treatment[] = (data.protocols || []).map((it: any, idx: number) => ({
        id: `${value}-${String(it.case)}-${idx}`,
        type: value,
        case: it.case,
        medication: it.medication ?? '',
        days: it.days ?? '',
        frequency: it.frequency ?? '',
        dosage: it.dosage ?? '',
        bodyPart: it.bodyPart ?? '',
        morning: it.morning ?? '',
        noon: it.noon ?? '',
        evening: it.evening ?? ''
      }));







      // Save mapped treatments into component state for the editable grid
      setMappedTreatments(mappedTreatmentsLocal);



  // Open the popover to show the loaded animals immediately (UI handles this automatically)
    } catch (e) {
      console.error('Error fetching animals by type:', e);
      toast.error('Failed to load animals for selected type');
      setAnimals([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate required fields
    if (!selectedAnimal || !treatmentType) {
      toast.error("נא למלא את כל השדות הנדרשים");
      return;
    }

    // Build rows from mappedTreatments: for each grid entry, expand into N rows
    // where N = days * (number of times per day checked)
    const rowsToSend: Array<Record<string, any>> = [];
    const baseDate = new Date(startDate);

    visibleMappedTreatments.forEach((mt) => {
      const daysNum = Number(mt.days) || 1;
//      const hasMorning = String(mt.morning) !== '' && mt.morning !== '0';
//      const hasNoon = String(mt.noon) !== '' && mt.noon !== '0';
//      const hasEvening = String(mt.evening) !== '' && mt.evening !== '0';
      const hasMorning = mt.morning ? 'FALSE' : '';
      const hasNoon = mt.noon ? 'FALSE' : '';
      const hasEvening = mt.evening ? 'FALSE' : '';
      const timesPerDay = (hasMorning ? 1 : 0) + (hasNoon ? 1 : 0) + (hasEvening ? 1 : 0);
      const frequency = Number(mt.frequency) || 1;
      if (timesPerDay === 0) return; // nothing to schedule for this row

      for (let d = 0, x = 1; d < daysNum; d+= frequency, x++) {
        const dateObj = new Date(baseDate);
        dateObj.setDate(baseDate.getDate() + d);
        const weekday = dateObj.toLocaleDateString('he-IL', { weekday: 'long' });

        // Duration increases by 1 each day
        const duration = (x).toString();
          rowsToSend.push({
            date: dateObj,
            day: weekday,
            morning: hasMorning,
            noon: hasNoon,
            evening: hasEvening,
            treatment: mt.medication,
            dosage: mt.dosage || '',
            'body part': mt.bodyPart || '',
            duration,
            location: '',
            case: mt.case || treatmentType,
            notes: notes || ''
          });

      }


    });

    // 1. Sort in place (allowed for const)
    rowsToSend.sort((a, b) => (b.date) - (a.date));

    // 2. Convert each ISO date to local date string (mutate each element)
    rowsToSend.forEach(row => {
      const d = new Date(row.date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      row.date = `${day}/${month}/${year}`;
    });


    console.log('Sorted rows to send:', rowsToSend);

    if (rowsToSend.length === 0) {
      toast.error('אין שורות לשליחה - נא למלא לפחות זמן אחד בשורה');
      return;
    }

    // Send all rows in a single bulk request
    (async () => {
      setLoading(true);
      try {
        console.log('Sending rows to backend:', rowsToSend);
        const res = await fetch(API_ENDPOINTS.treatmentsBulk(selectedAnimal, selectedAnimalType, { delete: 'FALSE' }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ treatments: rowsToSend })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown' }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        //const animalName = animals.find((a: Animal) => a.id.toString() === selectedAnimal)?.name;
        toast.success(`הטיפולים עבור ${selectedAnimal} נשמרו בהצלחה`);
        setTimeout(() => onBack(), 100);
      } catch (err) {
        console.error('Failed to save rows:', err);
        toast.error('שמירה נכשלה - נסה שוב');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">
          חזור
          <ArrowRight className="w-4 h-4" />
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-right">הוסף טיפול חדש</CardTitle>
            <CardDescription className="text-right">הזן את פרטי הטיפול המתוכנן או שבוצע</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-red-600 text-sm mb-2 text-right">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Animal Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="animal-type" className="text-right">סוג חיה *</Label>
                  <Select value={selectedAnimalType} onValueChange={handleTypeChange} required>
                    <SelectTrigger id="animal-type">
                      <SelectValue placeholder="בחר סוג חיה" />
                    </SelectTrigger>
                    <SelectContent>
                      {animalTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.emoji ? `${type.emoji} ${type.displayName}` : type.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Animal Selection - Shows after type is selected */}
                {selectedAnimalType && (
                  <div className="space-y-2">
                    <Label htmlFor="animal" className="text-right">בחר חיה *</Label>
                    <input
                      type="text"
                      className="w-full border rounded px-2 py-1 mb-2"
                      placeholder="חפש לפי שם או מספר מזהה..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ direction: 'rtl' }}
                    />
                    <Select value={selectedAnimal} onValueChange={(value: string) => setSelectedAnimal(value)} required>
                      <SelectTrigger id="animal">
                        <SelectValue placeholder="בחר חיה" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredAnimals.length === 0 ? (
                          <div className="px-2 py-2 text-gray-500">לא נמצאו חיות תואמות</div>
                        ) : (
                          filteredAnimals.map((animal, idx) => {
                            // Ensure value is never empty string
                            let value = animal.name?.toString().trim();
                            if (!value) value = (animal.id ?? '').toString().trim();
                            if (!value) value = (animal.id_number ?? '').toString().trim();
                            if (!value) value = `gen-${idx}`;
                            const label = animal.name || value;
                            const idNumberLabel = animal.id_number ? `(${animal.id_number})` : `(${animal.id})`;
                            return (
                              <SelectItem key={value} value={value}>
                                {label} {idNumberLabel}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="start-date" className="text-right">תאריך התחלה *</Label>
                  <Input
                    type="date"
                    id="start-date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className={cn("space-y-2 md:col-span-1", !selectedAnimalType && "md:col-start-2")}>
                  <Label htmlFor="treatment-type" className="text-right">סוג טיפול *</Label>
                  <Select value={treatmentType} onValueChange={setTreatmentType} required>
                    <SelectTrigger id="treatment-type">
                      <SelectValue placeholder="בחר סוג טיפול" />
                    </SelectTrigger>
                    <SelectContent>
                      {treatmentTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="caregiver" className="text-right">שם המטפל/ת</Label>
                  <Select value={caregiver} onValueChange={setCaregiver}>
                    <SelectTrigger id="caregiver">
                      <SelectValue placeholder="בחר מטפל/ת (אופציונלי)" />
                    </SelectTrigger>
                    <SelectContent>
                      {caregivers.length === 0 ? (
                        <div className="px-2 py-2 text-gray-500">אין מטפלים זמינים</div>
                      ) : (
                        caregivers.map((person) => (
                          <SelectItem key={person} value={person}>
                            {person}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Editable grid: show only after a treatment type is selected */}
                {treatmentType && (
                  <div className="md:col-span-2">
                    <div className="flex justify-end mb-2">
                      <Button
                        type="button"
                        onClick={() => {
                          const newRow: Treatment = {
                            id: `new-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
                            type: selectedAnimalType || '',
                            case: treatmentType,
                            medication: '',
                            days: '',
                            frequency: '',
                            dosage: '',
                            bodyPart: '',
                            morning: '',
                            noon: '',
                            evening: ''
                          };
                          setMappedTreatments(prev => [...prev, newRow]);
                        }}
                      >
                        הוסף שורה
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded border bg-white p-3">
                      <table className="w-full text-sm table-fixed">
                        <thead>
                          <tr className="text-right">
                            <th className="px-2 py-1">תרופה</th>
                            <th className="px-2 py-1">ימים</th>
                            <th className="px-2 py-1">תדירות</th>
                            <th className="px-2 py-1">מינון</th>
                            <th className="px-2 py-1">מתן</th>
                            <th className="px-2 py-1">בוקר</th>
                            <th className="px-2 py-1">צהריים</th>
                            <th className="px-2 py-1">ערב</th>
                            <th className="px-2 py-1"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMappedTreatments.map((mt) => (
                            <tr key={mt.id ?? `${mt.case}-${Math.random()}`} className="border-t">
                              <td className="px-2 py-2">
                                <Input
                                  value={mt.medication}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, medication: e.target.value } : p));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  value={mt.days}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, days: e.target.value } : p));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  value={mt.frequency}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, frequency: e.target.value } : p));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  value={mt.dosage}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, dosage: e.target.value } : p));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  value={mt.bodyPart}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, bodyPart: e.target.value } : p));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={String(mt.morning) !== '' && mt.morning !== '0'}
                                  onChange={(e) => setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, morning: e.target.checked ? '1' : '' } : p))}
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={String(mt.noon) !== '' && mt.noon !== '0'}
                                  onChange={(e) => setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, noon: e.target.checked ? '1' : '' } : p))}
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={String(mt.evening) !== '' && mt.evening !== '0'}
                                  onChange={(e) => setMappedTreatments(prev => prev.map(p => p.id === mt.id ? { ...p, evening: e.target.checked ? '1' : '' } : p))}
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setMappedTreatments(prev => prev.filter(p => p.id !== mt.id))}
                                >
                                  הסר
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes" className="text-right">הערות</Label>
                  <Textarea
                    id="notes"
                    placeholder="הערות נוספות על הטיפול..."
                    value={notes}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1 gap-2" disabled={loading}>
                  <Save className="w-4 h-4" />
                  שמור טיפול
                </Button>
                <Button type="button" variant="outline" onClick={onBack}>
                  ביטול
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}