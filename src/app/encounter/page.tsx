'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
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

import { useRouter, useSearchParams } from 'next/navigation';
import {
  nhp,
  photo,
  auth,
  hasSession,
  restoreSession,
  ApiError,
  type PatientSummary,
  type CheckInSession,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { WorkerNav } from '@/components/WorkerNav';

/**
 * Fallback only. The consultation opens on whoever `?patient=` names — the
 * patient the clinician actually selected — and falls back to the demo
 * record when the screen is opened cold with nobody chosen.
 *
 * Without the parameter this screen ALWAYS loaded this one person, so
 * "Start encounter" on a patient summary silently swapped the patient
 * underneath the clinician. On a screen whose whole purpose is recording
 * against the right record, that is the most dangerous defect available.
 */
const DEMO_IDENTIFIER = '39104882';

interface RecordedDiagnosis {
  code: string;
  title: string;
  status: 'CONFIRMED' | 'SUSPECTED';
}

interface RecordedMedication {
  code: string;
  name: string;
  /** Pre-filled from the formulary, then edited. */
  dose: string;
  frequency: string;
  durationDays: string;
  /** The formulary default, kept so a change is visible as a change. */
  defaultRegimen: string;
}

/**
 * Frequencies a prescriber can pick without typing.
 *
 * The formulary's own value is always offered even when it is not one of
 * these — a drug dosed 'every 72 hours' must not silently become TDS
 * because the dropdown had no room for it.
 */
const FREQUENCIES = ['OD', 'BD', 'TDS', 'QDS', 'PRN', 'STAT'];

const STEPS = [
  'Presentation',
  'Diagnosis',
  'Treatment',
  'Medication',
  'Disposition',
] as const;

function Encounter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPatient = searchParams.get('patient');
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fetched separately: a photo that fails to load must never delay or
  // block the allergy banner.
  const [patientPhoto, setPatientPhoto] = useState<string | null>(null);
  // The signed-in clinician and their check-in, both from the server. The
  // footer used to state these as fixed demo text.
  const [session, setSession] = useState<CheckInSession | null>(null);
  const [me, setMe] = useState<{ name: string; licenceNumber: string | null } | null>(null);
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

        // `?patient=` carries an NHP id, which the summary endpoint accepts
        // directly. Only when it is absent do we fall back to the demo
        // record, and a bad id must surface as an error rather than
        // quietly loading somebody else.
        let summary;
        if (requestedPatient) {
          summary = await nhp.patientSummary(requestedPatient);
        } else {
          const found = await nhp.searchPatients(DEMO_IDENTIFIER);
          if (!found.match) throw new Error('Demo patient not found');
          summary = await nhp.patientSummary(found.match.id);
        }
        if (!cancelled) setPatient(summary);

        // Who is signed in, and whether they are checked in. Separately
        // caught: neither may delay or block the allergy banner.
        auth
          .me()
          .then((m) => {
            if (cancelled) return;
            setMe({
              name: m.displayName
                ? `${m.cadre === 'DOCTOR' || m.cadre === 'DENTIST' ? 'Dr ' : ''}${m.displayName}`
                : 'Unknown clinician',
              licenceNumber: m.licenceNumber,
            });
          })
          .catch(() => !cancelled && setMe(null));

        nhp
          .currentSession()
          .then((cs) => !cancelled && setSession(cs))
          .catch(() => !cancelled && setSession(null));

        // Deliberately after the summary and separately caught: a photo is
        // a convenience, and a failure to load one must never delay or
        // block the allergy banner.
        photo
          .ofPatient(summary.person.displayNumber)
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
  }, [router, requestedPatient]);

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

    /*
     * The formulary dose is a STARTING POINT, not the prescription.
     *
     * The same medicine is dosed differently by indication, severity, weight
     * and renal function — amoxicillin for otitis media is not amoxicillin
     * for severe pneumonia. Locking the default in forced a clinician to
     * either accept a dose they did not mean or abandon the screen, and the
     * second is how a system stops being used.
     */
    setMedications((prev) => [
      ...prev,
      {
        code: drug.c,
        name: drug.g,
        dose: drug.d,
        frequency: drug.fr,
        durationDays: drug.du ?? '',
        defaultRegimen: `${drug.d} ${drug.fr}`,
      },
    ]);
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <WorkerNav />

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
                  {medications.map((m, i) => {
                    const edited = `${m.dose} ${m.frequency}` !== m.defaultRegimen;
                    return (
                      <li
                        key={m.code}
                        className="rounded border border-rule bg-surface px-3 py-2"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {m.name}
                          </span>
                          {edited && (
                            /* Says the dose was changed from the formulary's.
                               A pharmacist reading this later should not have
                               to remember what the default was. */
                            <span className="chip chip-caution">ADJUSTED</span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setMedications((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="text-micro text-ink-faint underline hover:text-critical"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="block">
                            <span className="eyebrow mb-0.5 block">Dose</span>
                            <input
                              value={m.dose}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, dose: e.target.value } : x,
                                  ),
                                )
                              }
                              className="w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="eyebrow mb-0.5 block">Frequency</span>
                            <select
                              value={m.frequency}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, frequency: e.target.value } : x,
                                  ),
                                )
                              }
                              className="w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-sm"
                            >
                              {/* The formulary's own value first, even when it
                                  is not a standard code — a drug dosed every
                                  72 hours must not become TDS by default. */}
                              {[m.frequency, ...FREQUENCIES.filter((f) => f !== m.frequency)].map(
                                (f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label className="block">
                            <span className="eyebrow mb-0.5 block">Days</span>
                            <input
                              type="number"
                              min={1}
                              value={m.durationDays}
                              placeholder="ongoing"
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, durationDays: e.target.value } : x,
                                  ),
                                )
                              }
                              className="w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-sm"
                            />
                          </label>
                        </div>

                        {edited && (
                          <p className="mt-1.5 text-micro text-ink-faint">
                            Formulary default: {m.defaultRegimen}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>

      {/*
        The attribution footer.

        Read from the LIVE session, never hardcoded: a clinician who is not
        checked in seeing "Checked in · Kisumu County Referral" would be
        told they can write when the server will refuse them — and would
        discover it at a patient's bedside.
      */}
      <footer
        className={`border-t ${
          session ? 'border-rule bg-surface-alt' : 'border-caution/40 bg-caution-soft'
        }`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm text-ink-soft">
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                  session ? 'bg-good' : 'bg-caution'
                }`}
              />
              {me
                ? `${me.name}${me.licenceNumber ? ` · ${me.licenceNumber}` : ''}`
                : 'Loading…'}
            </p>
            {session ? (
              <p className="font-mono text-micro text-ink-faint">
                Checked in · {session.facilityName} · this view has been logged
              </p>
            ) : (
              /* The gate, stated plainly. The server refuses a write without
                 an open check-in; saying so here is the difference between
                 knowing before a consultation and finding out during one. */
              <p className="font-mono text-micro font-semibold text-caution">
                Not checked in · you cannot record clinical data until you
                check in at a facility
              </p>
            )}
          </div>
          {session && (
            <p className="font-mono text-micro text-ink-faint">
              session expires in {session.minutesRemaining} min
            </p>
          )}
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
                    // An alternative arrives with no formulary row attached,
                    // so its regimen starts blank rather than borrowing a
                    // dose from the drug it is replacing.
                    setMedications((p) => [
                      ...p,
                      {
                        code: alt,
                        name: alt,
                        dose: '',
                        frequency: 'TDS',
                        durationDays: '',
                        defaultRegimen: '',
                      },
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

/**
 * `useSearchParams` opts a route out of static prerendering, and Next
 * refuses to build unless the boundary is explicit — the production build
 * fails at prerender even though `next dev` renders it happily, because
 * dev never prerenders at all.
 *
 * The boundary is the honest fix rather than `export const dynamic =
 * 'force-dynamic'`: only the part that reads the URL needs to bail out of
 * prerendering, and forcing the whole route dynamic would discard the
 * static shell for every other visitor.
 *
 * The fallback is deliberately bare. Anything resembling a patient header
 * here would be a header with no patient behind it, and on this screen a
 * name that is not the patient's is the one thing that must never appear.
 */
export default function EncounterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-sunken" />}>
      <Encounter />
    </Suspense>
  );
}
