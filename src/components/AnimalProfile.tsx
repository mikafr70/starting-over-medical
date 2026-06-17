import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ArrowRight, Calendar, Pill, Loader2, Upload, X, Pencil } from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import { toast } from "sonner";
import React from "react";

// Global cache to prevent duplicate fetches across all component instances
const profileCache = new Map<string, any>();
const fetchingProfiles = new Map<string, Promise<any>>();

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

  const toggle = (current: string | undefined): string =>
    current === 'TRUE' ? 'FALSE' : 'TRUE';

  const makeStyleWithCursor = (val: string | undefined) => ({
    ...makeStyle(toBool(val)),
    cursor: (val === 'TRUE' || val === 'FALSE') ? 'pointer' : 'default',
  });

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>

      {/* Morning */}
      <label dir="rtl" className="text-right block" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: makeStyleWithCursor(treatments.morning).cursor }}>
        <input
          type="checkbox"
          checked={treatments.morning === 'TRUE'}
          disabled={!treatments.morning || treatments.morning === ''}
          onChange={() => onChange('morning', toggle(treatments.morning))}
          style={makeStyleWithCursor(treatments.morning)}
        />
        בוקר
      </label>

      {/* Noon */}
      <label dir="rtl" className="text-right block" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: makeStyleWithCursor(treatments.noon).cursor }}>
        <input
          type="checkbox"
          checked={treatments.noon === 'TRUE'}
          disabled={!treatments.noon || treatments.noon === ''}
          onChange={() => onChange('noon', toggle(treatments.noon))}
          style={makeStyleWithCursor(treatments.noon)}
        />
        צהריים
      </label>

      {/* Evening */}
      <label dir="rtl" className="text-right block" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: makeStyleWithCursor(treatments.evening).cursor }}>
        <input
          type="checkbox"
          checked={treatments.evening === 'TRUE'}
          disabled={!treatments.evening || treatments.evening === ''}
          onChange={() => onChange('evening', toggle(treatments.evening))}
          style={makeStyleWithCursor(treatments.evening)}
        />
        ערב
      </label>

    </div>
  );
}

interface AnimalProfileProps {
  animalType: string;
  animalName: string;
  onBack: () => void;
  onAddTreatment?: (animalName: string) => void;
}

