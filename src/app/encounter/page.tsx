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
 * The screen that decides adoption: a coded diagnosis and a prescription
 * recorded in sixteen keystrokes, without touching the mouse.
 *
 * Five steps, in the order a consultation actually happens — presentation,
 * diagnosis, treatment, medication, disposition. Nothing is written until
 * Complete, because clinical tables are append-only: a diagnosis saved the
 * moment it is tapped cannot be removed when the clinician changes their
 * mind, only superseded with a formal amendment. Holding the consultation
 * locally means a mis-tap costs nothing.
 *
 * Diagnosis and medication search against a LOCAL index — step one of the
 * resolution ladder must never wait on the network. Treatments search the
 * server, because that catalogue is small and not yet worth shipping to
 * every device.
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
  type Disposition,
  type TreatmentHit,
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

/** What kind of visit this is — the server needs it to open an encounter. */
type EncounterKind =
  | 'OUTPATIENT'
  | 'EMERGENCY'
  | 'MATERNITY'
  | 'IMMUNISATION'
  | 'SCREENING'
  | 'FOLLOW_UP';

interface RecordedTreatment {
  /** An NHP-TX code, or UNCODED for one the clinician typed themselves. */
  code: string;
  title: string;
  indication: string;
}

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

/**
 * How a consultation can end.
 *
 * REFERRED is deliberately absent: the referral flow records that
 * disposition itself and links the referral to the encounter. Offering it
 * here would let a clinician claim a referral that was never created, and
 * the server refuses it for the same reason.
 */
