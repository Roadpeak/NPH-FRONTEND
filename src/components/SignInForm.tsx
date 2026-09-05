'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, setSession, ApiError } from '@/lib/api';
import { portalFor, refusalFor, type Portal } from '@/lib/portals';
import { PortalShell, Field, inputClass, SubmitButton, ErrorNote } from './PortalShell';
import { MfaEnrolment } from './MfaEnrolment';

/**
 * Sign in — the single implementation, used by all four portals.
 *
 * The portals are separate front doors, not separate authentication. Four
 * copies of this logic would be four places for a session bug to hide, and
 * the one that mattered would be whichever a reviewer skipped.
 *
 * Two stages, because privileged accounts require a second factor and the
 * SERVER enforces it — a client that skipped the MFA step would simply never
 * receive an access token.
 *
 * Errors are shown exactly as the API worded them: "that phone number and
 * password do not match" is deliberately identical for an unknown number and
 * a wrong password, so this form cannot be used to discover who holds an
 * account.
 */
export function SignInForm({
  portal,
  reason,
}: {
  portal: Portal;
  /** Set when a restored session needs its second factor re-presented. */
  reason?: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'CREDENTIALS' | 'MFA' | 'ENROL' | 'ENROLLED'>(
    'CREDENTIALS',
  );
  const [enrolToken, setEnrolToken] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaMode, setMfaMode] = useState<'SMS' | 'TOTP'>('TOTP');
  const [sentTo, setSentTo] = useState<string | null>(null);
  /**
   * The code, shown on screen while there is no SMS gateway.
   *
   * The API sends this only outside production and only while the console
   * SMS provider is configured, so it disappears by itself once real SMS is
   * wired up — there is no flag here to remember to turn off.
   */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Where to send them once signed in — or why they cannot come in.
   *
   * A sign-in lands where it was aimed or is refused. Sending somebody to
   * a different portal than the door they used is the worst of both: they
   * typed the facility address, gave correct credentials, and arrived on
   * their own medical record with no explanation, which reads as the
   * system being broken rather than as "you do not work at a facility".
   *
   * The SERVER decides which roles the account holds; this only compares
   * that answer against the door.
   */
  async function land() {
    const me = await auth.me();

    const refusal = refusalFor(me, portal);
    if (refusal) {
      // Signed in, but not into this portal. The session is dropped so
      // they are not left half-authenticated on a screen they cannot use.
      await auth.logout().catch(() => {});
      setError(refusal);
      setStage('CREDENTIALS');
      setCode('');
      return;
    }

    router.push(portalFor(me, portal).landingPath);
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await auth.login(phone, password);

      if (result.status === 'MFA_ENROLMENT_REQUIRED') {
        // Not an error. The password was correct; this account simply has
        // no second factor yet, and until now that was a dead end.
        setEnrolToken(result.enrolToken!);
        setStage('ENROL');
      } else if (result.status === 'MFA_REQUIRED') {
        setMfaToken(result.mfaToken!);
        setMfaMode(result.mfaMode ?? 'TOTP');
        setSentTo(result.sentTo ?? null);
        setDevCode(result.devCode ?? null);
        setStage('MFA');
      } else {
        setSession(result.accessToken!, result.csrfToken ?? null);
        await land();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await auth.completeMfa(mfaToken, code);
      setSession(result.accessToken!, result.csrfToken ?? null);
      await land();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell
      portalName={portal.name}
      title={
        stage === 'CREDENTIALS'
          ? 'Sign in'
          : stage === 'ENROL'
            ? 'Set up your second factor'
            : stage === 'ENROLLED'
              ? 'Second factor ready'
              : 'Second factor'
      }
      intro={
        reason === 'mfa' ? (
          <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-3 py-2.5 text-sm text-caution">
            Your session was restored, but clinical access needs your second
            factor again. Signing in confirms it is still you at this device.
          </p>
        ) : null
      }
    >
      {stage === 'ENROL' ? (
        <MfaEnrolment
          enrolToken={enrolToken}
          onDone={() => setStage('ENROLLED')}
        />
      ) : stage === 'ENROLLED' ? (
        <>
          <p className="mb-5 max-w-prose text-sm text-ink-soft">
            Your second factor is set up. Sign in again and you will be asked
            for a code.
          </p>
          <button
            onClick={() => {
              // Back to a clean credentials form: the password they typed a
              // few minutes ago is stale in the field but not in their head,
              // and pre-filling it would be a shoulder-surfing risk.
              setStage('CREDENTIALS');
              setPassword('');
              setEnrolToken('');
              setError(null);
            }}
            className="w-full rounded-md bg-gov px-4 py-2.5 font-semibold text-surface"
          >
            Sign in
          </button>
        </>
      ) : stage === 'CREDENTIALS' ? (
        <form onSubmit={submitCredentials}>
          <Field id="phone" label="Phone number">
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              className={inputClass}
            />
          </Field>

          <Field id="password" label="Password">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          <SubmitButton busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</SubmitButton>

          {portal.selfRegistration ? (
            <p className="mt-4 text-center text-sm text-ink-soft">
              No account yet?{' '}
              {/* Padded to a thumb-sized target: this is the primary route
                  to creating an account, and a 17px link is one a thumb
                  misses on a phone. */}
              <Link
                href={portal.registerPath}
                className="inline-flex min-h-[44px] items-center px-2 font-semibold text-gov underline"
              >
                Register
              </Link>
            </p>
          ) : (
            /* The Ministry portal has no self-registration: a national-scope
               account is issued, never self-created. Saying so is better
               than a missing link the visitor reads as a broken page. */
            <p className="mt-4 text-center text-micro text-ink-faint">
              Ministry accounts are issued by the Ministry of Health. They
              cannot be created here.
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={submitMfa}>
          <p className="mb-4 text-sm text-ink-soft">
            {portal.id === 'citizen'
              ? 'A second factor protects your health record.'
              : 'This account reaches identifiable health data, so a second factor is required.'}{' '}
            {mfaMode === 'SMS' ? (
              <>
                We sent a code to <span className="font-mono text-ink">{sentTo}</span>.
              </>
            ) : (
              'Enter the six-digit code from your authenticator app.'
            )}
          </p>

          {devCode && (
            /*
              A stopgap, and it says so.

              Labelled loudly rather than shown as a neutral hint, because
              the one failure mode that matters is this reaching a real
              deployment unnoticed. Anyone who sees it should be able to
              tell instantly that it is not meant to be there.
            */
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

          <Field id="code" label="Authentication code">
            <input
              id="code"
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
            {busy ? 'Verifying…' : 'Verify'}
          </SubmitButton>

          {mfaMode === 'SMS' && (
            <button
              type="button"
              disabled={busy || resent}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await auth.resendMfaCode(mfaToken);
                  setSentTo(result.sentTo);
                  setDevCode(result.devCode ?? null);
                  // Once only: each resend invalidates the previous code,
                  // so repeated taps just confuse the person signing in.
                  setResent(true);
                  setCode('');
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Could not resend');
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-2 w-full rounded-md px-4 py-2 text-sm text-gov disabled:text-ink-faint"
            >
              {resent ? 'Code resent — check your phone' : 'Resend the code'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setStage('CREDENTIALS');
              setCode('');
              setSentTo(null);
              setResent(false);
              setError(null);
            }}
            className="mt-2 w-full rounded-md px-4 py-2 text-sm text-ink-soft"
          >
            Back
          </button>
        </form>
      )}

      <ErrorNote message={error} />
    </PortalShell>
  );
}
