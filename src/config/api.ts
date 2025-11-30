// API configuration
// Now using relative paths since API routes are in the same Next.js app
export const API_ENDPOINTS = {
  caregiver: (email: string) => `/api/caregiver?email=${encodeURIComponent(email)}`,
  animals: (caregiver: string) => `/api/animals?caregiver=${encodeURIComponent(caregiver)}`,
  caregivers: () => `/api/caregivers`,
  treatments: (animalName?: string) => animalName 
    ? `/api/treatments?animalName=${encodeURIComponent(animalName)}`
    : `/api/treatments`,
  treatmentsProfile: (animalType: string, animalName: string) => `/api/treatments?profile=1&animalType=${encodeURIComponent(animalType)}&animalName=${encodeURIComponent(animalName)}`,
  treatmentsByType: (animalType: string) => `/api/treatments?animalType=${encodeURIComponent(animalType)}`,
  treatmentsBulk: (animalName: string, animalType: string, options?: { delete?: string }) => {
    const params = new URLSearchParams({
      animalName,
      animalType,
      ...(options?.delete && { delete: options.delete })
    });
    return `/api/treatments/bulk?${params.toString()}`;
  },
};
