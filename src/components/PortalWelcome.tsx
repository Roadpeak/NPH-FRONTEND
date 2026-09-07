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
        {/*
          A blue hero, not a white page with blue text.
          
          The Ministry's own site leads with a solid band of its royal blue,
          and a portal that only uses that colour for links reads as a
          lookalike rather than part of the same estate. The photograph
          shares the band so the two carry the page together.
        */}
        <section className="bg-gov-bright text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
            {/* --- the promise, left --- */}
            <div>
              <p className="mb-3 font-mono text-label uppercase tracking-[0.12em] text-white/70">
                Republic of Kenya · Ministry of Health
              </p>
              <p className="font-serif text-2xl font-normal leading-none tracking-tight text-white/80">
                Welcome to NHP
              </p>
              <h2 className="mt-1 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {portal.welcomeName}
              </h2>

              <p className="mt-5 max-w-prose text-lg leading-relaxed text-white/90">{blurb}</p>
              <p className="mt-2 max-w-prose text-sm text-white/65">{blurbSw}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                {/* White on blue, so the primary action is the brightest
                    thing in the band rather than competing with it. */}
                <Link
                  href={primary.href}
                  className="inline-flex min-h-11 items-center rounded-md bg-white px-6 font-semibold text-gov-bright transition-colors hover:bg-white/90"
                >
                  {primary.label}
                </Link>
                {secondary && (
                  <Link
                    href={secondary.href}
                    className="inline-flex min-h-11 items-center rounded-md border border-white/45 px-6 font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    {secondary.label}
                  </Link>
                )}
              </div>

              {!secondary && (
                /* The Ministry portal has no second action, and silence
                   there would read as a missing button. */
                <p className="mt-3 text-micro text-white/65">
                  Ministry accounts are issued by the Ministry of Health.
                </p>
              )}
            </div>

            {/* --- the photograph, right --- */}
            {!portal.image && (
              /*
                The Ministry portal carries no photograph — its door opens
                on national statistics, and a stock clinical image would
                misdescribe what is behind it. So the space says what the
                portal is for instead of sitting empty.
              */
              <ul className="hidden gap-x-8 gap-y-5 lg:grid lg:grid-cols-2 lg:pl-6">
                {[
                  ['Disease burden', 'By county and sub-county, with the reporting completeness that qualifies it'],
                  ['Referral closure', 'Whether a referred patient arrived, and whether an outcome came back'],
                  ['Workforce', 'Derived from who actually checked in, not from an establishment list'],
                  ['Outbreak signals', 'Raised automatically when a notifiable condition is recorded'],
                ].map(([title, detail]) => (
                  <li key={title}>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-0.5 text-sm leading-snug text-white/70">{detail}</p>
                  </li>
                ))}
              </ul>
            )}

            {portal.image && (
              <div className="relative hidden h-[380px] overflow-hidden rounded-xl lg:block">
                {/*
                  `object-cover` because the three portraits are a 4:3, a
                  square and a tall portrait — a fixed box crops each to the
                  same band rather than letting one dictate the layout.
                */}
                <Image
                  src={portal.image}
                  alt=""
                  fill
                  sizes="(min-width:1024px) 50vw, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
            )}
          </div>
        </section>

        {/* The line the whole system rests on, given its own quiet band
            beneath the hero rather than competing inside it. */}
        <div className="border-b border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <p className="max-w-prose font-serif text-xl font-medium leading-snug tracking-tight sm:text-2xl">
              One health record that follows the person, not the building.
            </p>
          </div>
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}
