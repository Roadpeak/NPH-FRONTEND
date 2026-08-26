'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { facility, auth, setSession, type FacilityProfile } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { Icon, type IconName } from './icons';

/**
 * The facility portal's navigation.
 *
 * The reception desk comes first. It is the screen someone stands at all
 * day, while the roster and the facility record are visited occasionally —
 * ordering these by how a hospital actually runs rather than by hierarchy.
 *
 * The facility name and its approval state sit here rather than on one
 * screen, because a PENDING facility can do nothing at all: staff cannot
 * be added, arrivals cannot be registered, and someone who does not know
 * why will keep trying.
 */

const LINKS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/facility/reception', label: 'Reception', icon: 'citizen' },
  { href: '/facility/staff', label: 'Staff', icon: 'clinician' },
  { href: '/facility/profile', label: 'Facility', icon: 'facility' },
];

export function FacilityNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<FacilityProfile | null>(null);
  /*
   * Which facility the person is actually AT.
   *
   * `/facility/me` answers "which facility do you administer", and the
   * queue answers "which desk are you standing at". For someone who works
   * at two places those are different buildings, and showing one name
   * beside the other's queue is how an arrival ends up in the wrong
   * waiting room. The desk wins, because it is the one with people in it.
   */
  const [deskName, setDeskName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    facility
      .me()
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setProfile(null));
    facility
      .queue()
      .then((q) => !cancelled && setDeskName(q.facilityName))
      .catch(() => !cancelled && setDeskName(null));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /** The desk they are standing at, if the queue could name one. */
  const atDesk = deskName;

  async function signOut() {
    try {
      await auth.logout();
    } catch {
      // A failed logout must still clear the local session, or someone at a
      // shared reception terminal walks away believing they signed out.
    }
    setSession(null, null);
    router.replace(PORTALS.facility.signInPath);
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
            Both facilities, when they are different buildings.

            Reception is scoped to the desk they are checked in at; the
            roster is scoped to the facility they administer. Naming only
            one of them put "Kisumu County Referral" in the navigation
            above a roster headed "Milimani Family Clinic", which reads as
            a fault rather than as two true facts.
          */}
          <span className="hidden items-center gap-1.5 text-micro text-ink-faint md:inline-flex">
            {atDesk && (
              <>
                <Icon name="facility" size={13} />
                <span>
                  At <span className="text-ink-soft">{atDesk}</span>
                </span>
              </>
            )}
            {profile && atDesk !== profile.name && (
              <span>
                {atDesk && '· '}
                Runs <span className="text-ink-soft">{profile.name}</span>
                {' · '}Level {profile.kephLevel} · {profile.isPublic ? 'Public' : 'Private'}
              </span>
            )}
            {profile && atDesk === profile.name && (
              <span>
                · Level {profile.kephLevel} · {profile.isPublic ? 'Public' : 'Private'}
              </span>
            )}
          </span>

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
