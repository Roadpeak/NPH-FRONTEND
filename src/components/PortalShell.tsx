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
    <main className="flex min-h-screen items-start justify-center px-4 py-10 sm:py-14">
      <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
        <FlagBar />

        <p className="eyebrow mb-1 mt-6">Republic of Kenya · {portalName}</p>
        <h1 className="mb-6 font-serif text-3xl font-medium tracking-tight">
          National Health Portal
        </h1>

        {intro}

        <div className="rounded-lg border border-rule bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold">{title}</h2>
          {children}
        </div>

        <p className="mt-4 text-micro text-ink-faint">
          Every sign-in is recorded. Access to a patient record is logged and
          shown to that patient.
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
