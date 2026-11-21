import type { ClinicalPrescription, MedicationItem } from '../types/clinical';
import { SAMPLE_CASES, getTodayFormatted } from '../data/mockClinicalData';

export interface ExtractionResult {
  prescription: ClinicalPrescription;
  source: 'demo' | 'gemini';
  note?: string;
}

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

const GEMINI_SYSTEM_PROMPT = `You are a clinical assistant for doctors in Bangladesh.
Convert the Bangla-English doctor-patient conversation into a clean, concise prescription JSON object.
Return ONLY valid JSON with this exact schema:
{
  "patient": {
    "name": "string (or 'Walk-in Patient')",
    "age": "string (e.g., '34 yrs')",
    "gender": "Male" | "Female" | "Other",
    "allergies": "string (e.g., 'No known drug allergies')"
  },
  "chiefComplaints": ["short clear symptom string"],
  "vitals": {
    "bp": "string",
    "pulse": "string",
    "temp": "string",
    "spo2": "string",
    "weight": "string",
    "physicalFindings": "short exam note"
  },
  "investigations": ["test name"],
  "medications": [
    {
      "brand": "Bangladeshi brand e.g. 'Tab. Napa Extra', 'Cap. Seclo 20mg'",
      "generic": "Generic name",
      "dosage": "BD format e.g. '1+0+1'",
      "timing": "e.g. 'After meal' or 'Before meal'",
      "duration": "e.g. '5 days'"
    }
  ],
  "advice": ["short patient advice"],
  "followUp": "short follow-up instruction"
}
Keep every item concise and easy for a busy doctor to read at a glance. Preserve Bangladeshi brand names mentioned by the doctor.`;

function generateVisitId(): string {
  return `RX-BD-${Math.floor(4000 + Math.random() * 5999)}`;
}

function runLocalFallback(transcript: string): ClinicalPrescription {
  const lower = transcript.toLowerCase();
  if (
    lower.includes('napa') ||
    lower.includes('seclo') ||
    lower.includes('fexo') ||
    lower.includes('তারিকুল') ||
    lower.includes('tariqul') ||
    lower.includes('জ্বর') ||
    lower.includes('fever')
  ) {
    const base = structuredClone(SAMPLE_CASES[0].extractedData);
    return {
      ...base,
      patient: { ...base.patient, date: getTodayFormatted() },
      isApproved: false,
      extractionSource: 'demo',
    };
  }

  return {
    patient: {
      name: 'Walk-in Patient',
      age: '—',
      gender: 'Male',
      date: getTodayFormatted(),
      visitId: generateVisitId(),
      allergies: 'None reported',
    },
    chiefComplaints: [transcript.trim().slice(0, 90) || 'General consultation'],
    vitals: {
      bp: '120/80 mmHg',
      pulse: '78 bpm',
      temp: '98.6 °F',
      spo2: '98%',
      weight: '—',
      physicalFindings: 'Routine exam',
    },
    investigations: [],
    medications: [
      {
        id: `med-${Date.now()}-1`,
        brand: 'Tab. Napa 500mg',
        generic: 'Paracetamol',
        dosage: '1+0+1',
        timing: 'After meal',
        duration: '5 days',
      },
    ],
    advice: ['Adequate rest and hydration.'],
    followUp: 'Review after 5 days if needed',
    isApproved: false,
    extractionSource: 'demo',
  };
}

export async function extractClinicalFields(
  transcript: string,
  options: { apiKey: string; demoMode: boolean }
): Promise<ExtractionResult> {
  if (!transcript.trim()) {
    throw new Error('Please speak into the mic, type notes, or load the sample conversation first.');
  }

  if (options.demoMode || !options.apiKey.trim()) {
    await new Promise((r) => setTimeout(r, 650));
    return {
      prescription: runLocalFallback(transcript),
      source: 'demo',
    };
  }

  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 16000);

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        options.apiKey.trim()
      )}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: GEMINI_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Conversation:\n${transcript}\n\nExtract the structured prescription JSON.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: 'application/json',
          },
        }),
      });

      window.clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        lastError = `HTTP ${response.status}: ${errText.slice(0, 120)}`;
        continue; // try next flash model
      }

      const payload = await response.json();
      const rawText: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = 'Empty AI response';
        continue;
      }

      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const medications: MedicationItem[] = Array.isArray(parsed.medications)
        ? parsed.medications.map(
            (m: Partial<MedicationItem>, idx: number): MedicationItem => ({
              id: `gem-${Date.now()}-${idx}`,
              brand: m.brand || 'Medicine',
              generic: m.generic || '',
              dosage: m.dosage || '1+0+1',
              timing: m.timing || 'After meal',
              duration: m.duration || '5 days',
            })
          )
        : [];

      const gRaw = String(parsed?.patient?.gender || 'Male').toLowerCase();
      const gender: 'Male' | 'Female' | 'Other' = gRaw.startsWith('f')
        ? 'Female'
        : gRaw.startsWith('o')
          ? 'Other'
          : 'Male';

      const prescription: ClinicalPrescription = {
        patient: {
          name: parsed?.patient?.name || 'Walk-in Patient',
          age: parsed?.patient?.age || '—',
          gender,
          date: getTodayFormatted(),
          visitId: generateVisitId(),
          allergies: parsed?.patient?.allergies || 'No known drug allergies',
        },
        chiefComplaints: Array.isArray(parsed.chiefComplaints) ? parsed.chiefComplaints : [],
        vitals: {
          bp: parsed?.vitals?.bp || '—',
          pulse: parsed?.vitals?.pulse || '—',
          temp: parsed?.vitals?.temp || '—',
          spo2: parsed?.vitals?.spo2 || '—',
          weight: parsed?.vitals?.weight || '—',
          physicalFindings: parsed?.vitals?.physicalFindings || '',
        },
        investigations: Array.isArray(parsed.investigations) ? parsed.investigations : [],
        medications,
        advice: Array.isArray(parsed.advice) ? parsed.advice : [],
        followUp: parsed.followUp || '',
        isApproved: false,
        extractionSource: 'gemini',
      };

      return { prescription, source: 'gemini' };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
    }
  }

  // Graceful fallback so a busy doctor is never stuck if internet drops
  return {
    prescription: runLocalFallback(transcript),
    source: 'demo',
    note: `Could not reach Gemini (${lastError.slice(0, 60)}), drafted offline instead.`,
  };
}

export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'Please enter a Gemini API key.' };
  }
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
          }),
        }
      );
      if (res.ok) {
        return { ok: true, message: `Connected to Gemini AI (${model}) successfully.` };
      }
    } catch {
      // try next
    }
  }
  return { ok: false, message: 'Could not verify key right now. Offline mode remains available.' };
}
