'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SafetyBanner } from '@/components/SafetyBanner';
import { Sparkline } from '@/components/Sparkline';
import {
  nhp,
  hasSession,
  restoreSession,
  ApiError,
  type PatientSummary,
  type TimelineEncounter,
  type KeyResult,
  type ProcedureRecord,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { WorkerNav } from '@/components/WorkerNav';

/**
 * The clinician's patient summary.
 *
 * The most-viewed screen in the system. A clinician opens it, scans it, and
 * decides — so the design target from the wireframes is that everything
 * capable of causing harm is visible without scrolling, without clicking.
 *
 * Three columns answering three questions:
 *   what is wrong with them · what has been happening · what are the numbers
 *
 * DO NOT reorganise this into tabs. Someone will propose it to reclaim
 * vertical space, and the moment allergies live behind a tab the safety
 * guarantee is gone. Density is the correct answer; hiding is not.
 */

const CADRE_LABELS: Record<string, string> = {
  DOCTOR: 'Dr',
  CLINICAL_OFFICER: 'CO',
  NURSE: 'Nurse',
  MIDWIFE: 'Midwife',
  DENTIST: 'Dr',
  PHARMACIST: 'Pharm',
};

function formatDate(iso: string, precision = 'EXACT') {
  const d = new Date(iso);
  if (precision === 'YEAR') return String(d.getUTCFullYear());
  if (precision === 'MONTH')
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PatientSummaryPage({
  params,
}: {
  params: Promise<{ nhpId: string }>;
}) {
  const { nhpId } = use(params);
  const router = useRouter();

  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEncounter[]>([]);
  const [results, setResults] = useState<KeyResult[]>([]);
  const [procedures, setProcedures] = useState<ProcedureRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.worker.signInPath);
          return;
        }
        if (cancelled) return;

        // The banner is what the clinician acts on, so it is fetched first
        // and rendered as soon as it lands; the rest fills in behind it.
        const s = await nhp.patientSummary(nhpId);
        if (cancelled) return;
        setSummary(s);

        const [t, r, p] = await Promise.all([
          nhp.patientTimeline(nhpId),
          nhp.keyResults(nhpId),
          nhp.procedures(nhpId),
        ]);
        if (cancelled) return;
        setTimeline(t);
        setResults(r);
        setProcedures(p);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === 'MFA_REQUIRED' || err.code === 'NO_SESSION')) {
          router.replace(`${PORTALS.worker.signInPath}?reason=mfa`);
          return;
        }
        setLoadError(
          err instanceof ApiError ? `${err.message} (${err.code})` : 'Could not reach the API',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nhpId, router]);

  const person = summary?.person;

  return (
    <div className="min-h-screen bg-surface-sunken">
      <WorkerNav />
      {/* --- identity --- */}
      <header className="border-b border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {person ? `${person.givenName} ${person.familyName}` : 'Loading patient…'}
            </h1>
            <p className="truncate font-mono text-micro text-ink-faint">
              {person
                ? `${person.displayNumber} · ${person.sexAtBirth[0]} · ${person.age}y` +
                  (person.bloodGroup
                    ? ` · Blood group ${person.bloodGroup.replace('_POS', '+').replace('_NEG', '−')}`
                    : '')
                : 'from NHP-BACKEND'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              // Carries the patient through. Without the id the encounter
              // screen falls back to the demo record — a silent swap of
              // patient on the one screen that must never do that.
              onClick={() => router.push(`/encounter?patient=${nhpId}`)}
              className="rounded bg-gov px-3 py-1.5 text-sm font-semibold text-surface"
            >
              Start encounter
            </button>
            {/* Without this, an honest mis-search is indistinguishable from
                browsing in the audit log. */}
            <button
              onClick={() => router.back()}
              className="rounded border border-rule px-3 py-1.5 text-sm text-ink-soft hover:bg-surface"
            >
              Not my patient
            </button>
          </div>
        </div>
      </header>

      {loadError ? (
        /* An empty banner reads as "no allergies" — the most dangerous
           possible failure of this screen. So it fails loudly instead. */
        <div className="border-y border-critical/30 bg-critical-soft px-4 py-3 sm:px-6">
          <p className="mx-auto max-w-7xl text-sm font-semibold text-critical">
            ⚠ Could not load this patient&rsquo;s safety information — {loadError}
          </p>
          <p className="mx-auto max-w-7xl text-micro text-ink-soft">
            Do not prescribe from this screen until it loads. Check the paper record.
          </p>
        </div>
      ) : (
        <SafetyBanner
          allergies={summary?.allergies ?? []}
          medications={summary?.medications ?? []}
          chronicConditions={summary?.chronicConditions ?? []}
          restrictedRecordsExist={summary?.restrictedRecordsExist ?? false}
        />
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* --- 1. what is wrong with them --- */}
          <section>
            <h2 className="eyebrow mb-2">Active problems</h2>
            {summary && summary.chronicConditions.length === 0 ? (
              <p className="text-sm text-ink-faint">None recorded</p>
            ) : (
              <ul className="space-y-1.5">
                {summary?.chronicConditions.map((c) => (
                  <li
                    key={c.icd11Code}
                    className="rounded border border-rule bg-surface px-3 py-2"
                  >
                    <p className="text-sm font-semibold">{c.icd11Title}</p>
                    <p className="font-mono text-micro text-ink-faint">
                      {c.icd11Code}
                      {c.onsetDate && ` · since ${formatDate(c.onsetDate)}`} · CHRONIC
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {summary?.restrictedRecordsExist && (
              <div className="mt-3 rounded border border-caution/40 bg-caution-soft px-3 py-2.5">
                <p className="text-sm font-semibold text-caution">
                  Restricted records exist
                </p>
                <p className="text-micro text-ink-soft">
                  Ask the patient, or use emergency access
                </p>
              </div>
            )}

            {procedures.length > 0 && (
              <>
                <h2 className="eyebrow mb-2 mt-6">Past surgeries &amp; procedures</h2>
                <ul className="space-y-1.5">
                  {procedures.map((p, i) => (
                    <li
                      key={`${p.code}-${i}`}
                      className="rounded border border-rule bg-surface px-3 py-2"
                    >
                      <p className="text-sm">{p.title}</p>
                      <p className="text-micro text-ink-faint">
                        {formatDate(p.performedOn, p.datePrecision)} ·{' '}
                        {p.externalFacilityName ?? 'this facility'}
                      </p>
                      {p.isSelfReported && (
                        /* A clinician must tell documented history from
                           remembered history at a glance. */
                        <span className="chip chip-caution mt-1">
                          patient-recalled · not verified
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* --- 2. what has been happening --- */}
          <section>
            <h2 className="eyebrow mb-2">Recent encounters</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-faint">No encounters recorded</p>
            ) : (
              <ul className="space-y-1.5">
                {timeline.slice(0, 6).map((e) => (
                  <li key={e.id} className="rounded border border-rule bg-surface px-3 py-2">
                    <p className="text-sm font-semibold">
                      {e.conditions[0]?.icd11Title ?? e.chiefComplaint}
                    </p>
                    <p className="text-micro text-ink-soft">
                      {e.facilityName} · {formatDate(e.startedAt)}
                    </p>
                    {/* Every encounter names its author: it builds trust in
                        the record, and lets a clinician call whoever saw the
                        patient last. */}
                    <p className="font-mono text-micro text-ink-faint">
                      {CADRE_LABELS[e.recordedByCadre ?? ''] ?? ''} {e.recordedByName} ·{' '}
                      {e.licenceNumber}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {timeline.length > 6 && (
              <p className="mt-2 font-mono text-micro text-gov">
                {timeline.length} encounters in this page
              </p>
            )}
          </section>

          {/* --- 3. what are the numbers doing --- */}
          <section>
            <h2 className="eyebrow mb-2">Key results</h2>
            {results.length === 0 ? (
              <p className="text-sm text-ink-faint">No results recorded</p>
            ) : (
              <ul className="space-y-3">
                {results.map((r) => {
                  const abnormal =
                    r.latest.abnormalFlag === 'HIGH' ||
                    r.latest.abnormalFlag === 'LOW' ||
                    r.latest.abnormalFlag === 'CRITICAL';
                  return (
                    <li key={r.code} className="rounded border border-rule bg-surface px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-ink-soft">{r.label}</span>
                        <span
                          className={`font-mono text-sm font-semibold ${
                            abnormal ? 'text-critical' : 'text-ink'
                          }`}
                        >
                          {r.latest.value}
                          {r.unit && <span className="font-normal"> {r.unit}</span>}
                        </span>
                      </div>
                      <div className="mt-1 flex items-end justify-between gap-2">
                        <Sparkline
                          points={r.series}
                          refLow={r.refLow}
                          refHigh={r.refHigh}
                          status={r.latest.abnormalFlag}
                          label={r.label}
                        />
                        <span className="text-micro text-ink-faint">
                          {r.series.length} readings
                          {r.refHigh != null && ` · target <${r.refHigh}`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-rule bg-surface-alt">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <p className="font-mono text-micro text-ink-faint">
            This view has been logged and is visible to the patient
          </p>
        </div>
      </footer>
    </div>
  );
}
