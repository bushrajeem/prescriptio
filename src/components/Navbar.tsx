import React from 'react';
import { Stethoscope, Settings, RotateCcw } from 'lucide-react';
import type { AppSettings } from '../types/clinical';

interface NavbarProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onNewPatient: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  onOpenSettings,
  onNewPatient,
}) => {
  const isLiveAi = !settings.demoMode;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        {/* Clean Brand + Doctor Identity */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E] text-white shadow-xs">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                Prescript<span className="text-[#0F766E]">.io</span>
              </span>
              <span className="hidden h-4 w-px bg-slate-200 sm:inline-block" />
              <span className="hidden text-sm font-medium text-slate-600 sm:inline">
                {settings.doctorProfile.name}
              </span>
              <span className="hidden rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-[#0F766E] md:inline">
                BMDC {settings.doctorProfile.bmdcReg}
              </span>
            </div>
            <p className="text-xs text-slate-500 sm:hidden">
              {settings.doctorProfile.name} • BMDC {settings.doctorProfile.bmdcReg}
            </p>
          </div>
        </div>

        {/* Simple Right Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onNewPatient}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4 text-slate-500" />
            <span className="hidden sm:inline">New Patient</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            title="AI & Chamber Settings"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isLiveAi ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
            <Settings className="h-4 w-4 text-slate-500" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
