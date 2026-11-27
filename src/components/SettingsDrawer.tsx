import React, { useState } from 'react';
import {
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  UserRound,
} from 'lucide-react';
import type { AppSettings } from '../types/clinical';
import { testGeminiApiKey } from '../services/aiExtractor';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onSwitchDoctor: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onSwitchDoctor,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testGeminiApiKey(settings.apiKey);
    setTestResult(result);
    setTesting(false);
    if (result.ok && settings.demoMode) {
      onUpdateSettings({ ...settings, demoMode: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs no-print">
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">Chamber &amp; AI Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Editable Doctor Profile */}
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                <UserRound className="h-3.5 w-3.5 text-[#0F766E]" />
                Doctor Profile
              </span>
              <button
                type="button"
                onClick={onSwitchDoctor}
                className="text-xs font-semibold text-[#0F766E] hover:underline"
              >
                Switch Doctor
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Doctor Name</label>
                <input
                  type="text"
                  value={settings.doctorProfile.name}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      doctorProfile: { ...settings.doctorProfile, name: e.target.value },
                    })
                  }
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Degree</label>
                  <input
                    type="text"
                    value={settings.doctorProfile.qualifications}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        doctorProfile: {
                          ...settings.doctorProfile,
                          qualifications: e.target.value,
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">BMDC Reg.</label>
                  <input
                    type="text"
                    value={settings.doctorProfile.bmdcReg}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        doctorProfile: { ...settings.doctorProfile, bmdcReg: e.target.value },
                      })
                    }
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Chamber Address</label>
                <input
                  type="text"
                  value={settings.doctorProfile.chamberAddress}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      doctorProfile: {
                        ...settings.doctorProfile,
                        chamberAddress: e.target.value,
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Live AI vs Offline Demo Toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Offline Demo Mode</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Turn on only if chamber internet is down.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.demoMode}
              onClick={() => onUpdateSettings({ ...settings, demoMode: !settings.demoMode })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.demoMode ? 'bg-amber-500' : 'bg-[#0F766E]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                  settings.demoMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Gemini API Key */}
          <div className="space-y-2.5">
            <label
              htmlFor="gemini-key-input"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
            >
              <KeyRound className="h-4 w-4 text-[#0F766E]" />
              Gemini AI API Key
            </label>

            <div className="relative">
              <input
                id="gemini-key-input"
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => {
                  onUpdateSettings({
                    ...settings,
                    apiKey: e.target.value,
                    demoMode: false,
                  });
                  setTestResult(null);
                }}
                placeholder="Optional: uses built-in server AI by default"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-10 font-mono text-xs text-slate-800 focus:border-[#0F766E] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                aria-label="Toggle API key visibility"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestKey}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking connection...
                </>
              ) : (
                'Test AI Connection'
              )}
            </button>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Leave blank to use the built-in server AI automatically — visitors never need to enter an API key.
            </p>

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-rose-50 text-rose-800'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
