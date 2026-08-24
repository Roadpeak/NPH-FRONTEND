'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { nhp, auth, setSession, type CheckInSession } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { Icon, type IconName } from './icons';

/**
 * The health worker portal's navigation.
 *
 * The portal had exactly one reachable page. A clinician signed in and
 * landed on the encounter screen with no way to find a patient, check in,
 * see their own profile, or sign out — every other screen existed and
 * nothing linked to it.
 *
 * The check-in state lives here rather than on one screen, because it
 * governs every clinical action in the portal: a clinician needs to see
 * at a glance whether they can write, from wherever they are.
 */

const LINKS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/worker/patients', label: 'Find a patient', icon: 'search' },
  { href: '/encounter', label: 'Consultation', icon: 'diagnosis' },
  { href: '/worker/shift', label: 'My shift', icon: 'facility' },
  { href: '/worker/profile', label: 'My profile', icon: 'clinician' },
];

export function WorkerNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession_] = useState<CheckInSession | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    nhp
      .currentSession()
      .then((s) => !cancelled && setSession_(s))
      .catch(() => !cancelled && setSession_(null));
    auth
      .me()
      .then((m) => {
        if (cancelled) return;
        setName(
          m.displayName
            ? `${m.cadre === 'DOCTOR' || m.cadre === 'DENTIST' ? 'Dr ' : ''}${m.displayName}`
            : null,
        );
      })
      .catch(() => !cancelled && setName(null));
    return () => {
      cancelled = true;
    };
    // Re-read on navigation: checking in on one screen must show as checked
    // in on the next.
  }, [pathname]);

  async function signOut() {
    try {
      await auth.logout();
    } catch {
      // A failed logout call must still clear the local session, or someone
      // on a shared desktop walks away believing they signed out.
    }
    setSession(null, null);
    router.replace(PORTALS.worker.signInPath);
  }

  return (
    <nav className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2 sm:px-6">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`inline-flex min-h-[40px] items-center rounded px-3 text-sm ${
                active ? 'bg-gov-soft font-semibold text-gov' : 'text-ink-soft hover:bg-surface-alt'
              }`}
            >
              <Icon name={l.icon} size={14} className="mr-1.5" />
              {l.label}
            </Link>
          );
        })}

        <div className="ml-auto flex items-center gap-3">
          {/*
            The check-in state, everywhere. It governs every clinical action
            in the portal, and a clinician who does not know they are
            checked out discovers it mid-consultation.
          */}
          {session ? (
            <span className="inline-flex items-center gap-1.5 text-micro text-good">
              <span className="h-2 w-2 rounded-full bg-good" />
              <span className="hidden sm:inline">{session.facilityName}</span>
              <span className="sm:hidden">Checked in</span>
            </span>
          ) : (
            <Link
              href="/worker/shift"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded border border-caution/40 bg-caution-soft px-2.5 text-micro font-semibold text-caution"
            >
              <Icon name="pending" size={13} />
              Not checked in
            </Link>
          )}

          {name && <span className="hidden text-micro text-ink-faint lg:inline">{name}</span>}

          <button
            onClick={signOut}
            className="inline-flex min-h-[36px] items-center rounded px-2.5 text-micro text-ink-soft hover:text-gov"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