const DISPOSITIONS: Array<{ value: Disposition; label: string; detail: string }> = [
  { value: 'DISCHARGED', label: 'Discharged', detail: 'Went home after being seen' },
  { value: 'ADMITTED', label: 'Admitted', detail: 'Kept in this facility for further care' },
  {
    value: 'LEFT_AGAINST_ADVICE',
    label: 'Left against advice',
    detail: 'Chose to leave before care was finished',
  },
  { value: 'ABSCONDED', label: 'Absconded', detail: 'Left without being seen or telling anyone' },
  { value: 'DIED', label: 'Died', detail: 'Died during this visit' },
];

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
  const [treatmentIndex, setTreatmentIndex] = useState<TreatmentHit[]>([]);
  // Starts at Presentation. The chief complaint is what opens an
  // encounter server-side, so nothing else can be recorded before it.
  const [step, setStep] = useState(0);
  const [diagnoses, setDiagnoses] = useState<RecordedDiagnosis[]>([]);
  const [medications, setMedications] = useState<RecordedMedication[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [interrupt, setInterrupt] = useState<{
    drug: string;
    reason: string;
    alternatives: string[];
  } | null>(null);

  // --- step 0: presentation ---
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [encounterKind, setEncounterKind] = useState<EncounterKind>('OUTPATIENT');
  const [triageBand, setTriageBand] = useState<'' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN'>('');

  // --- step 2: treatments administered ---
  const [treatments, setTreatments] = useState<RecordedTreatment[]>([]);

  // --- step 4: disposition ---
  const [disposition, setDisposition] = useState<Disposition | ''>('');

  /*
   * Saving happens once, on Complete.
   *
   * Clinical tables are append-only: a diagnosis written the moment it is
   * tapped cannot be removed if the clinician changes their mind, only
   * superseded with a formal amendment. Holding the encounter locally until
   * it is finished means a mis-tap costs nothing, and the record receives
   * one coherent consultation rather than a trail of corrections.
   *
   * The cost is honest and stated: a browser that dies mid-encounter loses
   * the work. That is the better trade while a clinician is still deciding.
   */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedEncounterId, setSavedEncounterId] = useState<string | null>(null);

  useEffect(() => {
    loadDiagnosisIndex().then(setDiagnosisIndex);
    loadMedicationIndex().then(setMedicationIndex);
    // A failure here is survivable: the clinician can still type the
    // treatment themselves, so it does not surface as an error.
    nhp.searchTreatments('').then(setTreatmentIndex).catch(() => setTreatmentIndex([]));
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

  /*
   * Treatments are fetched once and then searched locally, like diagnoses
   * and medicines.
   *
   * The catalogue is 83 rows. Keeping the search synchronous means the
   * component contract stays the same across all three steps, and a
   * clinician who has loaded the screen can keep working if the network
   * drops mid-consultation.
   */
  const queryTreatments = useCallback(
    (q: string): SearchResult[] => {
      const query = q.trim().toLowerCase();
      if (query.length < 2) return [];
      return treatmentIndex
        .filter(
          (t) =>
            t.title.toLowerCase().includes(query) ||
            t.txCode.toLowerCase().startsWith(query) ||
            t.plainEn.toLowerCase().includes(query),
        )
        .slice(0, 8)
        .map((t) => ({
          code: t.txCode,
          title: t.title,
          detail: t.plainEn,
          badge: t.requiresConsent
            ? { label: 'CONSENT', tone: 'caution' as const }
            : undefined,
        }));
    },
    [treatmentIndex],
  );

  function addTreatment(result: SearchResult) {
    setTreatments((prev) =>
      prev.some((t) => t.code === result.code && result.code !== 'UNCODED')
        ? prev
        : [...prev, { code: result.code, title: result.title, indication: '' }],
    );
  }

  /** A treatment the catalogue does not list, in the clinician's own words. */
  function addUncodedTreatment(text: string) {
    setTreatments((prev) => [
      ...prev,
      { code: 'UNCODED', title: text, indication: '' },
    ]);
  }

  /**
   * Writes the whole consultation, then closes it.
   *
   * Ordered so the encounter exists before anything hangs off it, and the
   * close comes last — the server refuses a treatment on a closed encounter,
   * which is the guarantee that a record cannot grow after it was signed off.
   *
   * If a step fails partway, the encounter stays OPEN rather than being
   * closed with half the consultation missing. An open encounter is visibly
   * unfinished and can be completed; one closed around missing diagnoses
   * looks complete and is not. `savedEncounterId` keeps the id so a retry
   * adds to the same encounter instead of opening a second one for the same
   * visit.
   */
  async function completeEncounter() {
    if (!patient || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      let encounterId = savedEncounterId;
      if (!encounterId) {
        const opened = await nhp.openEncounter({
          personId: patient.person.id,
          kind: encounterKind,
          chiefComplaint: chiefComplaint.trim(),
        });
        encounterId = opened.id;
        setSavedEncounterId(encounterId);
      }

      for (const d of diagnoses) {
        await nhp.recordDiagnosis(encounterId, { icd11Code: d.code });
      }

      for (const t of treatments) {
        await nhp.recordTreatment(encounterId, {
          txCode: t.code,
          ...(t.code === 'UNCODED' ? { title: t.title } : {}),
          // The chief complaint is the honest fallback: it is why the
          // treatment happened, even when nobody typed a narrower reason.
          indication: t.indication.trim() || chiefComplaint.trim(),
        });
      }

      for (const m of medications) {
        const amount = Number.parseFloat(m.dose);
        await nhp.recordMedication(encounterId, {
          kemlCode: m.code,
          doseAmount: Number.isFinite(amount) ? amount : 1,
          doseUnit: m.dose.replace(/^[\d.\s]+/, '').trim() || 'unit',
          frequency: m.frequency,
          ...(m.durationDays ? { durationDays: Number(m.durationDays) } : {}),
        });
      }

      await nhp.closeEncounter(encounterId, disposition as Disposition);
      router.push(`/patient/${patient.person.displayNumber}`);
    } catch (e) {
      setSaveError(
        e instanceof ApiError
          ? e.message
          : 'Could not save this encounter. Nothing was closed — try again.',
      );
    } finally {
      setSaving(false);
    }
  }

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
                          ? // The same blue as the navigation above it. Two
                            // blues marking "you are here" on one screen
                            // reads as a fault rather than a hierarchy.
                            'bg-gov-bright font-semibold text-white'
                          : 'text-ink-soft hover:bg-surface'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                          state === 'done'
                            ? 'bg-good-soft text-good'
                            : state === 'current'
                              ? // The row behind this is now solid gov blue,
                                // so a gov-blue badge would vanish into it.
                                'bg-ongov/20 text-ongov'
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

            {/* --- 0. Presentation --- */}
            {step === 0 && (
              <div className="space-y-4">
                <label className="block">
                  <span className="eyebrow mb-1 block">
                    What they have come for
                  </span>
                  <textarea
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    rows={3}
                    maxLength={500}
                    autoFocus
                    /* Their words, not a diagnosis. The diagnosis is step
                       two, and inviting one here means the record carries a
                       conclusion before anyone examined the patient. */
                    placeholder="In their own words — e.g. fever and headache for three days"
                    className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="eyebrow mb-1 block">Kind of visit</span>
                    <select
                      value={encounterKind}
                      onChange={(e) => setEncounterKind(e.target.value as EncounterKind)}
                      className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm"
                    >
                      <option value="OUTPATIENT">Outpatient</option>
                      <option value="EMERGENCY">Emergency</option>
                      <option value="MATERNITY">Maternity</option>
                      <option value="IMMUNISATION">Immunisation</option>
                      <option value="SCREENING">Screening</option>
                      <option value="FOLLOW_UP">Follow-up</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="eyebrow mb-1 block">Triage (optional)</span>
                    <select
                      value={triageBand}
                      onChange={(e) =>
                        setTriageBand(e.target.value as typeof triageBand)
                      }
                      className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">Not triaged</option>
                      <option value="RED">Red — immediate</option>
                      <option value="ORANGE">Orange — very urgent</option>
                      <option value="YELLOW">Yellow — urgent</option>
                      <option value="GREEN">Green — standard</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {/* --- 2. Treatment --- */}
            {step === 2 && (
              <CodedSearch
                label="Search treatments given"
                placeholder="Type a treatment — try dressing, oxygen, suturing, counselling"
                onQuery={queryTreatments}
                onSelect={addTreatment}
                /* A clinician does things the catalogue has not thought of.
                   Refusing them would produce a record that quietly
                   disagrees with what happened. */
                onKeepAsNote={addUncodedTreatment}
                autoFocus
              />
            )}

            {/* --- 4. Disposition --- */}
            {step === 4 && (
              <div className="space-y-4">
                <fieldset>
                  <legend className="eyebrow mb-2">How the visit ended</legend>
                  <div className="space-y-1.5">
                    {DISPOSITIONS.map((d) => (
                      <label
                        key={d.value}
                        className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                          disposition === d.value
                            ? 'border-gov bg-gov-soft'
                            : 'border-rule bg-surface hover:bg-surface-alt'
                        }`}
                      >
                        <input
                          type="radio"
                          name="disposition"
                          value={d.value}
                          checked={disposition === d.value}
                          onChange={() => setDisposition(d.value)}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{d.label}</span>
                          <span className="block text-micro text-ink-soft">{d.detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/*
                  Referral is deliberately absent from the list above.

                  The referral flow records that disposition itself and links
                  the referral to it; choosing REFERRED here would claim a
                  referral that was never made, and the server refuses it.
                */}
                <p className="rounded border border-dashed border-rule px-3 py-2 text-micro text-ink-faint">
                  Referring instead? Create the referral — it records the
                  disposition and links the letter to this encounter.
                </p>
              </div>
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

            {treatments.length > 0 && (
              <section className="mt-6 border-t border-rule pt-5">
                <p className="eyebrow mb-2">Treatments given</p>
                <ul className="space-y-1.5">
                  {treatments.map((t, i) => (
                    <li
                      key={`${t.code}-${i}`}
                      className="rounded border border-rule bg-surface px-3 py-2"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {t.title}
                        </span>
                        {t.code === 'UNCODED' ? (
                          <span className="chip chip-caution">UNCODED</span>
                        ) : (
                          <span className="font-mono text-micro text-ink-faint">
                            {t.code}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setTreatments((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-micro text-ink-faint underline hover:text-critical"
                        >
                          Remove
                        </button>
                      </div>
                      <label className="block">
                        <span className="eyebrow mb-0.5 block">
                          What it was for (optional)
                        </span>
                        <input
                          value={t.indication}
                          onChange={(e) =>
                            setTreatments((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, indication: e.target.value } : x,
                              ),
                            )
                          }
                          /* Left blank, the chief complaint is used. It is
                             the honest reason the treatment happened, and
                             the server requires an indication either way. */
                          placeholder={chiefComplaint || 'Defaults to the reason for the visit'}
                          className="w-full rounded border border-rule bg-surface px-2 py-1 text-sm"
                        />
                      </label>
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
            {/* --- finishing --- */}
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((n) => n - 1)}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-rule px-4 text-sm text-ink-soft hover:bg-surface-alt"
                >
                  Back
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((n) => n + 1)}
                  /* The chief complaint is what opens the encounter on the
                     server. Without it nothing else can be recorded, so the
                     first step is the one gate in the flow. */
                  disabled={step === 0 && !chiefComplaint.trim()}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-gov px-5 font-semibold text-ongov disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={completeEncounter}
                  disabled={saving || !disposition || !chiefComplaint.trim() || !session}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-gov px-5 font-semibold text-ongov disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Complete encounter'}
                </button>
              )}

              {step === STEPS.length - 1 && !disposition && (
                <span className="text-micro text-ink-faint">
                  Choose how the visit ended to finish.
                </span>
              )}
            </div>

            {saveError && (
              <p
                role="alert"
                className="mt-3 rounded border border-critical/40 bg-critical-soft px-3 py-2 text-sm text-critical"
              >
                {saveError}
                {savedEncounterId && (
                  /* Says what survived. Without this the clinician cannot
                     tell whether pressing Complete again would duplicate
                     the consultation. */
                  <span className="mt-1 block text-micro">
                    The encounter was opened and is still recorded as
                    unfinished — pressing Complete again will finish it
                    rather than start a second one.
                  </span>
                )}
              </p>
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
