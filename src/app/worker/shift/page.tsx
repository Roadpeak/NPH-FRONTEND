'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nhp, hasSession, restoreSession, ApiError, type CheckInSession } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { WorkerNav } from '@/components/WorkerNav';
import { Icon } from '@/components/icons';

/**
 * Starting and ending a shift.
 *
 * The check-in is the gate on every clinical write: it makes a record
 * attributable to a place as well as a person, and the server refuses a
 * write without one. A clinician who cannot reach this screen cannot work
 * at all, which is where the portal stood — the endpoint existed and
 * nothing called it.
 *
 * Only facilities they are POSTED to are offered. A clinician cannot work
 * somewhere nobody authorised them to, and offering the national register
 * would be offering a refusal.
 */
export default function ShiftPage() {
  const router = useRouter();
  const [session, setSession] = useState<CheckInSession | null>(null);
  const [facilities, setFacilities] = useState<
    Awaited<ReturnType<typeof nhp.myFacilities>> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [s, f] = await Promise.all([nhp.currentSession(), nhp.myFacilities()]);
    setSession(s);
    setFacilities(f);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.worker.signInPath);
          return;
        }
        if (!cancelled) await load();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.worker.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load');
        setFacilities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function start(facilityId: string) {
    setBusy(facilityId);
    setError(null);
    try {
      await nhp.checkIn(facilityId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check in');
    } finally {
      setBusy(null);
    }
  }

  async function end() {
    setBusy('END');
    setError(null);
    try {
      await nhp.checkOut();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check out');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <WorkerNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">My shift</h1>
        <p className="mb-6 max-w-prose text-sm text-ink-soft">
          You must be checked in at a facility to record anything clinical.
          Every record you write is stamped with where you were and which
          licence was current.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            {error}
          </p>
        )}

        {/*
          The check-in state, as a status board rather than a card.

          This one fact gates every clinical write in the system, and it was
          rendered at the same weight as the list of postings below it. A
          clinician glancing at this page between patients is asking one
          question — can I write? — and the answer should be readable from
          across a room.
        */}
        {session ? (
          <div className="mb-8 overflow-hidden rounded-lg border border-good/30 bg-good-soft">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
              <div className="min-w-0">
                <p className="eyebrow mb-1 text-good">Checked in</p>
                <p className="font-serif text-2xl font-medium leading-tight">
                  {session.facilityName}
                </p>
              </div>
              <button
                onClick={end}
                disabled={busy === 'END'}
                className="btn shrink-0 border border-rule bg-surface hover:border-critical hover:text-critical"
              >
                {busy === 'END' ? 'Ending…' : 'End my shift'}
              </button>
            </div>
            {/*
              The countdown gets its own band. A session that lapses
              mid-consultation is the failure this exists to prevent, and
              when it is ending soon that has to be the loudest thing here.
            */}
            <p
              className={`border-t px-5 py-2.5 font-mono text-micro ${
                session.expiringSoon
                  ? 'border-caution/40 bg-caution-soft font-semibold text-caution'
                  : 'border-good/20 text-ink-soft'
              }`}
            >
              {session.expiringSoon
                ? `ENDING SOON — ${session.minutesRemaining} minutes left. Check in again before it lapses.`
                : `Expires in ${session.minutesRemaining} minutes`}
            </p>
          </div>
        ) : (
          <div className="mb-8 rounded-lg border border-caution/40 bg-caution-soft px-5 py-5">
            <p className="eyebrow mb-1 text-caution">Not checked in</p>
            <p className="font-serif text-2xl font-medium leading-tight">
              You cannot open or write a record
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Check in at one of your postings below to start your shift.
            </p>
          </div>
        )}

        <h2 className="eyebrow mb-2">Where you are posted</h2>

        {facilities === null ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : facilities.length === 0 ? (
          /*
            The honest empty state. A registered clinician with no posting
            is not broken — they are waiting on someone to authorise them,
            and this says who.
          */
          <div className="card card-body">
            <p className="mb-2 text-sm font-semibold">You are not posted anywhere yet</p>
            <p className="mb-1 max-w-prose text-sm text-ink-soft">
              <span className="font-semibold text-ink">At a private facility</span> — a
              mission hospital, an NGO clinic, or a private practice — ask its
              administrator to add you from their facility portal.
            </p>
            <p className="max-w-prose text-sm text-ink-soft">
              <span className="font-semibold text-ink">At a public facility</span> — a
              county or national hospital, a health centre or dispensary — the
              Ministry of Health posts you.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {facilities.map((f) => {
              const here = session?.facilityId === f.facilityId;
              return (
                <li
                  key={f.affiliationId}
                  className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{f.name}</p>
                    <p className="font-mono text-micro text-ink-faint">
                      {f.mflCode ? `${f.mflCode} · ` : ''}KEPH {f.kephLevel} ·{' '}
                      {f.role.replace(/_/g, ' ').toLowerCase()}
                    </p>
                  </div>
                  {here ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-good">
                      <Icon name="confirmed" size={15} />
                      Currently here
                    </span>
                  ) : (
                    <button
                      onClick={() => start(f.facilityId)}
                      disabled={busy !== null}
                      className="btn shrink-0 bg-gov text-white hover:bg-gov/90"
                    >
                      {busy === f.facilityId ? 'Checking in…' : 'Check in here'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
