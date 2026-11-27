import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ClinicalWorkspace } from './components/ClinicalWorkspace';
import { DoctorWelcomeModal } from './components/DoctorWelcomeModal';
import type { AppSettings, DoctorProfile } from './types/clinical';

const SETTINGS_STORAGE_KEY = 'prescript_io_settings_v2';
const DOCTOR_STORAGE_KEY = 'prescript_io_doctor_v1';

const BLANK_DOCTOR_PROFILE: DoctorProfile = {
  name: '',
  qualifications: '',
  specialty: '',
  bmdcReg: '',
  chamberName: '',
  chamberAddress: '',
  visitingHours: '',
  phone: '',
};

function loadSavedDoctor(): DoctorProfile | null {
  try {
    const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DoctorProfile>;
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        return {
          ...BLANK_DOCTOR_PROFILE,
          ...parsed,
          name: parsed.name.trim(),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function loadInitialSettings(savedDoctor: DoctorProfile | null): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        apiKey:
          typeof parsed.apiKey === 'string' && parsed.apiKey.trim()
            ? parsed.apiKey
            : '',
        demoMode: typeof parsed.demoMode === 'boolean' ? parsed.demoMode : false,
        speechLang: parsed.speechLang === 'en-US' ? 'en-US' : 'bn-BD',
        doctorProfile: savedDoctor || BLANK_DOCTOR_PROFILE,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    apiKey: '',
    demoMode: false,
    speechLang: 'bn-BD',
    doctorProfile: savedDoctor || BLANK_DOCTOR_PROFILE,
  };
}

export const App: React.FC = () => {
  const [savedDoctor, setSavedDoctor] = useState<DoctorProfile | null>(loadSavedDoctor);
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadInitialSettings(savedDoctor)
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          apiKey: settings.apiKey,
          demoMode: settings.demoMode,
          speechLang: settings.speechLang,
        })
      );
    } catch {
      // ignore
    }
  }, [settings.apiKey, settings.demoMode, settings.speechLang]);

  const handleCompleteOnboarding = (profile: DoctorProfile) => {
    try {
      localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
    setSavedDoctor(profile);
    setSettings((prev) => ({ ...prev, doctorProfile: profile }));
  };

  const handleUpdateSettings = (next: AppSettings) => {
    setSettings(next);
    if (next.doctorProfile.name.trim()) {
      try {
        localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(next.doctorProfile));
      } catch {
        // ignore
      }
      setSavedDoctor(next.doctorProfile);
    }
  };

  const handleSwitchDoctor = () => {
    try {
      localStorage.removeItem(DOCTOR_STORAGE_KEY);
    } catch {
      // ignore
    }
    setIsSettingsOpen(false);
    setSavedDoctor(null);
    setSettings((prev) => ({ ...prev, doctorProfile: BLANK_DOCTOR_PROFILE }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <Navbar
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewPatient={() => setResetSignal((n) => n + 1)}
      />

      <main className="flex-1 pb-10">
        <ClinicalWorkspace
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          resetSignal={resetSignal}
        />
      </main>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onSwitchDoctor={handleSwitchDoctor}
      />

      {!savedDoctor && <DoctorWelcomeModal onComplete={handleCompleteOnboarding} />}
    </div>
  );
};

export default App;
