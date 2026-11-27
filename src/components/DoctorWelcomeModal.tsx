import React, { useState } from 'react';
import { Stethoscope, ArrowRight } from 'lucide-react';
import type { DoctorProfile } from '../types/clinical';

interface DoctorWelcomeModalProps {
  onComplete: (profile: DoctorProfile) => void;
}

export const DoctorWelcomeModal: React.FC<DoctorWelcomeModalProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [bmdcReg, setBmdcReg] = useState('');
  const [chamberAddress, setChamberAddress] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const formattedName = /^dr\.?\s/i.test(trimmedName) ? trimmedName : `Dr. ${trimmedName}`;

    onComplete({
      name: formattedName,
      qualifications: qualifications.trim(),
      specialty: '',
      bmdcReg: bmdcReg.trim(),
      chamberName: '',
      chamberAddress: chamberAddress.trim(),
      visitingHours: '',
      phone: '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-doctor-title"
      >
        <div className="bg-gradient-to-br from-[#0F766E] to-teal-800 px-7 py-6 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
            <Stethoscope className="h-6 w-6 text-white" />
          </div>
          <h1 id="welcome-doctor-title" className="mt-4 text-xl font-bold tracking-tight">
            Welcome to Prescript.io
          </h1>
          <p className="mt-1 text-sm text-teal-100">
            Enter your name once to personalize your chamber dashboard and prescriptions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-7 py-6">
          <div>
            <label
              htmlFor="doctor-name-input"
              className="block text-sm font-semibold text-slate-800"
            >
              Doctor&apos;s Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="doctor-name-input"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Dr. Farhana Rahman"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="doctor-qual-input"
                className="block text-xs font-medium text-slate-500"
              >
                Degree / Specialty (optional)
              </label>
              <input
                id="doctor-qual-input"
                type="text"
                value={qualifications}
                onChange={(e) => setQualifications(e.target.value)}
                placeholder="MBBS, FCPS (Medicine)"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F766E] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doctor-bmdc-input"
                className="block text-xs font-medium text-slate-500"
              >
                BMDC Reg. No. (optional)
              </label>
              <input
                id="doctor-bmdc-input"
                type="text"
                value={bmdcReg}
                onChange={(e) => setBmdcReg(e.target.value)}
                placeholder="A-48291"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F766E] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="doctor-chamber-input"
              className="block text-xs font-medium text-slate-500"
            >
              Chamber Address (optional)
            </label>
            <input
              id="doctor-chamber-input"
              type="text"
              value={chamberAddress}
              onChange={(e) => setChamberAddress(e.target.value)}
              placeholder="House 14, Road 4, Dhanmondi, Dhaka"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0F766E] focus:bg-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F766E] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
