import type { ClinicalPrescription, MedicationItem } from '../types/clinical';
import { SAMPLE_CASES, getTodayFormatted } from '../data/mockClinicalData';

export interface ExtractionResult {
  prescription: ClinicalPrescription;
  source: 'demo' | 'gemini';
  note?: string;
}

export interface AudioTranscriptionResult {
  transcript: string;
  source: 'gemini' | 'fallback';
  note?: string;
}

// Verified active fast flash models with automatic fallback
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
];

const ENV_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';

const GEMINI_SYSTEM_PROMPT = `You are a clinical assistant for doctors in Bangladesh.
Convert the Bangla-English doctor-patient conversation into a clean, concise prescription JSON object.
Return ONLY valid JSON with this exact schema:
{
  "patient": {
    "name": "string (patient name if mentioned, else '')",
    "age": "string (e.g., '34 yrs', else '')",
    "gender": "Male" | "Female" | "Other",
    "allergies": "string (e.g., 'No known drug allergies', else '')"
  },
  "chiefComplaints": ["specific short symptom bullet (2-6 words each)"],
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
STRICT RULES:
1. chiefComplaints MUST contain ONLY specific medical symptoms or patient complaints as short bullet items (2-6 words each, one symptom per item — e.g., "Fever (101°F) for 3 days", "Dry cough", "Headache", "Acidity / heartburn").
2. NEVER copy full sentences, greetings, doctor questions, or the entire conversation into chiefComplaints.
3. If no symptoms or complaints have been mentioned yet, return "chiefComplaints": [].
4. Only extract fields actually mentioned in the conversation; leave unmentioned fields empty. Preserve Bangladeshi brand names mentioned by the doctor.`;

