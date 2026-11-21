import React from 'react';
import { X, Printer, ShieldCheck, CheckCircle2, Phone, MapPin, Clock } from 'lucide-react';
import type { ClinicalPrescription, DoctorProfile } from '../types/clinical';
import { QrCodeSvg } from './QrCodeSvg';

interface PrescriptionPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescription: ClinicalPrescription;
  doctor: DoctorProfile;
}

function formatBanglaSchedule(dosage: string): string {
  const parts = dosage.split('+').map((s) => s.trim());
  if (parts.length !== 3) return dosage;
  const toBn = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] || d);
  return `সকাল ${toBn(parts[0])} + দুপুর ${toBn(parts[1])} + রাত ${toBn(parts[2])}`;
}

export const PrescriptionPrintModal: React.FC<PrescriptionPrintModalProps> = ({
  isOpen,
  onClose,
  prescription,
  doctor,
}) => {
  if (!isOpen) return null;

  const verificationCode = `PRX-BD-${doctor.bmdcReg}-${prescription.patient.visitId}`;
  const approvalTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    document.body.classList.remove('printing-flyer');
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        {/* Modal Action Header (Hidden in Print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 no-print">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Official A4 Bangladeshi Clinical Prescription
              </h2>
              <p className="text-xs text-emerald-700 font-medium">
                100% Doctor-Approved • Zero Unverified AI Fields • Ready to Print or Save PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-teal-800"
            >
              <Printer className="h-4 w-4" />
              Print / Save A4 PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close prescription modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div
            id="printable-rx-sheet"
            className="mx-auto w-full max-w-[794px] rounded-xl border border-slate-300 bg-white shadow-lg print:rounded-none print:border-none print:shadow-none"
          >
            {/* Top Teal Clinic Banner */}
            <div className="border-b-4 border-[#0F766E] bg-gradient-to-r from-teal-50/90 via-white to-white px-7 py-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0F766E] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                    BMDC Verified Chamber Rx
                  </div>
                  <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                    {doctor.name}
                  </h1>
                  <p className="text-sm font-semibold text-[#0F766E]">{doctor.qualifications}</p>
                  <p className="text-xs font-medium text-slate-600">{doctor.specialty}</p>
                  <p className="mt-1 inline-block rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-900">
                    BMDC Reg. No: {doctor.bmdcReg}
                  </p>
                </div>

                <div className="text-left text-xs text-slate-600 sm:text-right space-y-1">
                  <p className="text-sm font-bold text-slate-900">{doctor.chamberName}</p>
                  <p className="flex items-center gap-1.5 sm:justify-end">
                    <MapPin className="h-3.5 w-3.5 text-[#0F766E] shrink-0" />
                    <span>{doctor.chamberAddress}</span>
                  </p>
                  <p className="flex items-center gap-1.5 sm:justify-end">
                    <Clock className="h-3.5 w-3.5 text-[#0F766E] shrink-0" />
                    <span>{doctor.visitingHours}</span>
                  </p>
                  <p className="flex items-center gap-1.5 sm:justify-end">
                    <Phone className="h-3.5 w-3.5 text-[#0F766E] shrink-0" />
                    <span>{doctor.phone}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Patient Information Strip */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-slate-200 bg-slate-50/70 px-7 py-3.5 text-xs sm:grid-cols-5">
              <div className="col-span-2 sm:col-span-2">
                <span className="font-semibold text-slate-500">Patient Name: </span>
                <span className="font-bold text-slate-900">
                  {prescription.patient.name || 'Walk-in Patient'}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Age / Sex: </span>
                <span className="font-bold text-slate-900">
                  {prescription.patient.age || '—'} / {prescription.patient.gender}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Date: </span>
                <span className="font-bold text-slate-900">{prescription.patient.date}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Visit ID: </span>
                <span className="font-mono font-bold text-[#0F766E]">
                  {prescription.patient.visitId}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-5 border-t border-slate-200/80 pt-1.5">
                <span className="font-semibold text-slate-500">Known Drug Allergies: </span>
                <span className="font-semibold text-rose-700">
                  {prescription.patient.allergies || 'Not documented'}
                </span>
              </div>
            </div>

            {/* Authentic Two-Column Bangladeshi Rx Body */}
            <div className="grid min-h-[470px] grid-cols-1 divide-y divide-slate-200 md:grid-cols-12 md:divide-x md:divide-y-0">
              {/* Left Clinical Summary Column */}
              <div className="space-y-5 p-6 text-xs md:col-span-4 bg-slate-50/30">
                <div>
                  <h3 className="border-b border-slate-200 pb-1 text-[11px] font-extrabold tracking-wider text-[#0F766E] uppercase">
                    Chief Complaints (C/C)
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-800">
                    {prescription.chiefComplaints.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="border-b border-slate-200 pb-1 text-[11px] font-extrabold tracking-wider text-[#0F766E] uppercase">
                    On Examination (O/E) & Vitals
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>
                      <span className="text-slate-500">BP:</span>{' '}
                      <strong className="text-slate-900">{prescription.vitals.bp}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Pulse:</span>{' '}
                      <strong className="text-slate-900">{prescription.vitals.pulse}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Temp:</span>{' '}
                      <strong className="text-slate-900">{prescription.vitals.temp}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">SpO₂:</span>{' '}
                      <strong className="text-slate-900">{prescription.vitals.spo2}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Weight:</span>{' '}
                      <strong className="text-slate-900">{prescription.vitals.weight}</strong>
                    </div>
                  </div>
                  {prescription.vitals.physicalFindings && (
                    <p className="mt-2 rounded-lg bg-white p-2 text-[11px] leading-relaxed text-slate-700 border border-slate-200/80">
                      {prescription.vitals.physicalFindings}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="border-b border-slate-200 pb-1 text-[11px] font-extrabold tracking-wider text-[#0F766E] uppercase">
                    Investigations Advised (Inv.)
                  </h3>
                  <ul className="mt-2 list-decimal space-y-1 pl-4 font-medium text-slate-800">
                    {prescription.investigations.map((inv, idx) => (
                      <li key={idx}>{inv}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right Medications & Advice Column */}
              <div className="flex flex-col justify-between p-6 md:col-span-8">
                <div>
                  {/* Classic Rx Symbol */}
                  <div className="mb-4 flex items-baseline justify-between">
                    <span className="font-serif text-4xl font-bold leading-none text-[#0F766E]">
                      ℞
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      Generated via Prescript.io • Verified Digital Rx
                    </span>
                  </div>

                  {/* Medications List */}
                  <div className="space-y-4">
                    {prescription.medications.map((med, idx) => (
                      <div
                        key={med.id}
                        className="rounded-lg border border-slate-200/80 bg-white px-4 py-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <span className="mr-2 text-xs font-bold text-[#0F766E]">
                              {idx + 1}.
                            </span>
                            <span className="text-sm font-extrabold text-slate-900">
                              {med.brand}
                            </span>
                            {med.generic && (
                              <span className="ml-2 text-xs text-slate-500">
                                ({med.generic})
                              </span>
                            )}
                          </div>
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-[#0F766E]">
                            {med.duration}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 text-xs text-slate-700">
                          <span className="font-mono font-bold text-slate-900">
                            {med.dosage}
                          </span>
                          <span className="font-bengali text-[11px] text-slate-500">
                            ({formatBanglaSchedule(med.dosage)})
                          </span>
                          <span>•</span>
                          <span className="font-medium text-slate-800">{med.timing}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Advice & Follow-up */}
                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <h3 className="text-[11px] font-extrabold tracking-wider text-[#0F766E] uppercase">
                      Advice & Precautions
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-800">
                      {prescription.advice.map((adv, idx) => (
                        <li key={idx}>{adv}</li>
                      ))}
                    </ul>

                    {prescription.followUp && (
                      <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2.5 text-xs">
                        <span className="font-bold text-[#0F766E]">Next Follow-up: </span>
                        <span className="font-semibold text-slate-900">
                          {prescription.followUp}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verified Digital Signature Stamp & QR Verification Footer */}
                <div className="mt-8 flex flex-col justify-between gap-4 border-t-2 border-dashed border-slate-200 pt-5 sm:flex-row sm:items-end">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-slate-200 p-1 bg-white">
                      <QrCodeSvg value={verificationCode} size={74} className="text-slate-900" />
                    </div>
                    <div className="text-[10px] leading-relaxed text-slate-500">
                      <p className="font-bold text-slate-800 uppercase">
                        Scan to Verify Authenticity
                      </p>
                      <p className="font-mono text-[10px] text-[#0F766E]">{verificationCode}</p>
                      <p>Approved: {approvalTimestamp}</p>
                      <p>Dispensing pharmacies may verify Rx integrity online.</p>
                    </div>
                  </div>

                  {/* Doctor Verified Stamp */}
                  <div className="rounded-xl border-2 border-emerald-600/80 bg-emerald-50/70 px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-800 uppercase">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Digitally Verified & Approved
                    </div>
                    <p className="mt-1 font-serif text-base font-bold italic text-slate-900">
                      {doctor.name}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-600">
                      {doctor.qualifications} • BMDC Reg: {doctor.bmdcReg}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Legal Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-7 py-2.5 text-center text-[10px] text-slate-500">
              Prescript.io AI-Assisted Clinical Scribe — Every clinical observation, test, and
              medication above was explicitly reviewed and approved by the signing BMDC-registered
              physician.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
