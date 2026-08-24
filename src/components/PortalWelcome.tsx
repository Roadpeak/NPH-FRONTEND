import Link from 'next/link';
import Image from 'next/image';
import type { Portal } from '@/lib/portals';

/**
 * The welcome page every portal opens on.
 *
 * Follows the structure Kenyans already know from portal.sha.go.ke — the
 * Coat of Arms and wordmark in a thin top bar, a two-column body with
 * "Welcome to …" set large on the right between vertical rules, actions
 * beneath it, and a quiet centred footer. Familiarity is the point: someone
 * who has used SHA should not have to work out whether this is the real
 * government site.
 *
 * What differs per portal is only the NAME under "Welcome to". Four front
 * doors, one institution.
 */

export function CoatOfArms({ size = 44 }: { size?: number }) {
  return (
    <Image
      src="/img/coat-of-arms.png"
      alt="Coat of Arms of the Republic of Kenya"
      width={size}
      height={size}
      className="h-auto w-auto"
      style={{ maxHeight: size }}
      priority
    />
  );
}

/** The top bar: identity on the left, how to get help on the right. */
export function PortalHeader({ portal }: { portal: Portal }) {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <CoatOfArms />
          {/* The flag bar separates the arms from the wordmark, the way SHA
              separates its arms from its logotype. */}
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
              {portal.name}
            </span>
          </span>
        </Link>

        {/* Padded to a real tap target: a 20px-tall link is a link a thumb
            misses, and 147 is the number someone reaches for when the
            portal has already failed them. */}
        <div className="flex items-center gap-1 text-sm">
          {/* 147 is the real Kenyan health helpline. A portal with no way to
              reach a person is one people abandon at the first problem. */}
          <a
            href="tel:147"
            className="-my-2 inline-flex min-h-[44px] items-center px-3 font-semibold text-gov"
          >
            147
          </a>
          <a
            href="mailto:help@nhp.health.go.ke"
            className="-my-2 hidden min-h-[44px] items-center px-3 text-ink-soft hover:text-gov sm:inline-flex"
          >
            help@nhp.health.go.ke
          </a>
        </div>
      </div>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-5 text-center sm:px-6">
        <p className="text-micro text-ink-faint">
          Ministry of Health · Republic of Kenya. Every sign-in is recorded.
          Access to a patient record is logged and shown to that patient.
        </p>
      </div>
    </footer>
  );
}

/**
 * The welcome screen itself.
 *
 * `lead` is the portal's own name — "Citizen Portal", "Health Workers
 * Portal" — set large beneath "Welcome to NHP", because the person arriving
 * needs to know in one glance whether they are at the right door.
 */
export function PortalWelcome({
  portal,
  blurb,
  blurbSw,
  primary,
  secondary,
}: {
  portal: Portal;
  blurb: string;
  blurbSw: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken">
      <PortalHeader portal={portal} />

      <main className="flex-1">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
          {/* --- the promise, left --- */}
          <div>
            <p className="eyebrow mb-3">Republic of Kenya · Ministry of Health</p>
            <h2 className="mb-4 max-w-prose font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              One health record that follows the person, not the building.
            </h2>
            <p className="mb-2 max-w-prose text-ink-soft">{blurb}</p>
            <p className="max-w-prose text-sm text-ink-faint">{blurbSw}</p>
          </div>

          {/* --- the welcome, right --- */}
          <div className="lg:pl-10">
            {/* The vertical rules above and below the wordmark are SHA's
                device: they frame the name without boxing it in. Centred on
                the block they belong to, not on the column. */}
            <div className="flex flex-col items-center">
              <div className="h-14 w-px bg-rule" aria-hidden="true" />

              <p className="mt-6 text-center font-serif text-3xl font-normal leading-none tracking-tight text-gov sm:text-4xl">
                Welcome to NHP
              </p>
              <p className="mt-2 text-center font-serif text-4xl font-semibold leading-tight tracking-tight text-gov sm:text-5xl">
                {portal.welcomeName}
              </p>

              <div className="mt-6 h-14 w-px bg-rule" aria-hidden="true" />
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href={primary.href}
                className="rounded-md bg-gov px-6 py-3 font-semibold text-surface"
              >
                {primary.label}
              </Link>
              {secondary && (
                <Link
                  href={secondary.href}
                  className="rounded-md border border-gov px-6 py-3 font-semibold text-gov"
                >
                  {secondary.label}
                </Link>
              )}
            </div>

            {!secondary && (
              /* The Ministry portal has no second action, and silence there
                 would read as a missing button. */
              <p className="mt-3 text-center text-micro text-ink-faint">
                Ministry accounts are issued by the Ministry of Health.
              </p>
            )}
          </div>
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}
