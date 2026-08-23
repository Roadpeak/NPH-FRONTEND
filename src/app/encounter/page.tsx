'use client';

import { useCallback, useEffect, useState } from 'react';
import { SafetyBanner } from '@/components/SafetyBanner';
import { CodedSearch, type SearchResult } from '@/components/CodedSearch';
import {
  loadDiagnosisIndex,
  loadMedicationIndex,
  searchDiagnoses,
  searchMedications,
  type DiagnosisTerm,
  type MedicationTerm,
} from '@/lib/search';

/**
 * Encounter entry.
 *
 * The screen that decides adoption. Demo data for now — the backend
 * endpoints exist and are tested, but auth and check-in are not wired yet,
 * so this proves the interaction rather than the integration.
 *
 * What it must demonstrate: a coded diagnosis and a prescription recorded
 * in sixteen keystrokes, without touching the mouse.
 */

// Stands in for GET /persons/:nhpId/summary until auth lands.
const DEMO_PATIENT = {
  displayNumber: 'NHP-8C41-2290',
  givenName: "Achieng'",
  familyName: 'Otieno Wanjala',
  age: 34,
  sex: 'F',
  bloodGroup: 'O+',
  county: 'Kisumu / Kisumu Central',
  allergies: [
    { substanceLabel: 'Penicillin', severity: 'ANAPHYLAXIS' as const, reaction: 'anaphylaxis' },
    { substanceLabel: 'Sulfa', severity: 'MODERATE' as const, reaction: 'rash' },
  ],
  medications: [
    { genericName: 'Metformin', doseAmount: 500, doseUnit: 'mg', frequency: 'BD' },
    { genericName: 'Amlodipine', doseAmount: 5, doseUnit: 'mg', frequency: 'OD' },
  ],
  chronicConditions: [
    { icd11Title: 'Type 2 diabetes mellitus' },
    { icd11Title: 'Essential hypertension' },
  ],
  alerts: ['Pregnant · 22 weeks'],
  restrictedRecordsExist: true,
};

interface RecordedDiagnosis {
  code: string;
  title: string;
  status: 'CONFIRMED' | 'SUSPECTED';
}

interface RecordedMedication {
  code: string;
  name: string;
  regimen: string;
}

const STEPS = [
  'Presentation',
  'Diagnosis',
  'Treatment',
  'Medication',
  'Disposition',
] as const;

