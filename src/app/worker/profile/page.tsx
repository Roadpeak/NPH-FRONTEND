'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, nhp, hasSession, restoreSession, ApiError } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { WorkerNav } from '@/components/WorkerNav';
import { MfaEnrolment } from '@/components/MfaEnrolment';
import { Icon } from '@/components/icons';

/**
 * A clinician's own professional record.
 *
 * Read-only, and deliberately so: a licence number, a cadre and a posting
 * are attested by a regulator and an employer, not typed by the person they
 * describe. What they CAN change is their second factor, which is theirs
 * alone.
 */
export default function WorkerProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Awaited<ReturnType<typeof auth.me>> | null>(null);
  const [facilities, setFacilities] = useState<
    Awaited<ReturnType<typeof nhp.myFacilities>>
  >([]);
  const [changingMfa, setChangingMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.worker.signInPath);
          return;
        }
        const [m, f] = await Promise.all([auth.me(), nhp.myFacilities()]);
        if (cancelled) return;
        setMe(m);
        setFacilities(f);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.worker.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-surface-sunken">
      <WorkerNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 font-serif text-2xl font-medium tracking-tight">My profile</h1>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            {error}
          </p>
        )}

        {!me ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <>
            <h2 className="eyebrow mb-2">Professional registration</h2>
            {/*
              The professional identity, led by the licence.

              This was a three-row table where the name, the cadre and the
              licence number all read at the same weight. The licence is the
              one that matters: it is what authorises every clinical write,
              it is stamped on every record they create, and it is the thing
              a clinician is asked to quote.
            */}
            <div className="card mb-4 card-body">
              <p className="eyebrow mb-1">
                {me.cadre ? me.cadre.replace(/_/g, ' ').toLowerCase() : 'Practitioner'}
              </p>
              <p className="font-serif text-2xl font-medium leading-tight">
                {me.displayName ?? '—'}
              </p>
              <p className="mt-3 flex items-center gap-2 font-mono text-lg tracking-[0.04em]">
                <Icon name="verified" size={16} className="text-good" />
                {me.licenceNumber ?? '—'}
              </p>
              <p className="mt-1 text-micro text-ink-faint">
                Stamped on every record you write.
              </p>
            </div>
            <p className="mb-7 max-w-prose text-micro text-ink-faint">
              {/* Said plainly, so nobody hunts for an edit button that should
                  not exist. */}
              These come from your regulator and cannot be changed here. If
              something is wrong, contact {me.licenceNumber?.split('/')[0] ?? 'your regulator'}.
            </p>

            <h2 className="eyebrow mb-2">Where you are posted</h2>
            {facilities.length === 0 ? (
              <p className="mb-6 text-sm text-ink-faint">
                Nowhere yet. A facility administrator or the Ministry posts
                you, depending on who owns the facility.
              </p>
            ) : (
              <ul className="mb-6 space-y-1.5">
                {facilities.map((f) => (
                  <li
                    key={f.affiliationId}
                    className="card-row flex items-center justify-between text-sm"
                  >
                    <span>{f.name}</span>
                    <span className="font-mono text-micro text-ink-faint">
                      {f.role.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="eyebrow mb-2">Security</h2>
            {changingMfa ? (
              <div className="card card-body">
                <MfaEnrolment
                  onDone={() => setChangingMfa(false)}
                  reason="Choose how you want to receive your sign-in codes. This replaces your current method."
                />
              </div>
            ) : (
              <div className="card card-body">
                <p className="mb-1 text-sm">
                  Your account requires a second factor at every sign-in.
                </p>
                <p className="mb-3 max-w-prose text-micro text-ink-faint">
                  It reaches identifiable health data, so this cannot be
                  turned off — only changed.
                </p>
                <button
                  onClick={() => setChangingMfa(true)}
                  className="btn border border-gov text-gov hover:bg-gov-soft"
                >
                  Change my second factor
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
