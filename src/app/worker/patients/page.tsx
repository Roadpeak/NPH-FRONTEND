'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  nhp,
  hasSession,
  restoreSession,
  ApiError,
  type PersonSummary,
  type CheckInSession,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { WorkerNav } from '@/components/WorkerNav';
import { Field, inputClass } from '@/components/PortalShell';
import { Icon } from '@/components/icons';

/**
 * Finding a patient.
 *
 * By National ID or NHP number, exactly — never a browsable list. This is
 * the entry point to a clinical record, and a search that returns "everyone
 * called Achieng" is a search that lets someone read records they have no
 * business in.
 *
 * Dependants are returned alongside the match, because a facility finding a
 * child searches the GUARDIAN's ID — a two-year-old has no National ID of
 * their own, and that is the whole reason guardianship exists in the model.
 */
export default function PatientSearchPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState<{
    match: PersonSummary | null;
    dependants: PersonSummary[];
  } | null>(null);
  const [session, setSession] = useState<CheckInSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.worker.signInPath);
          return;
        }
        const s = await nhp.currentSession();
        if (!cancelled) setSession(s);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.worker.signInPath}?reason=mfa`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await nhp.searchPatients(identifier.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not search');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <WorkerNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">
          Find a patient
        </h1>
        <p className="mb-6 max-w-prose text-sm text-ink-soft">
          Search by National ID or NHP number. Opening a record is logged and
          shown to that patient.
        </p>

        {!session && (
          /* Said before they search, not after they try to open a record:
             the server refuses a read without an open check-in. */
          <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-4 py-3 text-sm text-caution">
            You are not checked in, so you cannot open a record.{' '}
            <Link href="/worker/shift" className="font-semibold underline">
              Start your shift
            </Link>{' '}
            first.
          </p>
        )}

        <form onSubmit={search} className="mb-6 max-w-md">
          <Field
            id="identifier"
            label="National ID or NHP number"
            hint="For a child, search their parent or guardian's National ID."
          >
            <div className="flex gap-2">
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="12345678 or NHP-XXXX-XXXX"
                className={`${inputClass} font-mono`}
              />
              <button
                type="submit"
                disabled={busy || identifier.trim().length < 4}
                className="shrink-0 rounded-md bg-gov px-4 py-2.5 font-semibold text-surface disabled:opacity-60"
              >
                <Icon name="search" size={15} className="mr-1.5 -mt-0.5" />
                {busy ? 'Searching…' : 'Search'}
              </button>
            </div>
          </Field>
        </form>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            {error}
          </p>
        )}

        {result && !result.match && result.dependants.length === 0 && (
          <p className="text-sm text-ink-faint">
            No record holds that identifier. Check the number, or register
            them at reception.
          </p>
        )}

        {result?.match && (
          <>
            <h2 className="eyebrow mb-2">Patient</h2>
            <PatientRow person={result.match} canOpen={Boolean(session)} />
          </>
        )}

        {result && result.dependants.length > 0 && (
          <>
            <h2 className="eyebrow mb-2 mt-6">
              Children in their care
            </h2>
            <p className="mb-2 max-w-prose text-micro text-ink-faint">
              {/* Why this list exists at all: a child has no ID of their own,
                  so a facility reaches them through their guardian. */}
              A child is found through their guardian, because they have no
              National ID of their own.
            </p>
            <ul className="space-y-2">
              {result.dependants.map((d) => (
                <li key={d.id}>
                  <PatientRow person={d} canOpen={Boolean(session)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function PatientRow({ person, canOpen }: { person: PersonSummary; canOpen: boolean }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {person.givenName} {person.familyName}
        </p>
        <p className="font-mono text-micro text-ink-faint">
          {person.displayNumber} · {person.age}
          {person.sexAtBirth ? ` · ${person.sexAtBirth[0]}` : ''}
        </p>
        {person.verificationState !== 'VERIFIED' && (
          /* A facility must know an identity is unconfirmed BEFORE treating
             on it, not after. */
          <p className="inline-flex items-center gap-1 text-micro text-caution">
            <Icon name="pending" size={12} />
            Identity not confirmed
          </p>
        )}
      </div>

      {canOpen ? (
        <Link
          href={`/patient/${person.displayNumber}`}
          className="rounded-md bg-gov px-4 py-2 text-sm font-semibold text-surface"
        >
          Open record
        </Link>
      ) : (
        <span className="text-micro text-ink-faint">Check in to open</span>
      )}
    </div>
  );
}
