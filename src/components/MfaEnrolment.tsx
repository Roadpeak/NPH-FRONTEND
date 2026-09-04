'use client';

import { useState } from 'react';
import { auth, ApiError } from '@/lib/api';
import { Field, inputClass, SubmitButton, ErrorNote } from './PortalShell';
import { Icon } from './icons';

/**
 * Enrolling a second factor.
 *
 * Reached in two situations, and the difference matters:
 *
 *   - A clinician who has just registered and CANNOT sign in yet. They
 *     arrive holding an enrolment token, which is scoped to these routes
 *     and is not a session. Before this existed they were locked out
 *     permanently: every enrolment route needed a session, and the account
 *     could not obtain one.
 *
 *   - Someone already signed in, adding or changing a factor. No token.
 *
 * SMS is offered first. Kenya has near-universal mobile coverage and
 * authenticator apps are not a given on a shared or low-end handset — but a
 * clinician who works where the network does not reach needs the app, so
 * both are here and neither is hidden behind the other.
 */

type Method = 'SMS' | 'TOTP';

export function MfaEnrolment({
  enrolToken,
  onDone,
  /** Shown above the choice; why this is being asked for now. */
  reason,
}: {
  enrolToken?: string;
  onDone: () => void;
  reason?: string;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  const [stage, setStage] = useState<'CHOOSE' | 'CONFIRM'>('CHOOSE');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** Shown only while no SMS gateway is configured. See SignInForm. */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(chosen: Method) {
    setBusy(true);
    setError(null);
    try {
      if (chosen === 'SMS') {
        const r = await auth.enrolSms(enrolToken);
        setSentTo(r.sentTo);
        setDevCode(r.devCode ?? null);
      } else {
        setTotp(await auth.enrolTotp('NHP', enrolToken));
      }
      setMethod(chosen);
      setStage('CONFIRM');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start enrolment');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (method === 'SMS') await auth.confirmSms(code, enrolToken);
      else await auth.confirmTotp(code, enrolToken);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That code was not accepted');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'CHOOSE') {
    return (
      <>
        <p className="mb-5 max-w-prose text-sm text-ink-soft">
          {reason ??
            'This account can reach patient records, so it needs a second ' +
              'factor before you can sign in. Choose how you want to receive ' +
              'your codes.'}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => start('SMS')}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-lg border border-rule bg-surface px-4 py-3 text-left hover:border-gov disabled:opacity-60"
          >
            <Icon name="phone" size={18} className="mt-0.5 text-gov" />
            <span>
              <span className="block font-semibold">Text message</span>
              <span className="block text-micro text-ink-soft">
                A six-digit code to your phone each time you sign in. Works on
                any handset, and needs no app.
              </span>
            </span>
          </button>

          <button
            onClick={() => start('TOTP')}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-lg border border-rule bg-surface px-4 py-3 text-left hover:border-gov disabled:opacity-60"
          >
            <Icon name="verified" size={18} className="mt-0.5 text-gov" />
            <span>
              <span className="block font-semibold">Authenticator app</span>
              <span className="block text-micro text-ink-soft">
                {/* The reason this option exists at all: a clinician at a
                    rural facility may have no signal when they need to
                    sign in. */}
                Codes generated on your phone, with no network needed. Use
                this if you work where the mobile network is unreliable.
              </span>
            </span>
          </button>
        </div>

        <ErrorNote message={error} />
      </>
    );
  }

  return (
    <form onSubmit={confirm}>
      {method === 'SMS' ? (
        <>
          <p className="mb-4 text-sm text-ink-soft">
            We sent a code to <span className="font-mono text-ink">{sentTo}</span>.
            Enter it to finish.
          </p>
          {devCode && (
            /* Enrolment needs it as much as sign-in does: without SMS, a
               new account has no other way to see the code that confirms
               its own second factor. */
            <div className="mb-4 rounded-md border border-caution bg-caution-soft px-3 py-2.5">
              <p className="eyebrow mb-1 text-caution">
                No SMS gateway configured — code shown here
              </p>
              <p className="text-center font-mono text-2xl tracking-[0.3em] text-ink">
                {devCode}
              </p>
              <p className="mt-1 text-micro text-ink-soft">
                This will stop appearing as soon as SMS sending is set up.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            Add this to your authenticator app, then enter the code it shows.
          </p>
          {/* The secret in text as well as a scannable string: a camera that
              will not focus, or a cracked screen, must not end the
              enrolment. */}
          <p className="mb-4 rounded-md border border-rule bg-surface-alt px-4 py-3">
            <span className="eyebrow mb-1 block">Setup key</span>
            <span className="block break-all font-mono text-sm font-semibold">
              {totp?.secret}
            </span>
          </p>
        </>
      )}

      <Field id="mfaCode" label="Six-digit code">
        <input
          id="mfaCode"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
        />
      </Field>

      <SubmitButton busy={busy} disabled={code.length < 6}>
        {busy ? 'Checking…' : 'Finish setup'}
      </SubmitButton>

      <button
        type="button"
        onClick={() => {
          setStage('CHOOSE');
          setCode('');
          setError(null);
        }}
        className="mt-2 w-full rounded-md px-4 py-2 text-sm text-ink-soft"
      >
        Choose a different method
      </button>

      <ErrorNote message={error} />
    </form>
  );
}
