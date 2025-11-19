import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ArrowRight, Calendar, Pill } from "lucide-react";
import { API_ENDPOINTS } from "../config/api";



export function TreatmentCheckboxes({
  treatments,
  onChange
}: {
  treatments: { morning?: string; noon?: string; evening?: string };
  onChange: (field: 'morning' | 'noon' | 'evening', value: string) => void;
}) {

  // convert "TRUE" / "FALSE" / "" to boolean | ''
  const toBool = (val: string | undefined): boolean | '' =>
    val === 'TRUE' ? true : val === 'FALSE' ? false : '';

  const makeStyle = (value: boolean | '') => {
    if (value === true) return { filter: 'grayscale(0%)', opacity: 1 };     // black + checked
    if (value === false) return { filter: 'grayscale(0%)', opacity: 1 };    // black + unchecked
    return { filter: 'grayscale(100%)', opacity: 0.2 };                     // gray + empty
  };

  const toggle = (current: string | undefined): string => {
    if (current === '') return 'FALSE';        // from gray → black unchecked
    if (current === 'TRUE') return 'FALSE';    // checked → unchecked
    return 'TRUE';                             // unchecked → checked
  };

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>

      {/* Morning */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="checkbox"
          checked={treatments.morning === 'TRUE'}
          onChange={() => onChange('morning', toggle(treatments.morning))}
          style={makeStyle(toBool(treatments.morning))}
        />
        בוקר
      </label>

      {/* Noon */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="checkbox"
          checked={treatments.noon === 'TRUE'}
          onChange={() => onChange('noon', toggle(treatments.noon))}
          style={makeStyle(toBool(treatments.noon))}
        />
        צהריים
      </label>

      {/* Evening */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="checkbox"
          checked={treatments.evening === 'TRUE'}
          onChange={() => onChange('evening', toggle(treatments.evening))}
          style={makeStyle(toBool(treatments.evening))}
        />
        ערב
      </label>

    </div>
  );
}

interface AnimalProfileProps {
  animalType: string;
  animalId: string;
  onBack: () => void;
  onAddTreatment?: (animalId: number) => void;
}

export function AnimalProfile({ animalType, animalId, onBack }: AnimalProfileProps) {
  // Editable animal data state
  const [editAnimal, setEditAnimal] = useState<any | null>(null);
  const [editTreatments, setEditTreatments] = useState<any[]>([]);
  const [savingAnimal, setSavingAnimal] = useState(false);
  const [savingTreatments, setSavingTreatments] = useState(false);

  const [animal, setAnimal] = useState<any | null>(null);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  console.log('$$$$$$$$$AnimalProfile Render:', { animalType, animalId });
  
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalId));
        if (!res.ok) throw new Error('Failed to fetch animal profile');
        const data = await res.json();
        console.log('Fetched animal profile data:', data.treatments);
        setAnimal(data.animal);
        setEditAnimal(data.animal);
        setTreatments(data.treatments || []);
        setEditTreatments((data.treatments || []).map((t: any) => ({ ...t })));
      } catch (err) {
        setAnimal(null);
        setEditAnimal(null);
        setTreatments([]);
        setEditTreatments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [animalId]);

  if (loading) {
    return <div className="p-8 text-center">טוען נתוני חיה...</div>;
  }
  if (!animal) {
    return <div className="p-8 text-center text-red-600">לא נמצאה חיה</div>;
  }


  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">
          חזור
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Right side: animal data */}
          <Card className="lg:col-span-1">
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-right text-[20px] font-bold">{editAnimal.name}</span>
                <span className="text-right text-[18px] font-bold text-gray-600">{editAnimal.id}</span>
              </div>
              <div className="space-y-1 text-sm">
                {[
                  ['מין', 'sex'],
                  ['מיקום', 'location'],
                  ['בטיפול', 'in_treatment'],
                  ['שבב נוסף', 'id2'],
                  ['משקל', 'weight'],
                  ['תאריך הגעה', 'arrival_date'],
                  ['תאריך לידה', 'birth_date'],
                  ['טילוף מיוחד', 'special_trimming'],
                  ['תיאור', 'description'],
                  ['הערות', 'notes'],
                  ['תרופות', 'drugs'],
                  ['סירוס', 'castration'],
                  ['תילוע', 'deworming'],
                  ['מקור', 'source'],
                  ['סטטוס', 'status'],
                  ['חברויות', 'friends'],
                ].map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2">
                    <strong>{label}:</strong>
                    <input
                      className="flex-1 bg-gray-100 rounded px-2 py-1"
                      value={editAnimal?.[key] ?? ''}
                      onChange={e => setEditAnimal((a: any) => ({ ...a, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  variant="default"
                  disabled={savingAnimal}
                  onClick={async () => {
                    setSavingAnimal(true);
                    try {
                      const res = await fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalId), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ animalType, updatedAnimal: editAnimal })
                      });
                      if (!res.ok) throw new Error('Failed to save animal data');
                      // Optionally refetch updated animal data
                      const updated = await res.json();
                      setAnimal(updated.animal);
                      setEditAnimal(updated.animal);
                    } catch (err) {
                      // Optionally show error
                    } finally {
                      setSavingAnimal(false);
                    }
                  }}
                >
                  שמור נתונים
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Left side: treatments from last week */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="w-5 h-5" style={{ color: '#A67C52' }} />
                    <span className="font-bold text-lg">רשומות טיפול (שבוע אחרון)</span>
                  </div>
                  <Button
                    variant="default"
                    disabled={savingTreatments}
                    className="ml-auto"
                    onClick={async () => {
                      setSavingTreatments(true);
                      try {
                        // Ensure morning, noon, evening are always 'TRUE', 'FALSE', or ''
                        const normalizeCheckbox = (val: any) => {
                          if (val === 'TRUE') return 'TRUE';
                          if (val === 'FALSE') return 'FALSE';
                          return '';
                        };
                        const treatmentsToSave = editTreatments.map(t => ({
                          ...t,
                          morning: normalizeCheckbox(t.morning),
                          noon: normalizeCheckbox(t.noon),
                          evening: normalizeCheckbox(t.evening)
                        }));
                        const res = await fetch(API_ENDPOINTS.treatmentsBulk(animal.name, animalType, { delete: 'TRUE' }), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ treatments: treatmentsToSave })
                        });
                        if (!res.ok) throw new Error('Failed to save treatments');
                        // Optionally refetch updated treatments
                        const updated = await fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalId));
                        const data = await updated.json();
                        setTreatments(data.treatments || []);
                        setEditTreatments((data.treatments || []).map((t: any) => ({ ...t })));
                      } catch (err) {
                        // Optionally show error
                      } finally {
                        setSavingTreatments(false);
                      }
                    }}
                  >
                    שמור טיפולים
                  </Button>
                </div>
                <CardDescription className="text-right">
                  טיפולים שבוצעו או מתוכננים בשבוע האחרון
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editTreatments.length === 0 ? (
                    <div className="text-center text-gray-500">לא נמצאו טיפולים בשבוע האחרון</div>
                  ) : (
                    editTreatments.map((treatment, idx) => (
                      <div
                        key={treatment.id || idx}
                        className="p-4 rounded-lg border"
                        style={{ backgroundColor: '#FFFFFF' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>{treatment.date} - {treatment.day} </span>
                          <span className="ml-2 text-gray-500 text-sm"></span>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <div className="font-bold text-lg flex-1">{treatment.case} - {treatment.treatment} </div>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <div className="flex-1">
                            <strong>מינון:</strong>
                            <input
                              className="w-full bg-gray-100 rounded px-2 py-1"
                              value={treatment.dosage ?? ''}
                              onChange={e => setEditTreatments(prev => prev.map((t, i) => i === idx ? { ...t, dosage: e.target.value } : t))}
                            />
                          </div>
                          <div className="flex-1">
                            <strong>מתן:</strong>
                            <input
                              className="w-full bg-gray-100 rounded px-2 py-1"
                              value={treatment.administration ?? ''}
                              onChange={e => setEditTreatments(prev => prev.map((t, i) => i === idx ? { ...t, administration: e.target.value } : t))}
                            />
                          </div>
                          <div className="flex-1">
                            <strong>הערות:</strong>
                            <input
                              className="w-full bg-gray-100 rounded px-2 py-1"
                              value={treatment.notes ?? ''}
                              onChange={e => setEditTreatments(prev => prev.map((t, i) => i === idx ? { ...t, notes: e.target.value } : t))}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end mb-2">
                          <TreatmentCheckboxes
                            treatments={{
                              morning: treatment.morning,
                              noon: treatment.noon,
                              evening: treatment.evening
                            }}
                            onChange={(field, value) => {
                              setEditTreatments(prev =>
                                prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
                              );
                            }}
                          />
                        </div>
                        <div className="flex gap-2 mr-auto">
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setEditTreatments(prev => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            מחק טיפול
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

