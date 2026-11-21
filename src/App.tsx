import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ClinicalWorkspace } from './components/ClinicalWorkspace';
import {
  DEFAULT_DOCTOR_PROFILE,
} from './data/mockClinicalData';
import type { AppSettings } from './types/clinical';

const SETTINGS_STORAGE_KEY = 'prescript_io_settings_v2';

function loadInitialSettings(): AppSettings {
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
        doctorProfile: DEFAULT_DOCTOR_PROFILE,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    apiKey: '',
    demoMode: false,
    speechLang: 'bn-BD',
    doctorProfile: DEFAULT_DOCTOR_PROFILE,
  };
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);
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
  }, [settings]);

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
          onUpdateSettings={setSettings}
          resetSignal={resetSignal}
        />
      </main>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />
    </div>
  );
};

export default App;