export default function EncounterPage() {
  const [diagnosisIndex, setDiagnosisIndex] = useState<DiagnosisTerm[]>([]);
  const [medicationIndex, setMedicationIndex] = useState<MedicationTerm[]>([]);
  const [step, setStep] = useState(1);
  const [diagnoses, setDiagnoses] = useState<RecordedDiagnosis[]>([]);
  const [medications, setMedications] = useState<RecordedMedication[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [interrupt, setInterrupt] = useState<{
    drug: string;
    reason: string;
    alternatives: string[];
  } | null>(null);

  useEffect(() => {
    loadDiagnosisIndex().then(setDiagnosisIndex);
    loadMedicationIndex().then(setMedicationIndex);
  }, []);

  const queryDiagnoses = useCallback(
    (q: string): SearchResult[] =>
      searchDiagnoses(diagnosisIndex, q).map(({ term }) => ({
        code: term.c,
        title: term.t,
        badge:
          term.r === 'TIER_3_RESTRICTED'
            ? { label: 'RESTRICTED', tone: 'caution' as const }
            : term.n
              ? { label: 'NOTIFIABLE', tone: 'gov' as const }
              : undefined,
      })),
    [diagnosisIndex],
  );

  const queryMedications = useCallback(
    (q: string): SearchResult[] =>
      searchMedications(medicationIndex, q).map(({ term }) => ({
        code: term.c,
        title: `${term.g} ${term.st}`,
        detail: `${term.d} ${term.fr}${term.du ? ` for ${term.du} days` : ''}`,
      })),
    [medicationIndex],
  );

  function addDiagnosis(result: SearchResult) {
    setDiagnoses((prev) =>
      prev.some((d) => d.code === result.code)
        ? prev
        : [...prev, { code: result.code, title: result.title, status: 'CONFIRMED' }],
    );
  }

  function addMedication(result: SearchResult) {
    const drug = medicationIndex.find((m) => m.c === result.code);
    if (!drug) return;

    // The contraindication interrupt fires at SELECTION, not on submit.
    // Names the allergy with its provenance and offers alternatives.
    const clash = DEMO_PATIENT.allergies.find(
      (a) =>
        drug.ac === 'PENICILLIN' && a.substanceLabel === 'Penicillin',
    );

    if (clash) {
      setInterrupt({
        drug: drug.g,
        reason:
          `${drug.g} is a penicillin-class antibiotic. This patient has a ` +
          `${clash.severity} recorded reaction.`,
        alternatives: medicationIndex
          .filter((m) => m.ac === 'MACROLIDE' || m.ac === 'TETRACYCLINE')
          .slice(0, 3)
          .map((m) => m.g),
      });
      return;
    }

    setMedications((prev) => [
      ...prev,
      { code: drug.c, name: drug.g, regimen: `${drug.d} ${drug.fr}` },
    ]);
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* --- patient identity --- */}
      <header className="border-b border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {DEMO_PATIENT.givenName} {DEMO_PATIENT.familyName}
            </h1>
            <p className="truncate font-mono text-micro text-ink-faint">
              {DEMO_PATIENT.displayNumber} · {DEMO_PATIENT.sex} ·{' '}
              {DEMO_PATIENT.age}y · {DEMO_PATIENT.county} · Blood group{' '}
              {DEMO_PATIENT.bloodGroup}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip chip-good">Consented</span>
            {/* Without this, an honest mis-search is indistinguishable from
                browsing in the audit log. */}
            <button className="rounded border border-rule px-3 py-1.5 text-sm text-ink-soft hover:bg-surface">
              Not my patient
            </button>
          </div>
        </div>
      </header>

      <SafetyBanner
        allergies={DEMO_PATIENT.allergies}
        medications={DEMO_PATIENT.medications}
        chronicConditions={DEMO_PATIENT.chronicConditions}
        alerts={DEMO_PATIENT.alerts}
        restrictedRecordsExist={DEMO_PATIENT.restrictedRecordsExist}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
          {/* --- step rail --- */}
          <nav aria-label="Encounter steps" className="lg:sticky lg:top-6 lg:self-start">
            <p className="eyebrow mb-2">This encounter</p>
            <ol className="flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-1">
              {STEPS.map((name, i) => {
                const state = i < step ? 'done' : i === step ? 'current' : 'todo';
                return (
                  <li key={name} className="shrink-0 lg:shrink">
                    <button
                      onClick={() => setStep(i)}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm ${
                        state === 'current'
                          ? 'bg-gov-soft font-semibold text-gov'
                          : 'text-ink-soft hover:bg-surface'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                          state === 'done'
                            ? 'bg-good-soft text-good'
                            : state === 'current'
                              ? 'bg-gov text-surface'
                              : 'border border-rule text-ink-faint'
                        }`}
                      >
                        {state === 'done' ? '✓' : i + 1}
                      </span>
                      <span className="whitespace-nowrap">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* --- work area --- */}
          <div>
            <p className="eyebrow mb-1">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="mb-5 font-serif text-2xl font-semibold">{STEPS[step]}</h2>

            {step === 1 && (
              <CodedSearch
                label="Search diagnoses"
                placeholder="Type a diagnosis — try mal, pressure, kisukari, URTI"
                onQuery={queryDiagnoses}
                onSelect={addDiagnosis}
                onKeepAsNote={(text) => setNotes((p) => [...p, text])}
                autoFocus
              />
            )}

            {step === 3 && (
              <CodedSearch
                label="Search medications"
                placeholder="Type a medicine — try amox, panadol, AL"
                onQuery={queryMedications}
                onSelect={addMedication}
                autoFocus
              />
            )}

            {step !== 1 && step !== 3 && (
              <p className="rounded-md border border-dashed border-rule bg-surface px-4 py-8 text-center text-sm text-ink-faint">
                {STEPS[step]} — not built yet. Diagnosis and Medication are the
                two that carry the interaction design.
              </p>
            )}

            {/* --- what has been recorded --- */}
            {(diagnoses.length > 0 || notes.length > 0) && (
              <section className="mt-6 border-t border-rule pt-5">
                <p className="eyebrow mb-2">Added this encounter</p>
                <ul className="space-y-1.5">
                  {diagnoses.map((d) => (
                    <li
                      key={d.code}
                      className="flex items-center gap-3 rounded border border-rule bg-surface px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                      <span className="chip chip-gov">{d.status}</span>
                      <span className="font-mono text-micro text-ink-faint">{d.code}</span>
                    </li>
                  ))}
                  {notes.map((n, i) => (
                    <li
                      key={`note-${i}`}
                      className="flex items-center gap-3 rounded border border-caution/40 bg-caution-soft px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{n}</span>
                      <span className="chip chip-caution">UNCODED NOTE</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {medications.length > 0 && (
              <section className="mt-6 border-t border-rule pt-5">
                <p className="eyebrow mb-2">Prescribed</p>
                <ul className="space-y-1.5">
                  {medications.map((m) => (
                    <li
                      key={m.code}
                      className="flex items-center gap-3 rounded border border-rule bg-surface px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                      <span className="font-mono text-micro text-ink-soft">
                        {m.regimen}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* --- attribution footer --- */}
      <footer className="border-t border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm text-ink-soft">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" />
              Dr Amina Wanjiru · KMPDC/12345
            </p>
            <p className="font-mono text-micro text-ink-faint">
              Checked in · Kisumu County Referral · this view has been logged
            </p>
          </div>
          <p className="font-mono text-micro text-ink-faint">session expires 00:12</p>
        </div>
      </footer>

      {/* --- the contraindication interrupt --- */}
      {interrupt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="interrupt-title"
            className="w-full max-w-2xl rounded-lg border-2 border-critical bg-critical-soft p-5"
          >
            <p id="interrupt-title" className="mb-1 text-lg font-bold text-critical">
              ⚠ Contraindicated — documented allergy
            </p>
            <p className="mb-3 text-sm text-ink-soft">{interrupt.reason}</p>
            <p className="mb-3 font-mono text-micro text-ink-faint">
              Recorded 14 Mar 2024 · Kisumu County Referral · Dr J. Ochieng
            </p>

            <p className="eyebrow mb-2">Suggested alternatives</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {interrupt.alternatives.map((alt) => (
                <button
                  key={alt}
                  onClick={() => {
                    setMedications((p) => [
                      ...p,
                      { code: alt, name: alt, regimen: 'standard adult dose' },
                    ]);
                    setInterrupt(null);
                  }}
                  className="chip chip-good hover:opacity-80"
                >
                  {alt}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {/* Override is ALWAYS available — blocking a clinician outright
                  is how people learn to route around the system. It costs a
                  typed reason and is recorded against the prescriber. */}
              <button
                onClick={() => setInterrupt(null)}
                className="rounded border border-rule bg-surface px-3 py-2 text-sm text-ink-soft"
              >
                Prescribe anyway →
              </button>
              <button
                onClick={() => setInterrupt(null)}
                className="rounded bg-gov px-4 py-2 text-sm font-semibold text-surface"
              >
                Choose an alternative
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
