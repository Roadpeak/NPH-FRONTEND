'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  facility,
  hasSession,
  restoreSession,
  ApiError,
  type FacilityProfile,
  type DirectorRow,
  type StaffAccountRow,
} from '@/lib/api';
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

  /*
   * Who runs this facility.
   *
   * A facility with one director stops working the day that person leaves.
   * Naming a second is what makes it survivable — and why the facility
   * itself needs no password, which could not be revoked for one person
   * and would make every action attributable to a building.
   */
  const [directors, setDirectors] = useState<DirectorRow[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  /*
   * Reception staff — the people who work the desk.
   *
   * Separate from directors because they are a different job with a
   * different reach: they see the waiting room and nothing else.
   */
  const [staff, setStaff] = useState<StaffAccountRow[]>([]);
  const [staffName, setStaffName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  async function loadStaff() {
    try {
      const r = await facility.staffAccounts();
      setStaff(r.staff);
    } catch {
      setStaff([]);
    }
  }

  async function addStaff(event: React.FormEvent) {
    event.preventDefault();
    setStaffError(null);
    setStaffBusy(true);
    try {
      await facility.addStaffAccount({
        nationalId: staffId.trim(),
        name: staffName.trim(),
        phone: staffPhone.trim(),
        password: staffPassword || undefined,
      });
      setStaffName('');
      setStaffId('');
      setStaffPhone('');
      setStaffPassword('');
      await loadStaff();
    } catch (err) {
      setStaffError(err instanceof ApiError ? err.message : 'Could not add');
    } finally {
      setStaffBusy(false);
    }
  }

  async function loadDirectors() {
    try {
      const d = await facility.directors();
      setDirectors(d.directors);
    } catch {
      setDirectors([]);
    }
  }

  async function appoint(event: React.FormEvent) {
    event.preventDefault();
    setDirError(null);
    setBusy(true);
    try {
      await facility.addDirector(identifier.trim());
      setIdentifier('');
      await loadDirectors();
    } catch (err) {
      setDirError(err instanceof ApiError ? err.message : 'Could not appoint');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setDirError(null);
    try {
      await facility.removeDirector(id);
      await loadDirectors();
    } catch (err) {
      setDirError(err instanceof ApiError ? err.message : 'Could not remove');
    }
  }

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
        if (!cancelled) await loadDirectors();
        if (!cancelled) await loadStaff();
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
            <section className="mt-6">
              <h2 className="eyebrow mb-1">Who runs this facility</h2>
              <p className="mb-3 max-w-prose text-micro text-ink-soft">
                {/* States the reason, because "add another director" reads
                    like paperwork until you know what it prevents. */}
                A facility with one director stops working the day that person
                leaves. Name a second, and the clinic keeps running — with
                every action still recorded against a person, which a shared
                facility password could never do.
              </p>

              <ul className="mb-3 space-y-1.5">
                {directors.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded border border-rule bg-surface px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {d.displayName}
                      {d.isYou && (
                        <span className="ml-2 font-normal text-micro text-ink-faint">you</span>
                      )}
                    </span>
                    <span className="chip chip-good">{d.role}</span>
                    {!d.isYou && (
                      <button
                        type="button"
                        onClick={() => remove(d.id)}
                        className="text-micro text-ink-faint underline hover:text-critical"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
                {directors.length === 0 && (
                  <li className="text-sm text-ink-faint">No directors listed.</li>
                )}
              </ul>

              <form onSubmit={appoint} className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="eyebrow mb-0.5 block">
                    National ID or licence number
                  </span>
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="12345678"
                    className="w-full rounded border border-rule bg-surface px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || identifier.trim().length < 6}
                  className="rounded-md bg-gov px-3 py-1.5 text-sm font-semibold text-surface disabled:opacity-60"
                >
                  {busy ? 'Appointing…' : 'Appoint director'}
                </button>
              </form>
              <p className="mt-1 text-micro text-ink-faint">
                {/* No password is created here, and that is the point. */}
                They must already have an account — a director signs in as
                themselves, so nobody is issued a password by this screen.
              </p>

              {dirError && (
                <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-micro text-critical">
                  {dirError}
                </p>
              )}
            </section>

            <section className="mt-6">
              <h2 className="eyebrow mb-1">Reception staff</h2>
              <p className="mb-3 max-w-prose text-micro text-ink-soft">
                {/* States the reach, because "add staff" gives no clue what
                    they will be able to see. */}
                They register arrivals and see the waiting room. Not the staff
                roster, not this record, not who runs the facility.
              </p>

              <ul className="mb-3 space-y-1.5">
                {staff.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded border border-rule bg-surface px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {m.displayName}
                    </span>
                    {m.mustChangePassword && (
                      /* Visible on purpose: until they change it, the
                         password is one their employer chose and knows, and
                         anything done on the account is deniable. */
                      <span className="chip chip-caution">HAS NOT CHANGED PASSWORD</span>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await facility.removeStaffAccount(m.id);
                        await loadStaff();
                      }}
                      className="text-micro text-ink-faint underline hover:text-critical"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {staff.length === 0 && (
                  <li className="text-sm text-ink-faint">No reception staff yet.</li>
                )}
              </ul>

              <form onSubmit={addStaff} className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="eyebrow mb-0.5 block">Full name</span>
                  <input
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full rounded border border-rule bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-0.5 block">National ID</span>
                  <input
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="w-full rounded border border-rule bg-surface px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-0.5 block">Phone number</span>
                  <input
                    type="tel"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="07XX XXX XXX"
                    className="w-full rounded border border-rule bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-0.5 block">First password</span>
                  <input
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    className="w-full rounded border border-rule bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={staffBusy || !staffName.trim() || !staffId.trim()}
                    className="rounded-md bg-gov px-3 py-1.5 text-sm font-semibold text-surface disabled:opacity-60"
                  >
                    {staffBusy ? 'Adding…' : 'Add reception staff'}
                  </button>
                </div>
              </form>
              <p className="mt-1 max-w-prose text-micro text-ink-faint">
                {/* The honest statement of what this costs, where the person
                    doing it will read it. */}
                You choose their first password, so you will know it — ask them
                to change it as soon as they sign in. Somebody who already has
                an account keeps their own password and simply gains the desk.
              </p>

              {staffError && (
                <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-micro text-critical">
                  {staffError}
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