function generateVisitId(): string {
  return `RX-BD-${Math.floor(4000 + Math.random() * 5999)}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

function normalizeAudioMimeType(rawType: string): string {
  const base = (rawType || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (
    base === 'audio/webm' ||
    base === 'audio/mp4' ||
    base === 'audio/mpeg' ||
    base === 'audio/ogg' ||
    base === 'audio/wav' ||
    base === 'audio/aac'
  ) {
    return base;
  }
  return 'audio/webm';
}

/**
 * Unified Gemini request transport:
 * 1. If a custom key is pasted in Settings, call Gemini directly with it.
 * 2. Otherwise call `/api/gemini` (Vercel Serverless Proxy using server-side GEMINI_API_KEY).
 * 3. If `/api/gemini` is unavailable (local `vite dev`), fall back to `VITE_GEMINI_API_KEY` from `.env.local`.
 */
async function callGeminiModel(
  model: string,
  payload: Record<string, unknown>,
  userApiKey: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const customKey = userApiKey.trim();

    if (customKey) {
      return await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          customKey
        )}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    }

    // Try Vercel Serverless Proxy first so anyone clicking the Vercel link needs zero setup
    try {
      const proxyRes = await fetch('/api/gemini', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, payload }),
      });

      // If proxy exists and didn't 404 (e.g. deployed on Vercel), use its response
      if (proxyRes.status !== 404 && proxyRes.status !== 405) {
        if (proxyRes.ok || !ENV_API_KEY) {
          return proxyRes;
        }
      }
    } catch {
      // Ignore proxy network errors when running locally without Vercel serverless
    }

    // Local development fallback using gitignored .env.local
    if (ENV_API_KEY) {
      return await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          ENV_API_KEY
        )}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    }

    return new Response(
      JSON.stringify({
        error:
          'AI backend key not configured yet. Add GEMINI_API_KEY in Vercel Environment Variables or paste a key in Settings.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Transcribes recorded microphone audio using Gemini's native multimodal audio understanding.
 * Works across ALL browsers (Chrome, Safari, iOS, Firefox, Edge, Brave) on HTTPS/Vercel.
 */
export async function transcribeConsultationAudio(
  audioBlob: Blob,
  options: { apiKey: string; lang: 'bn-BD' | 'en-US'; demoMode: boolean }
): Promise<AudioTranscriptionResult> {
  if (!audioBlob || audioBlob.size < 400) {
    return {
      transcript: '',
      source: 'fallback',
      note: 'Recording was too short. Please speak clearly for at least 2 seconds.',
    };
  }

  if (options.demoMode) {
    return {
      transcript: '',
      source: 'fallback',
      note: 'Offline Demo Mode is on. Turn it off in Settings to transcribe live microphone audio with AI.',
    };
  }

  const base64Audio = await blobToBase64(audioBlob);
  const mimeType = normalizeAudioMimeType(audioBlob.type);
  const langHint =
    options.lang === 'bn-BD'
      ? 'The speaker may speak Bangla (বাংলা), English, or mixed Bangla-English (Benglish) with Bangladeshi medicine names (like Napa, Seclo, Fexo, Sergel, Monas) and lab tests (CBC, Dengue NS1).'
      : 'The speaker is speaking English (possibly with Bangladeshi medicine names or occasional Bangla words).';

  const prompt = `Transcribe this clinical consultation audio accurately.
${langHint}
Rules:
- Return ONLY the spoken transcript text (no timestamps, no commentary, no markdown).
- Preserve spoken Bangla in Bengali script and medical terms/drug names/numbers clearly.
- If the audio is silent or background noise with no speech, reply with exactly: [NO_SPEECH]`;

  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      const response = await callGeminiModel(
        model,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        options.apiKey,
        24000
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        lastError = `HTTP ${response.status}: ${errText.slice(0, 140)}`;
        if (response.status === 503 && errText.includes('GEMINI_API_KEY')) {
          break;
        }
        continue;
      }

      const payload = await response.json();
      const text: string = (payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

      if (!text || text.includes('[NO_SPEECH]')) {
        return {
          transcript: '',
          source: 'gemini',
          note: 'No clear speech heard. Please speak closer to your microphone and try again.',
        };
      }

      return {
        transcript: text,
        source: 'gemini',
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
    }
  }

  throw new Error(
    `Could not transcribe audio right now (${lastError.slice(0, 90)}).`
  );
}

const SYMPTOM_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Fever', regex: /\b(fever|febrile|pyrexia|high temp)\b|জ্বর/i },
  { label: 'Dry cough', regex: /\b(dry cough)\b|শুকনা কাশি|শুকনো কাশি/i },
  { label: 'Cough', regex: /\b(cough|coughing)\b|কাশি/i },
  { label: 'Body ache', regex: /\b(body ?ache|myalgia|muscle pain|body pain)\b|শরীর(?:ে|ের)? ব্যথা|গায়ে ব্যথা/i },
  { label: 'Headache', regex: /\b(headache|migraine|head pain)\b|মাথা ব্যথা/i },
  { label: 'Acidity / heartburn', regex: /\b(acidity|heartburn|acid reflux|gastric|gerd|gas)\b|এসিডিটি|বুক জ্বালাপোড়া|গ্যাস/i },
  { label: 'Chest pain', regex: /\b(chest pain|chest tightness|chest discomfort)\b|বুক(?:ে|ের)? ব্যথা/i },
  { label: 'Shortness of breath', regex: /\b(shortness of breath|breathlessness|dyspnea|breathing problem|asthma)\b|শ্বাসকষ্ট/i },
  { label: 'Sore throat', regex: /\b(sore throat|throat pain)\b|গলা ব্যথা/i },
  { label: 'Cold / runny nose', regex: /\b(cold|runny nose|nasal congestion|sneezing)\b|সর্দি|নাক বন্ধ|হাঁচি/i },
  { label: 'Abdominal pain', regex: /\b(abdominal pain|stomach pain|stomach ache|belly pain)\b|পেট(?:ে|ের)? ব্যথা/i },
  { label: 'Nausea', regex: /\b(nausea|nauseous)\b|বমি ভাব/i },
  { label: 'Vomiting', regex: /\b(vomit|vomiting)\b|বমি(?! ভাব)/i },
  { label: 'Diarrhea / loose motion', regex: /\b(diarrhea|diarrhoea|loose motion)\b|পাতলা পায়খানা|ডায়রিয়া/i },
  { label: 'Dizziness / vertigo', regex: /\b(dizziness|dizzy|vertigo|lightheaded)\b|মাথা ঘোরা/i },
  { label: 'Weakness / fatigue', regex: /\b(weakness|fatigue|tiredness|lethargy)\b|দুর্বলতা|ক্লান্তি/i },
  { label: 'Back pain', regex: /\b(back pain|lower back pain|backache)\b|কোমর(?:ে|ের)? ব্যথা|পিঠ(?:ে|ের)? ব্যথা/i },
  { label: 'Joint pain', regex: /\b(joint pain|knee pain|arthritis)\b|গিঁটে ব্যথা|হাঁটু ব্যথা/i },
  { label: 'Skin rash / itching', regex: /\b(rash|itching|itchy|allergy rash|hives)\b|চুলকানি|র‍্যাশ|ফুসকুড়ি/i },
  { label: 'Insomnia / poor sleep', regex: /\b(insomnia|can'?t sleep|sleeplessness)\b|ঘুম না আসা|ঘুম কম/i },
  { label: 'Loss of appetite', regex: /\b(loss of appetite|no appetite|anorexia)\b|ক্ষুধামন্দা|খাবারে অরুচি/i },
  { label: 'Burning urination', regex: /\b(burning urination|painful urination|uti)\b|প্রস্রাবে জ্বালাপোড়া/i },
];

function extractSpecificSymptoms(transcript: string): string[] {
  const found: string[] = [];
  const durationMatch = transcript.match(
    /(?:for|since|past|last|গত)?\s*(\d+|[০-৯]+)\s*(days?|weeks?|months?|hours?|দিন|সপ্তাহ|মাস)/i
  );
  const durationSuffix = durationMatch
    ? ` (${durationMatch[1].replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))} ${
        /সপ্তাহ|week/i.test(durationMatch[2])
          ? 'weeks'
          : /মাস|month/i.test(durationMatch[2])
            ? 'months'
            : /hour/i.test(durationMatch[2])
              ? 'hours'
              : 'days'
      })`
    : '';

  const tempMatch = transcript.match(/\b(99|100|101|102|103|104|105)(?:\.\d)?\s*°?\s*f?\b|([৯][৯]|১০০|১০১|১০২|১০৩|১০৪)\s*ডিগ্রি/i);

  for (const item of SYMPTOM_PATTERNS) {
    if (item.label === 'Cough' && found.some((f) => f.startsWith('Dry cough'))) {
      continue;
    }
    if (item.regex.test(transcript)) {
      if (item.label === 'Fever') {
        const tempVal = tempMatch
          ? (tempMatch[1] || tempMatch[2] || '').replace(/[০-৯]/g, (d) =>
              String('০১২৩৪৫৬৭৮৯'.indexOf(d))
            )
          : '';
        const tempPart = tempVal ? ` (${tempVal}°F)` : '';
        found.push(`Fever${tempPart}${durationSuffix}`);
      } else {
        found.push(item.label);
      }
    }
  }

  return found;
}

function sanitizeComplaints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: string[] = [];
  for (const entry of raw) {
    const str = String(entry || '')
      .replace(/^(doctor|patient|doc|pt)\s*:\s*/i, '')
      .replace(/^[-•*\d.)\s]+/, '')
      .trim();
    if (!str) continue;
    // Skip accidental full-dialogue lines or greetings
    if (/^(assalamu|walaikum|hello|hi doctor|good morning|good evening|আসসালামু|ওয়ালাইকুম)/i.test(str)) {
      continue;
    }
    if (str.length > 90 && (str.includes('?') || str.includes('।') || str.includes('.'))) {
      continue;
    }
    cleaned.push(str);
  }
  return Array.from(new Set(cleaned));
}

function runLocalFallback(transcript: string): ClinicalPrescription {
  const lower = transcript.toLowerCase();
  const isDefaultSample =
    lower.includes('তারিকুল') ||
    lower.includes('tariqul') ||
    (lower.includes('napa') && lower.includes('seclo') && lower.includes('fexo'));

  if (isDefaultSample) {
    const base = structuredClone(SAMPLE_CASES[0].extractedData);
    return {
      ...base,
      patient: { ...base.patient, date: getTodayFormatted() },
      isApproved: false,
      extractionSource: 'demo',
    };
  }

  const bpMatch = transcript.match(/\bbp\s*[:\-]?\s*(\d{2,3}\s*\/\s*\d{2,3})/i);
  const pulseMatch = transcript.match(/\bpulse\s*[:\-]?\s*(\d{2,3})/i);
  const spo2Match = transcript.match(/\bspo2\s*[:\-]?\s*(\d{2,3}%?)/i);

  return {
    patient: {
      name: '',
      age: '',
      gender: 'Male',
      date: getTodayFormatted(),
      visitId: generateVisitId(),
      allergies: /no\s+(?:known\s+)?(?:drug\s+)?allerg|অ্যালার্জি\s*নেই/i.test(transcript)
        ? 'No known drug allergies'
        : '',
    },
    chiefComplaints: extractSpecificSymptoms(transcript),
    vitals: {
      bp: bpMatch ? `${bpMatch[1].replace(/\s+/g, '')} mmHg` : '',
      pulse: pulseMatch ? `${pulseMatch[1]} bpm` : '',
      temp: '',
      spo2: spo2Match ? (spo2Match[1].endsWith('%') ? spo2Match[1] : `${spo2Match[1]}%`) : '',
      weight: '',
      physicalFindings: '',
    },
    investigations: [],
    medications: [],
    advice: [],
    followUp: '',
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

  if (options.demoMode) {
    await new Promise((r) => setTimeout(r, 500));
    return {
      prescription: runLocalFallback(transcript),
      source: 'demo',
    };
  }

  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      const response = await callGeminiModel(
        model,
        {
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
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        options.apiKey,
        18000
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        lastError = `HTTP ${response.status}: ${errText.slice(0, 120)}`;
        if (response.status === 503 && errText.includes('GEMINI_API_KEY')) {
          break;
        }
        continue;
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

      const parsedComplaints = sanitizeComplaints(parsed.chiefComplaints);
      const chiefComplaints =
        parsedComplaints.length > 0 ? parsedComplaints : extractSpecificSymptoms(transcript);

      const prescription: ClinicalPrescription = {
        patient: {
          name: parsed?.patient?.name || '',
          age: parsed?.patient?.age || '',
          gender,
          date: getTodayFormatted(),
          visitId: generateVisitId(),
          allergies: parsed?.patient?.allergies || '',
        },
        chiefComplaints,
        vitals: {
          bp: parsed?.vitals?.bp || '',
          pulse: parsed?.vitals?.pulse || '',
          temp: parsed?.vitals?.temp || '',
          spo2: parsed?.vitals?.spo2 || '',
          weight: parsed?.vitals?.weight || '',
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

  return {
    prescription: runLocalFallback(transcript),
    source: 'demo',
    note: `Could not reach live AI (${lastError.slice(0, 70)}), drafted offline instead.`,
  };
}

export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  for (const model of GEMINI_MODELS) {
    try {
      const res = await callGeminiModel(
        model,
        {
          contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        },
        apiKey,
        10000
      );
      if (res.ok) {
        return {
          ok: true,
          message: apiKey.trim()
            ? `Connected with your custom Gemini key (${model}).`
            : `Connected to server-hosted Gemini AI (${model}) — ready for all users!`,
        };
      }
    } catch {
      // try next
    }
  }
  return {
    ok: false,
    message:
      'Could not connect yet. Make sure GEMINI_API_KEY is added in Vercel Environment Variables (or paste a key here).',
  };
}