export function AnimalProfile({ animalType, animalName, onBack }: AnimalProfileProps) {
  // Editable animal data state
  const [editAnimal, setEditAnimal] = useState<any | null>(null);
  const [editTreatments, setEditTreatments] = useState<any[]>([]);
  const [savingAnimal, setSavingAnimal] = useState(false);
  const [isEditingPersonalInfo, setIsEditingPersonalInfo] = useState(false);
  const [savingTreatments, setSavingTreatments] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [animalPhoto, setAnimalPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [animal, setAnimal] = useState<any | null>(null);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [treatmentFilter, setTreatmentFilter] = useState<'today' | 'history' | 'future'>('today');

  console.log('$$$$$$$$$AnimalProfile Render:', { animalType, animalName });
  
  useEffect(() => {
    const fetchProfile = async () => {
      const fetchKey = `${animalType}||${animalName}`;
      
      // Always fetch photo
      fetchAnimalPhoto();
      
      // Check if we have cached data
      if (profileCache.has(fetchKey)) {
        console.log('Using cached profile data for:', fetchKey);
        const cachedData = profileCache.get(fetchKey);
        setAnimal(cachedData.animal);
        setEditAnimal(cachedData.animal);
        setTreatments(cachedData.treatments || []);
        setEditTreatments((cachedData.treatments || []).map((t: any) => ({ ...t })));
        setLoading(false);
        return;
      }
      
      // Check if fetch is already in progress
      if (fetchingProfiles.has(fetchKey)) {
        console.log('Waiting for in-progress fetch for:', fetchKey);
        const data = await fetchingProfiles.get(fetchKey);
        setAnimal(data.animal);
        setEditAnimal(data.animal);
        setTreatments(data.treatments || []);
        setEditTreatments((data.treatments || []).map((t: any) => ({ ...t })));
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        console.log(`Fetching animal by Name: ${animalName} of type: ${animalType}`);
        
        // Create and store the fetch promise
        const fetchPromise = fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalName))
          .then(res => {
            if (!res.ok) throw new Error('Failed to fetch animal profile');
            return res.json();
          })
          .then(data => {
            profileCache.set(fetchKey, data);
            fetchingProfiles.delete(fetchKey);
            return data;
          })
          .catch(err => {
            fetchingProfiles.delete(fetchKey);
            throw err;
          });
        
        fetchingProfiles.set(fetchKey, fetchPromise);
        const data = await fetchPromise;
        
        console.log('Fetched animal profile data:', data.treatments);
        setAnimal(data.animal);
        setEditAnimal(data.animal);
        setTreatments(data.treatments || []);
        setEditTreatments((data.treatments || []).map((t: any) => ({ ...t })));
      } catch (err) {
        console.error('Error fetching animal profile:', err);
        setAnimal(null);
        setEditAnimal(null);
        setTreatments([]);
        setEditTreatments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [animalName, animalType]);

  const fetchAnimalPhoto = async () => {
    try {
      const response = await fetch(`/api/animals/photo?animalType=${animalType}&animalName=${animalName}`);
      if (response.ok) {
        const data = await response.json();
        if (data.photo) {
          setAnimalPhoto(data.photo);
        }
      }
    } catch (err) {
      console.error('Error fetching animal photo:', err);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log('Starting compression for file:', file.name, 'Size:', file.size, 'bytes');
      
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('File read complete, creating image...');
        const img = new Image();
        
        img.onload = () => {
          console.log('Image loaded. Original dimensions:', img.width, 'x', img.height);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Make it square - use the larger dimension
          let size = Math.max(img.width, img.height);
          let maxSize = 400; // Larger starting size for better quality
          
          // Scale down if needed
          if (size > maxSize) {
            size = maxSize;
          }
          
          // Square canvas
          canvas.width = size;
          canvas.height = size;
          
          // Calculate crop to center the image in square
          let sourceX = 0;
          let sourceY = 0;
          let sourceSize = Math.min(img.width, img.height);
          
          if (img.width > img.height) {
            sourceX = (img.width - img.height) / 2;
            sourceSize = img.height;
          } else {
            sourceY = (img.height - img.width) / 2;
            sourceSize = img.width;
          }
          
          // Draw cropped square image
          ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
          
          // Start with higher quality
          let quality = 0.6;
          let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          console.log('Initial compression:', compressedBase64.length, 'characters at quality', quality);
          
          // Reduce quality only if needed to fit under limit
          while (compressedBase64.length > 45000 && quality > 0.1) {
            quality -= 0.05;
            compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            console.log('Reduced quality to', quality, '- size:', compressedBase64.length);
            
            // If quality is very low and still too big, reduce size
            if (quality <= 0.2 && compressedBase64.length > 45000) {
              size = Math.floor(size * 0.85);
              canvas.width = size;
              canvas.height = size;
              ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
              quality = 0.6; // Reset to higher quality
              compressedBase64 = canvas.toDataURL('image/jpeg', quality);
              console.log('Reduced size to', size, 'x', size, '- size:', compressedBase64.length);
            }
          }
          
          console.log('✅ Final compressed size:', compressedBase64.length, 'characters');
          console.log('✅ Final dimensions:', size, 'x', size, '(square)');
          console.log('✅ Final quality:', quality);
          
          // If still too large, reject
          if (compressedBase64.length > 45000) {
            console.error('❌ Image still too large after compression');
            reject(new Error('Image too large even after compression'));
            return;
          }
          
          resolve(compressedBase64);
        };
        
        img.onerror = (error) => {
          console.error('Failed to load image:', error);
          reject(new Error('Failed to load image'));
        };
        
        img.src = e.target?.result as string;
      };
      
      reader.onerror = (error) => {
        console.error('Failed to read file:', error);
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    console.log('🔵 handleFileUpload called with file:', file.name, file.type, file.size);
    
    if (!file.type.startsWith('image/')) {
      toast.error('אנא העלה קובץ תמונה');
      return;
    }

    setUploadingPhoto(true);
    console.log('🟢 Starting image compression...');
    
    try {
      // Compress image before uploading
      const compressedBase64 = await compressImage(file);
      
      console.log('🟢 Compressed image size:', compressedBase64.length, 'characters');
      
      // Upload to backend
      const response = await fetch('/api/animals/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animalType,
          animalName,
          photo: compressedBase64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload photo');
      }

      setAnimalPhoto(compressedBase64);
      toast.success('התמונה הועלתה בהצלחה');
    } catch (err: any) {
      console.error('🔴 Error uploading photo:', err);
      toast.error(err.message === 'Image too large even after compression' 
        ? 'התמונה גדולה מדי' 
        : 'שגיאה בהעלאת התמונה');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  if (loading) {
    return <div className="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
  }
  if (!animal) {
    return <div className="p-8 text-center text-red-600">לא נמצאה חיה</div>;
  }


  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg font-semibold">מעבד...</p>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">
          חזור
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Right side: animal data */}
          <Card className="lg:col-span-1">
            <CardContent className="p-6 space-y-2">
              {/* Photo Upload Section */}
              <div className="mb-4">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  {uploadingPhoto ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                      <p className="text-sm text-gray-600">מעלה תמונה...</p>
                    </div>
                  ) : animalPhoto ? (
                    <div className="relative">
                      <img 
                        src={animalPhoto} 
                        alt={editAnimal.name} 
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnimalPhoto(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">העלה תמונה או גרור לכאן</p>
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF</p>
                    </div>
                  )}
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-right text-[20px] font-bold">{editAnimal.name}</span>
                {isEditingPersonalInfo ? (
                  <input
                    className="text-right text-[18px] font-bold text-gray-600 bg-gray-100 rounded px-2 py-1"
                    value={editAnimal?.id ?? ''}
                    onChange={e => setEditAnimal((a: any) => ({ ...a, id: e.target.value }))}
                  />
                ) : (
                  <span className="text-right text-[18px] font-bold text-gray-600">{animal?.id ?? ''}</span>
                )}
                {!isEditingPersonalInfo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setEditAnimal(animal);
                      setIsEditingPersonalInfo(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                    ערוך
                  </Button>
                )}
              </div>
              <div className="space-y-1 text-sm">
                {[
                  ['מין', 'sex'],
                  ['מיקום', 'location'],
                  ['מטפל', 'in_treatment'],
                  ['שבב נוסף', 'id2'],
                  ['משקל', 'weight'],
                  ['תאריך הגעה', 'arrival_date'],
                  ['תאריך לידה', 'birth_date'],
                  ['טילוף מיוחד', 'special_trimming'],
                  ['תיאור', 'description'],
                  ['הערות', 'notes'],
                  ['מקור', 'source'],
                  ['סטטוס', 'status'],
                  ['חברויות', 'friends'],
                ].map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2">
                    <strong>{label}:</strong>
                    {isEditingPersonalInfo ? (
                      <input
                        className="flex-1 bg-gray-100 rounded px-2 py-1"
                        value={editAnimal?.[key] ?? ''}
                        onChange={e => setEditAnimal((a: any) => ({ ...a, [key]: e.target.value }))}
                      />
                    ) : (
                      <span className="flex-1">{animal?.[key] || '-'}</span>
                    )}
                  </div>
                ))}
              </div>
              {isEditingPersonalInfo && (
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    disabled={savingAnimal}
                    onClick={() => {
                      setEditAnimal(animal);
                      setIsEditingPersonalInfo(false);
                    }}
                  >
                    ביטול
                  </Button>
                  <Button
                    variant="default"
                    disabled={savingAnimal}
                    onClick={async () => {
                      setSavingAnimal(true);
                      setIsProcessing(true);
                      try {
                        const res = await fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalName), {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ animalType, updatedAnimal: editAnimal })
                        });
                        if (!res.ok) throw new Error('Failed to save animal data');
                        // Optionally refetch updated animal data
                        const updated = await res.json();
                        setAnimal(updated.animal);
                        setEditAnimal(updated.animal);
                        setIsEditingPersonalInfo(false);
                      } catch (err) {
                        // Optionally show error
                      } finally {
                        setSavingAnimal(false);
                        setIsProcessing(false);
                      }
                    }}
                  >
                    שמור נתונים
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Left side: treatments */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="w-5 h-5" style={{ color: '#A67C52' }} />
                    <span className="font-bold text-lg">רשומות טיפול</span>
                  </div>
                  <Button
                    variant="default"
                    disabled={savingTreatments}
                    className="ml-auto"
                    onClick={async () => {
                      setSavingTreatments(true);
                      setIsProcessing(true);
                      try {
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
                        const updated = await fetch(API_ENDPOINTS.treatmentsProfile(animalType, animalName));
                        const data = await updated.json();
                        setTreatments(data.treatments || []);
                        setEditTreatments((data.treatments || []).map((t: any) => ({ ...t })));
                      } catch (err) {
                        // Optionally show error
                      } finally {
                        setSavingTreatments(false);
                        setIsProcessing(false);
                      }
                    }}
                  >
                    שמור טיפולים
                  </Button>
                </div>
                {/* Filter tabs */}
                <div className="flex gap-2 mt-3" dir="rtl">
                  {([
                    { key: 'today', label: 'היום' },
                    { key: 'history', label: 'היסטוריה' },
                    { key: 'future', label: 'עתיד' },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setTreatmentFilter(tab.key)}
                      className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                        treatmentFilter === tab.key
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={treatmentFilter === tab.key ? { backgroundColor: '#6B9080' } : {}}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const parseDMY = (dateStr: string): Date | null => {
                    if (!dateStr) return null;
                    const [d, m, y] = dateStr.split(/[\/.-]/).map(Number);
                    if (!d || !m || !y) return null;
                    return new Date(y, m - 1, d);
                  };

                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  const filteredTreatments = editTreatments.filter(t => {
                    const d = parseDMY(t.date);
                    if (!d) return false;
                    d.setHours(0, 0, 0, 0);
                    if (treatmentFilter === 'today') return d.getTime() === today.getTime();
                    if (treatmentFilter === 'history') return d.getTime() < today.getTime();
                    return d.getTime() > today.getTime();
                  }).sort((a, b) => {
                    const da = parseDMY(a.date)!;
                    const db = parseDMY(b.date)!;
                    // history: newest first (descending); future: soonest first (ascending)
                    return treatmentFilter === 'future'
                      ? da.getTime() - db.getTime()
                      : db.getTime() - da.getTime();
                  });

                  const emptyMessages: Record<string, string> = {
                    today: 'לא נמצאו טיפולים להיום',
                    history: 'לא נמצאו טיפולים קודמים',
                    future: 'לא נמצאו טיפולים עתידיים',
                  };

                  return (
                <div className="space-y-3">
                  {filteredTreatments.length === 0 ? (
                    <div className="text-center text-gray-500">{emptyMessages[treatmentFilter]}</div>
                  ) : (
                    filteredTreatments.map((treatment) => {
                      // Find original index in editTreatments for onChange handlers
                      const idx = editTreatments.indexOf(treatment);
                      const isToday = treatmentFilter === 'today';
                      
                      return (
                        <div
                          key={treatment.id || idx}
                          className="p-4 rounded-lg border"
                          style={{ 
                            backgroundColor: isToday ? '#ffffffff' : '#FFFFFF',
                            borderColor: isToday ? '#6B9080' : '#E5E7EB',
                            borderWidth: isToday ? '2px' : '1px',
                            boxShadow: isToday ? '0 4px 6px -1px rgba(107, 144, 128, 0.2)' : 'none'
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4" style={{ color: isToday ? '#6B9080' : 'currentColor' }} />
                            <span style={{ fontWeight: isToday ? 'bold' : 'normal', color: isToday ? '#6B9080' : 'currentColor' }}>
                              {treatment.date} - {treatment.day}
                            </span>
                            {isToday && (
                              <Badge 
                                variant="default" 
                                className="mr-2"
                                style={{ backgroundColor: '#6B9080', color: '#FFFFFF' }}
                              >
                                להיום
                              </Badge>
                            )}
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
                    );
                    })
                  )}
                </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

