export interface DoctorProfile {
  name: string;
  qualifications: string;
  specialty: string;
  bmdcReg: string;
  chamberName: string;
  chamberAddress: string;
  visitingHours: string;
  phone: string;
}

export interface PatientInfo {
  name: string;
  age: string;
  gender: 'Male' | 'Female' | 'Other';
  date: string;
  visitId: string;
  allergies: string;
}

export interface ClinicalVitals {
  bp: string;
  pulse: string;
  temp: string;
  spo2: string;
  weight: string;
  physicalFindings: string;
}

export interface MedicationItem {
  id: string;
  brand: string;
  generic: string;
  dosage: string;
  timing: string;
  duration: string;
}

export interface ClinicalPrescription {
  patient: PatientInfo;
  chiefComplaints: string[];
  vitals: ClinicalVitals;
  investigations: string[];
  medications: MedicationItem[];
  advice: string[];
  followUp: string;
  /** Single doctor-in-the-loop approval state */
  isApproved: boolean;
  extractionSource?: 'demo' | 'gemini';
}

export interface AppSettings {
  apiKey: string;
  demoMode: boolean;
  speechLang: 'bn-BD' | 'en-US';
  doctorProfile: DoctorProfile;
}

export interface SampleConsultationLine {
  speaker: 'Doctor' | 'Patient';
  text: string;
}

export interface SampleCase {
  id: string;
  title: string;
  lines: SampleConsultationLine[];
  extractedData: Omit<ClinicalPrescription, 'extractionSource'>;
}
