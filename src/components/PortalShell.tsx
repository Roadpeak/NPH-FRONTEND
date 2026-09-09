
/**
 * The frame every portal page sits in.
 *
 * Four portals, one visual system. The flag bar, the wordmark and the
 * wordmark is constant, because a citizen and a Ministry
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
          {/* The coat of arms and flag stripe are removed for now — this
              deployment is not yet entitled to present itself as a
              government service. The wordmark stands on its own. */}
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-1 flex-col overflow-hidden rounded-sm bg-gov-bright" aria-hidden="true" />
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

        {/* The helpline number and the .go.ke address went with the rest of
            the branding — 147 is Kenya's real health helpline and .go.ke is
            a government domain. A portal with no way to reach a person is
            one people abandon at the first problem, so an address stays. */}
        <p className="mt-4 text-center text-micro text-ink-faint">
          <a
            href="mailto:support@example.org"
            className="inline-flex min-h-[44px] items-center px-1 font-semibold text-gov-bright"
          >
            Get help
          </a>{' '}
          · Every sign-in is recorded.
        </p>
      </div>
    </main>
  );
}

/**
 * One labelled field.
 *
 * `size` sets how wide the input may grow. A form of identically full-width
 * boxes tells a clerk nothing, and at desktop width an eight-character MFL
 * code was given the same 590px as a facility name — so the eye has to read
 * every label to know what is wanted. Sizing to the expected input is an
 * ordinary government-forms convention and it is the difference between
 * scanning a form and reading it.
 *
 * The width is applied to a wrapper rather than the input, so a field can
 * sit in a two-column grid and still be narrow within its column.
 */
export function Field({
  id,
  label,
  hint,
  size = 'full',
  className = '',
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  /** code: an MFL number or licence. short: a date, phone or coordinate. */
  size?: 'full' | 'short' | 'code';
  className?: string;
  children: React.ReactNode;
}) {
  const width =
    size === 'code' ? 'max-w-[16rem]' : size === 'short' ? 'max-w-[20rem]' : '';
  /*
   * Fields space themselves by default.
   *
   * Inside a FormGrid the grid owns the gap, and a margin on top of it
   * would double the spacing — so a grid passes `className="mb-0"`, which
   * lands after this and wins.
   */
  /*
   * `flex-col` with the hint last and `mt-auto` on nothing in particular:
   * the input sits directly under its label, and a hint under one field in
   * a two-column row no longer pushes the next ROW down — it grows into the
   * cell's own space instead. Rows stayed aligned before only by accident,
   * because no field in a pair had a hint.
   */
  return (
    <div className={`mb-4 flex flex-col ${className}`}>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <div className={width}>{children}</div>
      {hint && <p className="mt-1 text-micro text-ink-faint">{hint}</p>}
    </div>
  );
}

/**
 * The one input style, so a field looks identical in all four portals.
 *
 * min-h-11 is 44px. Below that a control is unreliable for a nurse wearing
 * gloves or a receptionist working fast on a shared terminal, and most of
 * this site's inputs were shorter than that before it was set here.
 */
export const inputClass =
  'min-h-11 w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5 text-base ' +
  'placeholder:text-ink-faint focus:border-gov focus:outline-none';

/** A code or number. Monospaced, so digits line up and a typo is visible. */
export const codeInputClass = `${inputClass} font-mono tabular-nums tracking-[0.04em]`;

/**
 * Two columns from `sm` up, one below.
 *
 * Long forms were a single column at every width, so registering a facility
 * meant scrolling a wall of boxes. Fields that need the full width opt out
 * with `sm:col-span-2`.
 */
export function FormGrid({ children }: { children: React.ReactNode }) {
  // `[&>*]:mb-0` strips the Field default margin: the grid gap owns the
  // spacing here, and both together would leave the rows drifting apart.
  return (
    <div className="mb-4 grid items-start gap-x-5 gap-y-4 sm:grid-cols-2 [&>*]:mb-0">{children}</div>
  );
}

/** A titled group of fields, so a long form reads as a few short ones. */
export function FieldSet({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-7">
      <legend className="mb-1 font-serif text-lg font-medium">{legend}</legend>
      {hint && <p className="mb-3 text-sm text-ink-soft">{hint}</p>}
      {children}
    </fieldset>
  );
}

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
      className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-gov px-5 font-semibold text-surface transition-colors hover:bg-gov/90 disabled:cursor-not-allowed disabled:opacity-60"
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

/**
 * "What you do here is recorded."
 *
 * Stated the same way on every screen that writes to a national health
 * record. It appeared on the sign-in page and nowhere else, which made it
 * read as a one-off reassurance rather than a standing fact about the
 * system.
 */
export function RecordedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-2 font-mono text-micro text-ink-faint">
      <span aria-hidden="true">&#9679;</span>
      <span>{children}</span>
    </p>
  );
}
