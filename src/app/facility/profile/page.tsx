'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { facility, hasSession, restoreSession, ApiError, type FacilityProfile } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { FacilityNav } from '@/components/FacilityNav';
import { Icon } from '@/components/icons';

/**
 * The facility record.
 *
 * What the Ministry holds about this place, shown back to the people who
 * run it. Two things earn their space here:
 *
 *   - The approval state. A PENDING facility can do nothing — no staff, no
 *     arrivals, no clinical writes — and someone who does not know that
 *     will keep trying and conclude the portal is broken.
 *
 *   - The ownership evidence, shown back rather than hidden. These are the
 *     numbers a registrar checks against the Business Registry, KRA and
 *     the MOH register, and the facility should be able to see exactly
 *     what it asserted.
 */

const KEPH: Record<number, string> = {
  2: 'Dispensary',
  3: 'Health centre',
  4: 'Primary hospital',
  5: 'County referral hospital',
  6: 'National referral hospital',
};

const OWNERSHIP: Record<string, string> = {
  PUBLIC_MOH: 'Ministry of Health',
  PUBLIC_OTHER: 'Other public body',
  PRIVATE_FOR_PROFIT: 'Private',
  FAITH_BASED: 'Faith-based',
  NGO: 'Non-governmental organisation',
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap gap-x-4 border-b border-rule py-2.5 last:border-0">
      <dt className="w-full text-micro text-ink-soft sm:w-56">{label}</dt>
      <dd className="flex-1 text-sm">
        {/* An empty field is stated, not left blank — a blank row reads as
            a rendering fault rather than as "nothing was given". */}
        {value || <span className="text-ink-faint">Not given</span>}
      </dd>
    </div>
  );
}

export default function FacilityProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<FacilityProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.facility.signInPath);
          return;
        }
        const p = await facility.me();
        if (!cancelled) setProfile(p);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.facility.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load the facility');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-surface-sunken">
      <FacilityNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">
          {profile?.name ?? 'Facility'}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          What the Ministry holds about this facility.
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-critical">
            {error}
          </p>
        )}

        {profile && (
          <>
            <div
              className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${
                profile.registrationStatus === 'ACTIVE'
                  ? 'border-good/30 bg-good-soft'
                  : 'border-caution/40 bg-caution-soft'
              }`}
            >
              <Icon
                name={profile.registrationStatus === 'ACTIVE' ? 'verified' : 'pending'}
                size={18}
                className={`mt-0.5 shrink-0 ${
                  profile.registrationStatus === 'ACTIVE' ? 'text-good' : 'text-caution'
                }`}
              />
              <p className="text-sm text-ink">
                {profile.registrationStatus === 'ACTIVE' ? (
                  <>
                    <span className="font-semibold">Approved by the Ministry</span>
                    {profile.approvedAt &&
                      ` on ${new Date(profile.approvedAt).toLocaleDateString()}`}
                    . {profile.staffingRule}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">
                      Awaiting Ministry approval.
                    </span>{' '}
                    Your ownership details are being checked against national
                    records. Until that is done, no staff can be added and no
                    patient can be seen here.
                  </>
                )}
              </p>
            </div>

            <section className="mb-6 rounded-lg border border-rule bg-surface p-4 sm:p-5">
              <h2 className="mb-2 font-semibold">The facility</h2>
              <dl>
                <Row label="Master Facility List code" value={profile.mflCode} />
                <Row
                  label="KEPH level"
                  value={`Level ${profile.kephLevel} — ${KEPH[profile.kephLevel] ?? 'Facility'}`}
                />
                <Row
                  label="Ownership"
                  value={OWNERSHIP[profile.ownership] ?? profile.ownership}
                />
                <Row
                  label="Where"
                  value={`${profile.locality}, ${profile.subcountyName}, ${profile.countyName} County`}
                />
              </dl>
            </section>

            {/*
              Only a private facility asserts ownership. A public one is
              vouched for by the Ministry itself, and an empty "Ownership"
              panel on a dispensary would read as missing paperwork.
            */}
            {!profile.isPublic && (
              <section className="rounded-lg border border-rule bg-surface p-4 sm:p-5">
                <h2 className="mb-1 font-semibold">Ownership and legality</h2>
                <p className="mb-2 text-micro text-ink-soft">
                  Checked against the Business Registry, KRA and the Ministry
                  register before approval.
                </p>
                <dl>
                  <Row label="Business registration" value={profile.businessRegNo} />
                  <Row label="KRA PIN" value={profile.kraPin} />
                  <Row label="Practice licence" value={profile.practiceLicenceNo} />
                  <Row label="Owner" value={profile.ownerName} />
                  {/* The owner's National ID is deliberately not shown. It is
                      encrypted at rest and the people who need it are
                      registrars, not the facility reading its own record
                      back on a screen at a reception desk. */}
                </dl>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
