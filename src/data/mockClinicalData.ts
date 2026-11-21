import type { ClinicalPrescription, DoctorProfile, SampleCase } from '../types/clinical';

export const DEFAULT_DOCTOR_PROFILE: DoctorProfile = {
  name: 'Dr. Farhana Rahman',
  qualifications: 'MBBS (DMC), FCPS (Medicine)',
  specialty: 'Consultant — Internal Medicine',
  bmdcReg: 'A-48291',
  chamberName: 'Dhanmondi Specialized Consultation Chamber',
  chamberAddress: 'House 14, Road 4, Dhanmondi, Dhaka-1205',
  visitingHours: 'Sat – Thu: 5:00 PM – 9:30 PM (Friday Closed)',
  phone: '+880 1711-048291',
};

export const BD_FORMULARY_PRESETS = [
  { brand: 'Tab. Napa Extra', generic: 'Paracetamol 500mg + Caffeine 65mg', dosage: '1+0+1', timing: 'After meal', duration: '5 days' },
  { brand: 'Cap. Seclo 20mg', generic: 'Omeprazole', dosage: '1+0+0', timing: 'Before meal', duration: '7 days' },
  { brand: 'Tab. Fexo 120mg', generic: 'Fexofenadine HCl', dosage: '0+0+1', timing: 'After meal', duration: '7 days' },
  { brand: 'Cap. Sergel 20mg', generic: 'Esomeprazole', dosage: '1+0+1', timing: 'Before meal', duration: '14 days' },
  { brand: 'Tab. Monas 10mg', generic: 'Montelukast Sodium', dosage: '0+0+1', timing: 'At bedtime', duration: '14 days' },
  { brand: 'Tab. Azith 500mg', generic: 'Azithromycin', dosage: '1+0+0', timing: 'After meal', duration: '5 days' },
  { brand: 'Tab. Osartil 50mg', generic: 'Losartan Potassium', dosage: '1+0+0', timing: 'After meal', duration: '30 days' },
  { brand: 'Tab. Comet 500mg', generic: 'Metformin HCl', dosage: '1+0+1', timing: 'After meal', duration: '30 days' },
];

export function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const SAMPLE_CASES: SampleCase[] = [
  {
    id: 'viral-fever-dengue',
    title: 'Viral Fever & Acidity',
    lines: [
      {
        speaker: 'Doctor',
        text: 'আসসালামু আলাইকুম। আপনার নাম আর বয়সটা বলবেন? কী সমস্যা হচ্ছে?',
      },
      {
        speaker: 'Patient',
        text: 'ওয়ালাইকুম আসসালাম ডাক্তার আপা। আমার নাম মোঃ তারিকুল ইসলাম, বয়স ৩৪। গত ৩ দিন ধরে ১০১° জ্বর, সারা শরীরে ব্যথা আর শুকনা কাশি।',
      },
      {
        speaker: 'Doctor',
        text: 'গ্যাসের সমস্যা বা কোনো ওষুধে অ্যালার্জি আছে কি?',
      },
      {
        speaker: 'Patient',
        text: 'একটু বুক জ্বালাপোড়া আর এসিডিটি আছে। কোনো ওষুধে অ্যালার্জি নেই।',
      },
      {
        speaker: 'Doctor',
        text: 'BP 120/78, Pulse 88, Temp 101.2°F, SpO2 98%। চেস্ট ক্লিয়ার আছে। সেফটির জন্য আজকেই একটা CBC আর Dengue NS1 Antigen টেস্ট করাবেন।',
      },
      {
        speaker: 'Doctor',
        text: 'ওষুধ দিচ্ছি — Tab. Napa Extra ১+০+১ খাওয়ার পর ৫ দিন, Cap. Seclo 20mg ১+০+০ খাওয়ার আগে ৭ দিন, আর Tab. Fexo 120mg ০+০+১ রাতে ৭ দিন। প্রচুর পানি ও বিশ্রাম নেবেন, ডেঙ্গু রিপোর্ট নেগেটিভ না আসা পর্যন্ত ব্যথার ওষুধ খাবেন না। ৩ দিন পর রিপোর্ট নিয়ে আসবেন।',
      },
    ],
    extractedData: {
      patient: {
        name: 'Md. Tariqul Islam',
        age: '34 yrs',
        gender: 'Male',
        date: getTodayFormatted(),
        visitId: 'RX-BD-4821',
        allergies: 'No known drug allergies',
      },
      chiefComplaints: [
        'Fever (101°F) for 3 days',
        'Body ache & weakness',
        'Dry cough',
        'Acidity / heartburn',
      ],
      vitals: {
        bp: '120/78 mmHg',
        pulse: '88 bpm',
        temp: '101.2 °F',
        spo2: '98%',
        weight: '68 kg',
        physicalFindings: 'Chest clear, no rash.',
      },
      investigations: ['CBC (Complete Blood Count)', 'Dengue NS1 Antigen'],
      medications: [
        {
          id: 'med-1',
          brand: 'Tab. Napa Extra',
          generic: 'Paracetamol + Caffeine',
          dosage: '1+0+1',
          timing: 'After meal',
          duration: '5 days',
        },
        {
          id: 'med-2',
          brand: 'Cap. Seclo 20mg',
          generic: 'Omeprazole',
          dosage: '1+0+0',
          timing: 'Before meal',
          duration: '7 days',
        },
        {
          id: 'med-3',
          brand: 'Tab. Fexo 120mg',
          generic: 'Fexofenadine HCl',
          dosage: '0+0+1',
          timing: 'After meal',
          duration: '7 days',
        },
      ],
      advice: [
        'Complete rest and drink plenty of water / ORS (2.5–3L daily).',
        'Avoid NSAID painkillers until Dengue NS1 report is negative.',
      ],
      followUp: 'After 3 days with CBC & Dengue NS1 reports',
      isApproved: false,
    },
  },
];

export const EMPTY_PRESCRIPTION = (): ClinicalPrescription => ({
  patient: {
    name: '',
    age: '',
    gender: 'Male',
    date: getTodayFormatted(),
    visitId: `RX-BD-${Math.floor(1000 + Math.random() * 9000)}`,
    allergies: 'None',
  },
  chiefComplaints: [],
  vitals: {
    bp: '',
    pulse: '',
    temp: '',
    spo2: '',
    weight: '',
    physicalFindings: '',
  },
  investigations: [],
  medications: [],
  advice: [],
  followUp: '',
  isApproved: false,
});
