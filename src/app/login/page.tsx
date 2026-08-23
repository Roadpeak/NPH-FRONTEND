'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, setSession, ApiError } from '@/lib/api';

/**
 * Sign in.
 *
 * Two stages, because clinical accounts require a second factor and the
 * server enforces that rather than trusting this screen. A client that
 * skipped the MFA step would simply never receive an access token.
 *
 * Errors are shown exactly as the API worded them: "that phone number and
 * password do not match" is deliberately the same for an unknown number and
 * a wrong password, so this form cannot be used to discover who holds an
 * account.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Set when a restored session needs its second factor re-presented.
  const reason = params.get('reason');
  const [stage, setStage] = useState<'CREDENTIALS' | 'MFA'>('CREDENTIALS');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaMode, setMfaMode] = useState<'SMS' | 'TOTP'>('TOTP');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await auth.login(phone, password);
      if (result.status === 'MFA_REQUIRED') {
        setMfaToken(result.mfaToken!);
        setMfaMode(result.mfaMode ?? 'TOTP');
        setSentTo(result.sentTo ?? null);
        setStage('MFA');
      } else {
        setSession(result.accessToken!, result.csrfToken ?? null);
        router.push('/encounter');
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
      router.push('/encounter');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex h-[7px] w-14 overflow-hidden rounded-sm">
          <div className="flex-1 bg-ink" />
          <div className="flex-1 bg-critical" />
          <div className="flex-1 bg-good" />
        </div>

        <p className="eyebrow mb-1">Republic of Kenya</p>
        <h1 className="mb-6 font-serif text-3xl font-medium tracking-tight">
          National Health Portal
        </h1>

        {reason === 'mfa' && (
          <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-3 py-2.5 text-sm text-caution">
            Your session was restored, but clinical access needs your second
            factor again. Signing in confirms it is still you at this device.
          </p>
        )}

        <div className="rounded-lg border border-rule bg-surface p-6">
          {stage === 'CREDENTIALS' ? (
            <form onSubmit={submitCredentials}>
              <h2 className="mb-4 text-base font-semibold">Sign in</h2>

              <label htmlFor="phone" className="eyebrow mb-1.5 block">
                Phone number
              </label>
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
                className="mb-4 w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5
                           text-base placeholder:text-ink-faint focus:border-gov focus:outline-none"
              />

              <label htmlFor="password" className="eyebrow mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-5 w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5
                           text-base focus:border-gov focus:outline-none"
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-gov px-4 py-2.5 font-semibold text-surface
                           disabled:opacity-60"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitMfa}>
              <h2 className="mb-1 text-base font-semibold">Second factor</h2>
              <p className="mb-4 text-sm text-ink-soft">
                Clinical accounts reach identifiable health data, so a second
                factor is required.{' '}
                {mfaMode === 'SMS' ? (
                  <>
                    We sent a code to{' '}
                    <span className="font-mono text-ink">{sentTo}</span>.
                  </>
                ) : (
                  'Enter the six-digit code from your authenticator app.'
                )}
              </p>

              <label htmlFor="code" className="eyebrow mb-1.5 block">
                Authentication code
              </label>
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
                className="mb-5 w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5
                           text-center font-mono text-2xl tracking-[0.4em]
                           placeholder:text-ink-faint focus:border-gov focus:outline-none"
              />

              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full rounded-md bg-gov px-4 py-2.5 font-semibold text-surface
                           disabled:opacity-60"
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>

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
                      // Once only: each resend invalidates the previous
                      // code, so repeated taps just confuse the clinician.
                      setResent(true);
                      setCode('');
                    } catch (err) {
                      setError(
                        err instanceof ApiError ? err.message : 'Could not resend',
                      );
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

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2
                         text-sm text-critical"
            >
              {error}
            </p>
          )}
        </div>

        <p className="mt-4 text-micro text-ink-faint">
          Every sign-in is recorded. Access to a patient record is logged and
          shown to that patient.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
