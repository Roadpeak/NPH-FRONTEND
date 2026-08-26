'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  facility,
  hasSession,
  restoreSession,
  ApiError,
  type QueueEntry,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { FacilityNav } from '@/components/FacilityNav';
import { Icon } from '@/components/icons';
import { Field, inputClass } from '@/components/PortalShell';

/**
 * The reception desk.
 *
 * Someone stands here all day with a queue in front of them, so this
 * screen is built for speed and for being read across a counter: large
 * photographs, big names, the wait time in plain words.
 *
 * What is deliberately absent matters as much as what is here. There is
 * no allergy, no diagnosis, no medicine — not hidden behind a toggle,
 * simply not sent by the server. A receptionist confirms they have the
 * right person and puts them in the queue; a waiting room is the least
 * private place in the building, and a screen facing it should carry
 * nothing a passer-by should not read.
 */

/** "12 minutes", "1 hour 5 minutes" — a wait, said the way people say it. */
function waited(since: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 1) return 'just arrived';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export default function ReceptionPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [facilityName, setFacilityName] = useState<string>('');
  const [nhpId, setNhpId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await facility.queue();
    setQueue(r.queue);
    setFacilityName(r.facilityName);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.facility.signInPath);
          return;
        }
        if (!cancelled) await load();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.facility.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load the queue');
        setQueue([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The queue moves without this screen doing anything — a clinician takes
  // someone through from their own portal. A desk showing a stale queue
  // sends people to a room that is already occupied.
  useEffect(() => {
    const timer = setInterval(() => {
      facility
        .queue()
        .then((r) => setQueue(r.queue))
        .catch(() => {
          /* A dropped poll is not worth an error banner; the next succeeds. */
        });
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function addArrival(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await facility.registerArrival(nhpId.trim(), reason.trim() || undefined);
      setNotice(
        r.alreadyWaiting
          ? 'That person is already in the queue.'
          : 'Added to the queue.',
      );
      setNhpId('');
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not register the arrival');
    } finally {
      setBusy(false);
    }
  }

  async function close(visitId: string, status: 'LEFT' | 'COMPLETED') {
    setError(null);
    try {
      await facility.closeArrival(visitId, status);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the queue');
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <FacilityNav />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">Reception</h1>
        <p className="mb-6 text-sm text-ink-soft">
          {facilityName ? `${facilityName} · ` : ''}
          Register everyone who arrives, and confirm the photograph before you
          add them.
        </p>

        {/* Registering an arrival. Deliberately the first thing on the page:
            it is the action, and the queue below is the consequence. */}
        <form
          onSubmit={addArrival}
          className="mb-8 rounded-lg border border-rule bg-surface p-4 sm:p-5"
        >
          <div className="sm:flex sm:gap-4">
            <div className="sm:flex-1">
              <Field id="nhpId" label="NHP number">
                <input
                  id="nhpId"
                  value={nhpId}
                  onChange={(e) => setNhpId(e.target.value.toUpperCase())}
                  placeholder="NHP-XXXX-XXXX"
                  autoComplete="off"
                  required
                  className={`${inputClass} font-mono`}
                />
              </Field>
            </div>
            <div className="sm:flex-1">
              <Field id="reason" label="What they have come for (optional)">
                <input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={280}
                  // Their words, not a diagnosis. Reception is not triaging
                  // and the placeholder must not invite them to.
                  placeholder="In their own words, e.g. cough since Tuesday"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !nhpId.trim()}
            className="inline-flex min-h-[44px] items-center rounded-md bg-gov px-5 font-semibold text-white disabled:opacity-60"
          >
            <Icon name="citizen" size={16} className="mr-2" />
            {busy ? 'Adding…' : 'Add to queue'}
          </button>

          {notice && (
            <p role="status" className="mt-3 text-sm text-good">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-critical">
              {error}
            </p>
          )}
        </form>

        <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-medium">
          Waiting
          {queue && (
            <span className="rounded-full bg-gov-soft px-2 py-0.5 text-micro font-semibold text-gov">
              {queue.length}
            </span>
          )}
        </h2>

        {queue === null && <p className="text-sm text-ink-soft">Loading the queue…</p>}

        {queue?.length === 0 && (
          <p className="rounded-lg border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
            Nobody is waiting.
          </p>
        )}

        <ul className="space-y-2">
          {queue?.map((q) => (
            <li
              key={q.visitId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface p-3 sm:flex-nowrap sm:p-4"
            >
              {/* The photograph, large. Confirming identity across a
                  counter is the whole job of this row. */}
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-rule bg-surface-alt">
                {q.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.photoDataUrl}
                    alt={`Photograph of ${q.displayName}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-ink-faint">
                    <Icon name="citizen" size={22} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{q.displayName}</p>
                <p className="truncate text-micro text-ink-soft">
                  <span className="font-mono">{q.nhpId}</span>
                  {q.ageYears !== null && ` · ${q.ageYears} yrs`}
                  {q.sex && ` · ${q.sex === 'FEMALE' ? 'F' : q.sex === 'MALE' ? 'M' : q.sex}`}
                </p>
                {q.reasonForVisit && (
                  <p className="mt-0.5 truncate text-micro text-ink-faint">
                    “{q.reasonForVisit}”
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="whitespace-nowrap text-micro text-ink-soft"
                  title={new Date(q.arrivedAt).toLocaleString()}
                >
                  <Icon name="pending" size={12} className="mr-1 -mt-0.5" />
                  {waited(q.arrivedAt)}
                </span>

                {q.seenBy ? (
                  <span className="whitespace-nowrap rounded bg-good-soft px-2 py-1 text-micro font-semibold text-good">
                    With a clinician
                  </span>
                ) : (
                  <button
                    onClick={() => close(q.visitId, 'LEFT')}
                    className="min-h-[36px] whitespace-nowrap rounded border border-rule px-2.5 text-micro text-ink-soft hover:border-critical hover:text-critical"
                  >
                    Left without being seen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
