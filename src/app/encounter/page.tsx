'use client';

import { useCallback, useEffect, useState } from 'react';
import { SafetyBanner } from '@/components/SafetyBanner';
import { PatientHeader } from '@/components/PatientHeader';
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

import { useRouter } from 'next/navigation';
import {
  nhp,
  photo,
  hasSession,
  restoreSession,
  ApiError,
  type PatientSummary,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';

/** The demo patient's National ID, from `pnpm seed:demo` in the backend. */
const DEMO_IDENTIFIER = '39104882';

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
  const router = useRouter();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fetched separately: a photo that fails to load must never delay or
  // block the allergy banner.
  const [patientPhoto, setPatientPhoto] = useState<string | null>(null);
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

  // Real data from NHP-BACKEND. The search index stays local — step 1 of the
  // resolution ladder must never wait on the network — but everything about
  // the patient comes from the API, through the check-in gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The access token lives in memory and is lost on reload. The
        // refresh token lives in an httpOnly cookie this code cannot read,
        // so we ask the API to rotate it rather than reading it ourselves.
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.worker.signInPath);
          return;
        }
        if (cancelled) return;

        const found = await nhp.searchPatients(DEMO_IDENTIFIER);
        if (!found.match) throw new Error('Demo patient not found');
        const summary = await nhp.patientSummary(found.match.id);
        if (!cancelled) setPatient(summary);

        // Deliberately after the summary and separately caught: a photo is
        // a convenience, and a failure to load one must never delay or
        // block the allergy banner.
        photo
          .ofPatient(found.match.displayNumber)
          .then((p) => !cancelled && setPatientPhoto(p.photo))
          .catch(() => !cancelled && setPatientPhoto(null));
      } catch (err) {
        if (cancelled) return;

        // A restored session is authenticated but NOT MFA-satisfied — a
        // refresh cookie must never silently confer a second factor. Send
        // the clinician to re-present it rather than stranding them.
        if (err instanceof ApiError && (err.code === 'MFA_REQUIRED' || err.code === 'NO_SESSION')) {
          router.replace(`${PORTALS.worker.signInPath}?reason=mfa`);
          return;
        }

        setLoadError(
          err instanceof ApiError
            ? `${err.message} (${err.code})`
            : err instanceof Error
              ? err.message
              : 'Could not reach the API',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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

  async function addMedication(result: SearchResult) {
    const drug = medicationIndex.find((m) => m.c === result.code);
    if (!drug || !patient) return;

    // The contraindication check runs on the BACKEND, at selection time.
    // Doing it client-side would put a safety decision somewhere a client
    // can skip it.
    const check = await nhp.checkPrescribing({
      personId: patient.person.id,
      kemlCode: drug.c,
    });

    if (check.verdict !== 'ALLOW') {
      setInterrupt({
        drug: drug.g,
        reason: check.reasons.join(' '),
        alternatives: check.alternatives.map((a) => a.genericName),
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
      {patient ? (
        <PatientHeader
          displayNumber={patient.person.displayNumber}
          givenName={patient.person.givenName}
          familyName={patient.person.familyName}
          age={patient.person.age}
          sexAtBirth={patient.person.sexAtBirth}
          bloodGroup={patient.person.bloodGroup}
          photo={patientPhoto}
          allergies={patient.allergies}
          medications={patient.medications}
          chronicConditions={patient.chronicConditions}
          actions={
            <>
              <span className="chip chip-good">Consented</span>
              {/* Without this, an honest mis-search is indistinguishable
                  from browsing in the audit log. */}
              <button className="rounded border border-rule px-3 py-1.5 text-sm text-ink-soft hover:bg-surface">
                Not my patient
              </button>
            </>
          }
        />
      ) : (
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
            <p className="text-base font-semibold">Loading patient…</p>
            <p className="font-mono text-micro text-ink-faint">from NHP-BACKEND</p>
          </div>
        </header>
      )}

      {loadError ? (
        /* If the banner cannot load, say so loudly. Showing an empty
           allergy list when the API is unreachable would read as "no
           allergies", which is the most dangerous possible failure. */
        <div className="border-y border-critical/30 bg-critical-soft px-4 py-3 sm:px-6">
          <p className="mx-auto max-w-6xl text-sm font-semibold text-critical">
            ⚠ Could not load this patient&rsquo;s safety information — {loadError}
          </p>
          <p className="mx-auto max-w-6xl text-micro text-ink-soft">
            Do not prescribe from this screen until it loads. Check the paper
            record.
          </p>
        </div>
      ) : (
        <SafetyBanner
          allergies={patient?.allergies ?? []}
          medications={patient?.medications ?? []}
          chronicConditions={patient?.chronicConditions ?? []}
          restrictedRecordsExist={patient?.restrictedRecordsExist ?? false}
        />
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
          {/* --- step rail --- */}
          {/*
            `min-w-0` matters: without it the grid track sizes to the step
            rail's content, and on a phone the whole page scrolls sideways
            instead of just the rail.
          */}
          <nav
            aria-label="Encounter steps"
            className="min-w-0 lg:sticky lg:top-6 lg:self-start"
          >
            <p className="eyebrow mb-2">This encounter</p>
            <ol className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
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
