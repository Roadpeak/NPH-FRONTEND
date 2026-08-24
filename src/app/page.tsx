import Link from 'next/link';
import { FlagBar } from '@/components/PortalShell';

export const metadata = {
  title: 'National Health Portal',
};

/**
 * The public landing page.
 *
 * Deliberately NOT an account-type chooser. Each portal has its own address,
 * its own sign-in and its own registration, and people arrive at the one
 * that belongs to them — a nurse follows the link her facility gave her, a
 * citizen follows the one on a poster or an SMS. Asking "what kind of
 * account do you have?" at the door is a question only someone who already
 * knows the system can answer.
 *
 * So this page tells the public what NHP is and offers the citizen path,
 * which is the only one a member of the public would arrive here looking
 * for. The three staff portals are addressed directly and listed at the
 * foot as plain addresses, for someone who was given one and mistyped it.
 */
export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
      <FlagBar />

      <p className="eyebrow mb-2 mt-6">Republic of Kenya</p>
      <h1 className="mb-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
        National Health Portal
      </h1>
      <p className="mb-10 max-w-prose text-lg text-ink-soft">
        One health record that follows the person, not the building.
        <span className="mt-1 block text-base text-ink-faint">
          Rekodi moja ya afya inayomfuata mtu, si jengo.
        </span>
      </p>

      <div className="mb-10 rounded-lg border border-rule bg-surface p-6">
        <h2 className="mb-2 font-serif text-2xl font-medium">Your health record</h2>
        <p className="mb-1 max-w-prose text-sm text-ink-soft">
          See your visits, your medicines, and every person who has opened
          your record. Any facility in Kenya can find it with your National ID.
        </p>
        <p className="mb-5 max-w-prose text-sm text-ink-faint">
          Ona matembezi yako, dawa zako, na kila mtu aliyefungua rekodi yako.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/citizen/login"
            className="rounded-md bg-gov px-5 py-2.5 font-semibold text-surface"
          >
            Sign in
          </Link>
          <Link href="/citizen/register" className="font-semibold text-gov underline">
            Create your record
          </Link>
        </div>
      </div>

      {/* Addresses, not a chooser. Someone who belongs in a staff portal was
          given its link; this is only here so a mistyped one is recoverable. */}
      <h2 className="eyebrow mb-3">Staff portals</h2>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-md border border-rule bg-surface-alt px-4 py-3">
          <Link href="/worker/login" className="font-semibold text-gov">
            Health workers
          </Link>
          <p className="font-mono text-micro text-ink-faint">/worker</p>
        </li>
        <li className="rounded-md border border-rule bg-surface-alt px-4 py-3">
          <Link href="/facility/login" className="font-semibold text-gov">
            Health facilities
          </Link>
          <p className="font-mono text-micro text-ink-faint">/facility</p>
        </li>
        <li className="rounded-md border border-rule bg-surface-alt px-4 py-3">
          <Link href="/ministry/login" className="font-semibold text-gov">
            Ministry of Health
          </Link>
          <p className="font-mono text-micro text-ink-faint">/ministry</p>
        </li>
      </ul>

      <p className="mt-8 max-w-prose text-micro text-ink-faint">
        Every sign-in is recorded. Access to a patient record is logged and
        shown to that patient.
      </p>
    </main>
  );
}
