import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { API_ENDPOINTS } from "../config/api";

interface Animal {
  id: string;
  animalType: string;
  id_number?: string;
  name: string;
  gender?: string;
  location?: string;
}

interface AnimalType {
  id: string;
  displayName: string;
  emoji?: string;
}

interface MedicalRecordsProps {
  onOpenProfile: (selectedAnimalType: string, selectedAnimalId: string) => void;
  onBack: () => void;
}

export function MedicalRecords({ onOpenProfile, onBack }: MedicalRecordsProps) {
  const [animalTypes, setAnimalTypes] = useState<AnimalType[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimal, setSelectedAnimal] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
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
    loadTypes();
  }, []);

  
  const handleTypeChange = async (value: string) => {
    setSelectedType(value);
    setSelectedAnimal("");
    try {
      const res = await fetch(API_ENDPOINTS.treatmentsByType(value));
      if (!res.ok) throw new Error('Failed to load animals');
      const data = await res.json();
      console.log('Fetched animals data:', data);
      const raw = Array.isArray(data.animals) ? data.animals : [];
      const mappedAnimals: Animal[] = raw.map((it: any, idx: number) => {
        const rawId = (it.id ?? it.id_number ?? '').toString().trim();
        const id = rawId !== '' ? rawId : `gen-${idx}`; // ensure non-empty value for Select
        const name = (it.displayName || it.name || '').toString();
        return {
          id,
          type: value,
          id_number: it.id_number ?? it.id ?? undefined,
          name: name || `#${id}`,
          gender: it.gender,
          location: it.location
        };
      });
      console.log('Mapped animals for UI:', mappedAnimals);
      setAnimals(mappedAnimals);
    } catch (err) {
      console.error(err);
      setAnimals([]);
      toast.error('לא ניתן לטעון חיות עבור סוג זה');
    }
  };

  // Filter animals by search query (name or id_number)
  const filteredAnimals = animals.filter(a => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const name = a.name?.toLowerCase() || "";
    const idNum = a.id_number?.toString().toLowerCase() || "";
    const id = a.id?.toLowerCase() || "";
    return name.includes(query) || idNum.includes(query) || id.includes(query);
  });

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">חזור</Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-right">תיקים רפואיים</CardTitle>
            <CardDescription className="text-right">בחר חיה כדי לצפות בפרטי הרפואיים</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-right">בחר סוג חיה</Label>
                <Select value={selectedType} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סוג חיה" />
                  </SelectTrigger>
                  <SelectContent>
                    {animalTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ${t.displayName}` : t.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-right">בחר חיה</Label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 mb-2"
                  placeholder="חפש לפי שם או מספר מזהה..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ direction: "rtl" }}
                />
                <Select value={selectedAnimal} onValueChange={(v: string) => setSelectedAnimal(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר חיה" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredAnimals.length === 0 ? (
                      <div className="px-2 py-2 text-gray-500">לא נמצאו חיות תואמות</div>
                    ) : (
                      filteredAnimals.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name} {a.id_number ? `(${a.id_number})` : `(${a.id})`}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Button disabled={!selectedAnimal} onClick={() => onOpenProfile(selectedType, selectedAnimal)}>פתח תיק</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default MedicalRecords;
