import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  Play,
  CheckCircle2,
  Lock,
  Printer,
  Plus,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type {
  AppSettings,
  ClinicalPrescription,
  MedicationItem,
} from '../types/clinical';
import {
  SAMPLE_CASES,
  BD_FORMULARY_PRESETS,
  EMPTY_PRESCRIPTION,
} from '../data/mockClinicalData';
import {
  extractClinicalFields,
  transcribeConsultationAudio,
} from '../services/aiExtractor';
import { PrescriptionPrintModal } from './PrescriptionPrintModal';

interface ClinicalWorkspaceProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  resetSignal: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function buildDefaultTranscript(): string {
  return SAMPLE_CASES[0].lines.map((l) => `${l.speaker}: ${l.text}`).join('\n\n');
}

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const ClinicalWorkspace: React.FC<ClinicalWorkspaceProps> = ({
  settings,
  onUpdateSettings,
  resetSignal,
}) => {
  const [transcript, setTranscript] = useState<string>(() => buildDefaultTranscript());
  const [liveCaption, setLiveCaption] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isStreamingSample, setIsStreamingSample] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [prescription, setPrescription] = useState<ClinicalPrescription>(() => ({
    ...structuredClone(SAMPLE_CASES[0].extractedData),
    isApproved: false,
  }));

  const [newComplaint, setNewComplaint] = useState('');
  const [newTest, setNewTest] = useState('');
  const [newAdvice, setNewAdvice] = useState('');
  const [showQuickMeds, setShowQuickMeds] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // Refs for audio recording, live rolling sync, and race-free AI extraction
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeRef = useRef<string>('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const rollingAudioTimerRef = useRef<number | null>(null);
  const isRollingAudioBusyRef = useRef(false);
  const lastAudioChunkCountRef = useRef(0);
  const recordingBaseTranscriptRef = useRef('');
  const webSpeechReceivedRef = useRef(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const extractSeqRef = useRef(0);
  const lastExtractedTranscriptRef = useRef<string>(buildDefaultTranscript());
  const skipNextAutoExtractRef = useRef(false);

  // Always keep latest settings accessible inside async callbacks
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncPrescriptionFromText = useCallback(async (textToExtract: string) => {
    const trimmed = textToExtract.trim();
    if (trimmed.length < 8) return;
    if (trimmed === lastExtractedTranscriptRef.current) return;

    const seq = ++extractSeqRef.current;
    lastExtractedTranscriptRef.current = trimmed;
    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const result = await extractClinicalFields(trimmed, {
        apiKey: settingsRef.current.apiKey,
        demoMode: settingsRef.current.demoMode,
      });
      if (seq !== extractSeqRef.current) return; // Ignore stale response

      setPrescription((prev) => ({
        ...result.prescription,
        patient: {
          ...result.prescription.patient,
          visitId: prev.patient.visitId || result.prescription.patient.visitId,
          date: prev.patient.date || result.prescription.patient.date,
        },
        isApproved: false,
      }));

      if (result.note) {
        setStatusMessage(result.note);
      } else {
        setStatusMessage(null);
      }
    } catch (err) {
      if (seq === extractSeqRef.current) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not update prescription.');
      }
    } finally {
      if (seq === extractSeqRef.current) {
        setIsSyncing(false);
      }
    }
  }, []);

  // Automatically sync right-side Prescription Pad whenever conversation text changes
  useEffect(() => {
    if (isStreamingSample) return;
    if (skipNextAutoExtractRef.current) {
      skipNextAutoExtractRef.current = false;
      return;
    }

    const trimmed = transcript.trim();
    if (!trimmed || trimmed.length < 8 || trimmed === lastExtractedTranscriptRef.current) {
      return;
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void syncPrescriptionFromText(trimmed);
    }, 950);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [transcript, isStreamingSample, syncPrescriptionFromText]);

  const stopAudioMeterAndStream = () => {
    if (levelRafRef.current) {
      window.cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rollingAudioTimerRef.current) {
      window.clearInterval(rollingAudioTimerRef.current);
      rollingAudioTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setMicLevel(0);
    setLiveCaption('');
  };

  // Reset when doctor clicks "New Patient" in Navbar
  useEffect(() => {
    if (resetSignal === 0) return;
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopAudioMeterAndStream();
    extractSeqRef.current += 1;
    lastExtractedTranscriptRef.current = '';
    setIsListening(false);
    setIsSyncing(false);
    setIsStreamingSample(false);
    setRecordSeconds(0);
    setTranscript('');
    setPrescription(EMPTY_PRESCRIPTION());
    setStatusMessage(null);
    setErrorMessage(null);
    setMicNote(null);
  }, [resetSignal]);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        window.clearInterval(streamTimerRef.current);
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      stopAudioMeterAndStream();
    };
  }, []);

  /** Any manual edit gently clears approval so the doctor always approves the final Rx */
  const updatePrescription = (updater: (prev: ClinicalPrescription) => ClinicalPrescription) => {
    setPrescription((prev) => ({
      ...updater(prev),
      isApproved: false,
    }));
  };

  // --- Transcribe Rolling Audio Snapshot (keeps Safari/Firefox/mobile updating live!) ---
  const transcribeCurrentAudioSnapshot = async (isFinalStop: boolean) => {
    if (isRollingAudioBusyRef.current && !isFinalStop) return;
    const chunkCount = audioChunksRef.current.length;
    if (chunkCount === 0) return;
    if (!isFinalStop && chunkCount === lastAudioChunkCountRef.current) return;

    const blob = new Blob(audioChunksRef.current, { type: audioMimeRef.current });
    if (blob.size < 450) return;

    lastAudioChunkCountRef.current = chunkCount;
    isRollingAudioBusyRef.current = true;
    setIsSyncing(true);

    try {
      const result = await transcribeConsultationAudio(blob, {
        apiKey: settingsRef.current.apiKey,
        lang: settingsRef.current.speechLang,
        demoMode: settingsRef.current.demoMode,
      });

      const spoken = result.transcript.trim();
      if (spoken) {
        const base = recordingBaseTranscriptRef.current;
        const combined = base ? `${base}\n\n${spoken}` : spoken;
        skipNextAutoExtractRef.current = true;
        setTranscript(combined);
        await syncPrescriptionFromText(combined);
      } else if (isFinalStop && result.note && !webSpeechReceivedRef.current) {
        setMicNote(result.note);
      }
    } catch (err) {
      if (isFinalStop && !webSpeechReceivedRef.current) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Could not transcribe voice recording.'
        );
      }
    } finally {
      isRollingAudioBusyRef.current = false;
      setIsSyncing(false);
    }
  };

  // --- Universal Live Microphone (Simultaneously Fills Right Side While Speaking) ---
  const startListening = async () => {
    setMicNote(null);
    setErrorMessage(null);
    setStatusMessage(null);
    webSpeechReceivedRef.current = false;
    lastAudioChunkCountRef.current = 0;

    // If the default sample is still sitting untouched, start fresh for the live patient
    const isDefaultSample = transcript.trim() === buildDefaultTranscript().trim();
    const initialBase = isDefaultSample ? '' : transcript.trim();
    recordingBaseTranscriptRef.current = initialBase;
    if (isDefaultSample) {
      skipNextAutoExtractRef.current = true;
      lastExtractedTranscriptRef.current = '';
      setTranscript('');
      setPrescription(EMPTY_PRESCRIPTION());
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicNote(
        'Microphone access requires HTTPS (Vercel) and a modern browser like Chrome, Safari, or Edge.'
      );
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setMicNote(
        'Audio recording is not supported in this browser. Please open this link in Chrome or Safari.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = pickSupportedAudioMimeType();
      audioMimeRef.current = mimeType || 'audio/webm';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        audioMimeRef.current = recorder.mimeType || mimeType || 'audio/webm';
        stopAudioMeterAndStream();
        setIsListening(false);
        setRecordSeconds(0);

        // Final Gemini audio transcription + auto-fill pass so Bangla-English medical terms are exact
        await transcribeCurrentAudioSnapshot(true);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsListening(true);
      setRecordSeconds(0);

      // Live recording clock
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      // Periodic rolling audio transcription & right-side fill every 5s while speaking
      rollingAudioTimerRef.current = window.setInterval(() => {
        if (!webSpeechReceivedRef.current) {
          void transcribeCurrentAudioSnapshot(false);
        }
      }, 5000);

      // Real-time microphone volume meter
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioCtxRef.current = ctx;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setMicLevel(Math.min(100, Math.round((avg / 90) * 100)));
            levelRafRef.current = window.requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        // Optional visual meter
      }

      // Live Web Speech API stream for instant word-by-word simultaneous fill on Chrome/Edge/Safari
      try {
        const SpeechRecognitionCtor =
          (window as unknown as Record<string, new () => SpeechRecognitionLike>)
            .SpeechRecognition ||
          (window as unknown as Record<string, new () => SpeechRecognitionLike>)
            .webkitSpeechRecognition;

        if (SpeechRecognitionCtor) {
          const rec = new SpeechRecognitionCtor();
          rec.lang = settingsRef.current.speechLang;
          rec.continuous = true;
          rec.interimResults = true;

          let sessionSpoken = '';
          rec.onresult = (event) => {
            let interim = '';
            let gotFinal = false;
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const r = event.results[i];
              if (r.isFinal) {
                sessionSpoken = `${sessionSpoken} ${r[0].transcript}`.trim();
                gotFinal = true;
              } else {
                interim += r[0].transcript;
              }
            }

            if (gotFinal && sessionSpoken) {
              webSpeechReceivedRef.current = true;
              const base = recordingBaseTranscriptRef.current;
              const combined = base ? `${base}\n\n${sessionSpoken}` : sessionSpoken;
              setTranscript(combined);
            }
            setLiveCaption(interim);
          };

          rec.onerror = () => {
            // Silently let MediaRecorder + Gemini rolling sync handle everything
          };

          rec.start();
          recognitionRef.current = rec;
        }
      } catch {
        // MediaRecorder + Gemini rolling sync handles all browsers cleanly
      }
    } catch (err) {
      stopAudioMeterAndStream();
      setIsListening(false);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicNote(
          'Microphone permission was blocked. Tap the lock/mic icon in your browser address bar to allow microphone access, then try again.'
        );
      } else if (name === 'NotFoundError') {
        setMicNote(
          'No microphone was found on this device. Please connect a mic or type notes below.'
        );
      } else {
        setMicNote(
          'Could not access microphone. If you opened this inside WhatsApp/Facebook, tap "Open in Chrome / Safari" first.'
        );
      }
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopAudioMeterAndStream();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      void startListening();
    }
  };

  // --- Stream Sample Conversation & Simultaneously Fill Right-Side Boxes Line-by-Line ---
  const handleLoadSample = () => {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
    }
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    if (isListening) {
      stopListening();
    }

    const sample = SAMPLE_CASES[0];
    const lines = sample.lines;
    const fullData = structuredClone(sample.extractedData);

    setErrorMessage(null);
    setStatusMessage(null);
    setMicNote(null);
    setIsStreamingSample(true);
    setIsSyncing(true);

    // Start from a clean slate so doctor watches both sides populate simultaneously
    setPrescription(EMPTY_PRESCRIPTION());
    setTranscript(`${lines[0].speaker}: ${lines[0].text}`);

    let idx = 1;

    streamTimerRef.current = window.setInterval(() => {
      if (idx >= lines.length) {
        if (streamTimerRef.current) {
          window.clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
        }
        const finalText = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n\n');
        lastExtractedTranscriptRef.current = finalText;
        skipNextAutoExtractRef.current = true;
        setIsStreamingSample(false);
        setIsSyncing(false);
        return;
      }

      const currentIdx = idx;
      const line = lines[currentIdx];
      setTranscript((prev) => `${prev}\n\n${line.speaker}: ${line.text}`);

      // Simultaneously populate corresponding right-side fields as each line arrives
      if (currentIdx === 1) {
        setPrescription((prev) => ({
          ...prev,
          patient: {
            ...prev.patient,
            name: fullData.patient.name,
            age: fullData.patient.age,
            gender: fullData.patient.gender,
          },
          chiefComplaints: fullData.chiefComplaints.slice(0, 3),
        }));
      } else if (currentIdx === 3) {
        setPrescription((prev) => ({
          ...prev,
          patient: {
            ...prev.patient,
            allergies: fullData.patient.allergies,
          },
          chiefComplaints: fullData.chiefComplaints,
        }));
      } else if (currentIdx === 4) {
        setPrescription((prev) => ({
          ...prev,
          vitals: fullData.vitals,
          investigations: fullData.investigations,
        }));
      } else if (currentIdx === 5) {
        setPrescription((prev) => ({
          ...prev,
          medications: fullData.medications,
          advice: fullData.advice,
          followUp: fullData.followUp,
        }));
      }

      idx += 1;
    }, 800);
  };

  // --- Medicine helpers ---
  const updateMed = (id: string, patch: Partial<MedicationItem>) => {
    updatePrescription((p) => ({
      ...p,
      medications: p.medications.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const addMedicine = (preset?: (typeof BD_FORMULARY_PRESETS)[number]) => {
    updatePrescription((p) => ({
      ...p,
      medications: [
        ...p.medications,
        {
          id: `med-${Date.now()}`,
          brand: preset?.brand || '',
          generic: preset?.generic || '',
          dosage: preset?.dosage || '1+0+1',
          timing: preset?.timing || 'After meal',
          duration: preset?.duration || '5 days',
        },
      ],
    }));
    setShowQuickMeds(false);
  };

  const removeMed = (id: string) => {
    updatePrescription((p) => ({
      ...p,
      medications: p.medications.filter((m) => m.id !== id),
    }));
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12 items-start">
        {/* ============================================================== */}
        {/* LEFT PANEL: STEP 1 — LIVE LISTENING (AUTO-FILLS RIGHT SIDE)    */}
        {/* ============================================================== */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold tracking-wide text-[#0F766E] uppercase">
                Step 1
              </span>
              <h1 className="text-lg font-bold text-slate-900">Consultation Notes</h1>
            </div>

            {/* Clean Language Switch */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, speechLang: 'bn-BD' })}
                className={`rounded-lg px-2.5 py-1.5 transition-all ${
                  settings.speechLang === 'bn-BD'
                    ? 'bg-white text-[#0F766E] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, speechLang: 'en-US' })}
                className={`rounded-lg px-2.5 py-1.5 transition-all ${
                  settings.speechLang === 'en-US'
                    ? 'bg-white text-[#0F766E] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Big Friendly Voice & Sample Actions */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleListening}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                isListening
                  ? 'bg-rose-600 text-white shadow-sm ring-4 ring-rose-500/15'
                  : 'bg-[#0F766E] text-white shadow-xs hover:bg-teal-800'
              }`}
            >
              {isListening ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop Listening ({formatTimer(recordSeconds)})
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Start Mic
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isStreamingSample || isListening}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              {isStreamingSample ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#0F766E]" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current text-[#0F766E]" />
              )}
              Load Sample
            </button>
          </div>

          {/* Real Live Mic Volume Bar While Recording */}
          {isListening && (
            <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-800 space-y-2">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  Listening ({settings.speechLang === 'bn-BD' ? 'বাংলা + English' : 'English'}) —
                  filling prescription live...
                </span>
                <span className="font-mono">{formatTimer(recordSeconds)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-rose-200/80">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-75"
                  style={{ width: `${Math.max(8, micLevel)}%` }}
                />
              </div>
            </div>
          )}

          {liveCaption && isListening && (
            <p className="mt-2 rounded-xl bg-teal-50/70 px-3.5 py-2 font-bengali text-xs italic text-teal-800">
              {liveCaption}
            </p>
          )}

          {micNote && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
              {micNote}
            </p>
          )}

          {/* Clean, Easy-to-Read Transcript Area */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="consult-notes" className="text-xs font-medium text-slate-500">
                Speak or type — prescription pad fills automatically
              </label>
              {transcript && (
                <button
                  type="button"
                  onClick={() => {
                    lastExtractedTranscriptRef.current = '';
                    setTranscript('');
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              id="consult-notes"
              rows={15}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Press 'Start Mic' and talk naturally with your patient in Bangla or English. The prescription on the right will fill up automatically..."
              className="font-bengali w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#0F766E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {statusMessage && (
            <p className="mt-3 text-center text-xs font-medium text-[#0F766E]">{statusMessage}</p>
          )}
          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* RIGHT PANEL: STEP 2 — CLEAN DIGITAL PRESCRIPTION PAD           */}
        {/* ============================================================== */}
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs lg:col-span-7">
          {/* Calm Top Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-xs font-semibold tracking-wide text-[#0F766E] uppercase">
                  Step 2
                </span>
                <h2 className="text-lg font-bold text-slate-900">Prescription Pad</h2>
              </div>
              {isSyncing && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-[#0F766E]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Auto-filling live...
                </span>
              )}
            </div>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                prescription.isApproved
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {prescription.isApproved ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved by Doctor
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Waiting for Doctor Approval
                </>
              )}
            </span>
          </div>

          {/* Paper-like Prescription Content */}
          <div className="divide-y divide-slate-100 px-6">
            {/* Patient Strip */}
            <div className="py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-medium text-slate-400">Patient Name</label>
                  <input
                    type="text"
                    value={prescription.patient.name}
                    onChange={(e) =>
                      updatePrescription((p) => ({
                        ...p,
                        patient: { ...p.patient, name: e.target.value },
                      }))
                    }
                    placeholder="Enter patient name"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#0F766E] focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-400">Age</label>
                  <input
                    type="text"
                    value={prescription.patient.age}
                    onChange={(e) =>
                      updatePrescription((p) => ({
                        ...p,
                        patient: { ...p.patient, age: e.target.value },
                      }))
                    }
                    placeholder="34 yrs"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-400">Gender</label>
                  <select
                    value={prescription.patient.gender}
                    onChange={(e) =>
                      updatePrescription((p) => ({
                        ...p,
                        patient: {
                          ...p.patient,
                          gender: e.target.value as 'Male' | 'Female' | 'Other',
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:bg-white focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[11px] font-medium text-slate-400">Drug Allergies</label>
                  <input
                    type="text"
                    value={prescription.patient.allergies}
                    onChange={(e) =>
                      updatePrescription((p) => ({
                        ...p,
                        patient: { ...p.patient, allergies: e.target.value },
                      }))
                    }
                    placeholder="None"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-rose-700 focus:border-[#0F766E] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Symptoms & Vitals Side-by-Side */}
            <div className="grid grid-cols-1 gap-6 py-5 md:grid-cols-2">
              {/* Chief Complaints */}
              <div>
                <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                  Symptoms / Complaints
                </h3>
                <div className="mt-2.5 space-y-2">
                  {prescription.chiefComplaints.map((item, idx) => (
                    <div key={idx} className="group flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const next = [...prescription.chiefComplaints];
                          next[idx] = e.target.value;
                          updatePrescription((p) => ({ ...p, chiefComplaints: next }));
                        }}
                        className="w-full rounded-lg border border-transparent px-2 py-1 text-sm text-slate-800 hover:border-slate-200 focus:border-[#0F766E] focus:bg-slate-50/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updatePrescription((p) => ({
                            ...p,
                            chiefComplaints: p.chiefComplaints.filter((_, i) => i !== idx),
                          }))
                        }
                        className="rounded p-1 text-slate-300 hover:text-rose-500"
                        aria-label="Remove symptom"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="text"
                    value={newComplaint}
                    onChange={(e) => setNewComplaint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newComplaint.trim()) {
                        updatePrescription((p) => ({
                          ...p,
                          chiefComplaints: [...p.chiefComplaints, newComplaint.trim()],
                        }));
                        setNewComplaint('');
                      }
                    }}
                    placeholder="+ Add symptom..."
                    className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              {/* Vitals */}
              <div>
                <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                  Vitals &amp; Exam
                </h3>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: 'bp', label: 'BP', placeholder: '120/80' },
                      { key: 'pulse', label: 'Pulse', placeholder: '80 bpm' },
                      { key: 'temp', label: 'Temp', placeholder: '98.6 °F' },
                      { key: 'spo2', label: 'SpO₂', placeholder: '98%' },
                    ] as const
                  ).map((v) => (
                    <div
                      key={v.key}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="text-xs font-medium text-slate-400">{v.label}</span>
                      <input
                        type="text"
                        value={prescription.vitals[v.key]}
                        onChange={(e) =>
                          updatePrescription((p) => ({
                            ...p,
                            vitals: { ...p.vitals, [v.key]: e.target.value },
                          }))
                        }
                        placeholder={v.placeholder}
                        className="w-24 bg-transparent text-right text-xs font-semibold text-slate-900 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  value={prescription.vitals.physicalFindings}
                  onChange={(e) =>
                    updatePrescription((p) => ({
                      ...p,
                      vitals: { ...p.vitals, physicalFindings: e.target.value },
                    }))
                  }
                  placeholder="Brief exam note (e.g., Chest clear)..."
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-1.5 text-xs text-slate-700 focus:border-[#0F766E] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Investigations / Tests */}
            <div className="py-5">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                Tests Advised
              </h3>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {prescription.investigations.map((inv, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3.5 py-1.5 text-xs font-semibold text-[#0F766E]"
                  >
                    {inv}
                    <button
                      type="button"
                      onClick={() =>
                        updatePrescription((p) => ({
                          ...p,
                          investigations: p.investigations.filter((_, i) => i !== idx),
                        }))
                      }
                      className="rounded-full hover:text-rose-600"
                      aria-label="Remove test"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newTest}
                  onChange={(e) => setNewTest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTest.trim()) {
                      updatePrescription((p) => ({
                        ...p,
                        investigations: [...p.investigations, newTest.trim()],
                      }));
                      setNewTest('');
                    }
                  }}
                  placeholder="+ Add test & press Enter"
                  className="rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            {/* Rx Medications */}
            <div className="py-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-2xl font-bold leading-none text-[#0F766E]">
                    ℞
                  </span>
                  <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                    Medicines
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickMeds((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-teal-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Medicine
                </button>
              </div>

              {showQuickMeds && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BD_FORMULARY_PRESETS.map((preset) => (
                      <button
                        key={preset.brand}
                        type="button"
                        onClick={() => addMedicine(preset)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E]"
                      >
                        + {preset.brand}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => addMedicine()}
                      className="rounded-lg bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      + Custom Blank Row
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-2.5">
                {prescription.medications.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 py-5 text-center text-xs text-slate-400">
                    Medicines will appear here automatically as you speak, or click &ldquo;Add Medicine&rdquo;.
                  </p>
                ) : (
                  prescription.medications.map((med, idx) => (
                    <div
                      key={med.id}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 transition-colors hover:border-slate-300"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1.5 text-xs font-bold text-[#0F766E]">{idx + 1}.</span>
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              type="text"
                              value={med.brand}
                              onChange={(e) => updateMed(med.id, { brand: e.target.value })}
                              placeholder="Brand name (e.g., Tab. Napa Extra)"
                              className="rounded-lg border border-transparent bg-white px-2.5 py-1 text-sm font-bold text-slate-900 focus:border-[#0F766E] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={med.generic}
                              onChange={(e) => updateMed(med.id, { generic: e.target.value })}
                              placeholder="Generic name"
                              className="rounded-lg border border-transparent bg-white px-2.5 py-1 text-xs text-slate-500 focus:border-[#0F766E] focus:outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={med.dosage}
                              onChange={(e) => updateMed(med.id, { dosage: e.target.value })}
                              placeholder="1+0+1"
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-800 focus:border-[#0F766E] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={med.timing}
                              onChange={(e) => updateMed(med.id, { timing: e.target.value })}
                              placeholder="After meal"
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none"
                            />
                            <input
                              type="text"
                              value={med.duration}
                              onChange={(e) => updateMed(med.id, { duration: e.target.value })}
                              placeholder="5 days"
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-[#0F766E] focus:border-[#0F766E] focus:outline-none"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMed(med.id)}
                          className="mt-1 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                          aria-label="Remove medicine"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Advice & Follow-up */}
            <div className="py-5 space-y-3">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                Advice &amp; Follow-up
              </h3>
              <div className="space-y-1.5">
                {prescription.advice.map((adv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                    <input
                      type="text"
                      value={adv}
                      onChange={(e) => {
                        const next = [...prescription.advice];
                        next[idx] = e.target.value;
                        updatePrescription((p) => ({ ...p, advice: next }));
                      }}
                      className="w-full rounded-lg border border-transparent px-2 py-1 text-sm text-slate-800 hover:border-slate-200 focus:border-[#0F766E] focus:bg-slate-50/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updatePrescription((p) => ({
                          ...p,
                          advice: p.advice.filter((_, i) => i !== idx),
                        }))
                      }
                      className="rounded p-1 text-slate-300 hover:text-rose-500"
                      aria-label="Remove advice"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={newAdvice}
                  onChange={(e) => setNewAdvice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newAdvice.trim()) {
                      updatePrescription((p) => ({
                        ...p,
                        advice: [...p.advice, newAdvice.trim()],
                      }));
                      setNewAdvice('');
                    }
                  }}
                  placeholder="+ Add advice & press Enter"
                  className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-teal-50/60 px-3.5 py-2.5">
                <span className="shrink-0 text-xs font-bold text-[#0F766E]">Follow-up:</span>
                <input
                  type="text"
                  value={prescription.followUp}
                  onChange={(e) =>
                    updatePrescription((p) => ({ ...p, followUp: e.target.value }))
                  }
                  placeholder="e.g., After 3 days with reports"
                  className="w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SINGLE DOCTOR APPROVE BUTTON + PRINT PRESCRIPTION GATE         */}
          {/* ============================================================== */}
          <div className="border-t border-slate-200 bg-slate-50/90 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  setPrescription((prev) => ({ ...prev, isApproved: !prev.isApproved }))
                }
                className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                  prescription.isApproved
                    ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                    : 'border-2 border-[#0F766E] bg-white text-[#0F766E] hover:bg-teal-50'
                }`}
              >
                <CheckCircle2 className="h-5 w-5" />
                {prescription.isApproved ? 'Approved by Doctor' : 'Approve Prescription'}
              </button>

              <button
                type="button"
                disabled={!prescription.isApproved}
                onClick={() => setIsPrintOpen(true)}
                className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                  prescription.isApproved
                    ? 'bg-[#0F766E] text-white shadow-sm hover:bg-teal-800 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {prescription.isApproved ? (
                  <>
                    <Printer className="h-5 w-5" />
                    Print Prescription
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Print Prescription
                  </>
                )}
              </button>
            </div>

            {!prescription.isApproved && (
              <p className="mt-2.5 text-center text-xs text-slate-500">
                Please review the prescription above and click{' '}
                <strong className="text-slate-700">Approve Prescription</strong> to unlock printing.
              </p>
            )}
          </div>
        </section>
      </div>

      <PrescriptionPrintModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        prescription={prescription}
        doctor={settings.doctorProfile}
      />
    </div>
  );
};
