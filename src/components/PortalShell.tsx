import Image from 'next/image';

/**
 * The frame every portal page sits in.
 *
 * Four portals, one visual system. The flag bar, the wordmark and the
 * "Republic of Kenya" eyebrow are constant, because a citizen and a Ministry
 * analyst are looking at the same institution; only the portal name beneath
 * changes. Making each portal look like a different product would invite the
 * question of which one is the real government site.
 */

export function FlagBar() {
  return (
    <div className="flex h-[7px] w-14 overflow-hidden rounded-sm" aria-hidden="true">
      <div className="flex-1 bg-ink" />
      <div className="flex-1 bg-critical" />
      <div className="flex-1 bg-good" />
    </div>
  );
}

export function PortalShell({
  portalName,
  title,
  intro,
  children,
  wide = false,
}: {
  /** Which front door this is — shown above the wordmark, not instead of it. */
  portalName: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  /** Registration forms need more room than a sign-in card. */
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-10 sm:py-14">
      <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}>
        {/*
          A raised white card on a quiet ground, the way portal.sha.go.ke
          presents its sign-in: identity at the top of the card, the form
          beneath it, help outside. Generous radius and a very soft shadow —
          the card should sit on the page, not cut into it.
        */}
        <div className="rounded-2xl border border-rule bg-surface p-6 shadow-[0_0_23px_0_rgba(0,0,0,0.04)] sm:p-10">
          <div className="mb-6 flex items-center gap-3">
            <Image
              src="/img/coat-of-arms.png"
              alt="Coat of Arms of the Republic of Kenya"
              width={44}
              height={44}
              className="h-auto w-auto"
              style={{ maxHeight: 44 }}
              priority
            />
            <span className="flex h-10 w-1 flex-col overflow-hidden rounded-sm" aria-hidden="true">
              <span className="flex-1 bg-ink" />
              <span className="flex-1 bg-critical" />
              <span className="flex-1 bg-good" />
            </span>
            <span>
              <span className="block font-serif text-lg font-medium leading-tight tracking-tight">
                National Health Portal
              </span>
              <span className="block font-mono text-micro uppercase tracking-wider text-ink-faint">
                {portalName}
              </span>
            </span>
          </div>

          {intro}

          <h1 className="mb-5 font-serif text-2xl font-medium leading-snug tracking-tight">
            {title}
          </h1>
          {children}
        </div>

        <p className="mt-4 text-center text-micro text-ink-faint">
          Contact <a href="tel:147" className="font-semibold text-gov">147</a> or{' '}
          <a href="mailto:help@nhp.health.go.ke" className="font-semibold text-gov">
            help@nhp.health.go.ke
          </a>{' '}
          for help. Every sign-in is recorded.
        </p>
      </div>
    </main>
  );
}

/** The one input style, so a field looks identical in all four portals. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-micro text-ink-faint">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5 text-base ' +
  'placeholder:text-ink-faint focus:border-gov focus:outline-none';

export function SubmitButton({
  busy,
  children,
  disabled = false,
}: {
  busy: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full rounded-md bg-gov px-4 py-2.5 font-semibold text-surface disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical"
    >
      {message}
    </p>
  );
}
