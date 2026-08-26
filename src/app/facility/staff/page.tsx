'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { facility, hasSession, restoreSession, ApiError, type StaffRow } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { FacilityNav } from '@/components/FacilityNav';
import { Icon } from '@/components/icons';
import { Field, inputClass } from '@/components/PortalShell';

/**
 * The roster.
 *
 * The ownership rule shapes this whole screen. A private facility engages
 * its own clinicians and so gets a form to add them; a public one receives
 * staff posted by the Ministry and so gets an explanation instead of a
 * form that would only ever be refused.
 *
 * People are added by licence number, not by name. The licence is what the
 * regulator issued and what the server verifies — a name is ambiguous in a
 * country with common names, and picking the wrong Amina Wanjiru from a
 * list would give a stranger access to patient records.
 */

const ROLES = [
  { value: 'ATTENDING', label: 'Attending', hint: 'Sees patients here regularly.' },
  { value: 'RESIDENT', label: 'Resident', hint: 'In training at this facility.' },
  { value: 'VISITING', label: 'Visiting', hint: 'Attends on particular days.' },
  { value: 'LOCUM', label: 'Locum', hint: 'Covering a post temporarily.' },
  {
    value: 'FACILITY_ADMIN',
    label: 'Administrator',
    hint: 'Can add and remove staff, and see this screen.',
  },
];

function roleLabel(role: string) {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [facilityName, setFacilityName] = useState('');
  const [licence, setLicence] = useState('');
  const [role, setRole] = useState('ATTENDING');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await facility.staff();
    setStaff(r.staff);
    setIsPublic(r.isPublic);
    setFacilityName(r.facilityName);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.facility.signInPath);
          return;
        }
        if (!cancelled) await load();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.facility.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load the roster');
        setStaff([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const added = await facility.addStaff(licence.trim(), role);
      setNotice(`${added.displayName} added as ${roleLabel(role).toLowerCase()}.`);
      setLicence('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that person');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: StaffRow) {
    setError(null);
    setNotice(null);
    try {
      await facility.removeStaff(row.affiliationId);
      setNotice(`${row.displayName} no longer works here.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not end that affiliation');
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      <FacilityNav />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">Staff</h1>
        <p className="mb-6 text-sm text-ink-soft">
          {facilityName ? `Everyone working at ${facilityName}.` : 'Everyone working here.'}
        </p>

        {isPublic ? (
          /*
           * A public facility does not engage its own staff, so it gets an
           * explanation rather than a form. Showing the form and refusing
           * the submission would teach the rule by failure.
           */
          <div className="mb-8 flex items-start gap-3 rounded-lg border border-gov/30 bg-gov-soft px-4 py-3">
            <Icon name="facility" size={18} className="mt-0.5 shrink-0 text-gov" />
            <p className="text-sm text-ink">
              <span className="font-semibold">
                The Ministry posts staff to public facilities.
              </span>{' '}
              To have someone assigned here, or moved, ask your county health
              office to raise a posting.
            </p>
          </div>
        ) : (
          <form
            onSubmit={add}
            className="mb-8 rounded-lg border border-rule bg-surface p-4 sm:p-5"
          >
            <h2 className="mb-3 font-semibold">Add someone</h2>

            <div className="sm:flex sm:gap-4">
              <div className="sm:flex-1">
                <Field id="licence" label="Licence number">
                  <input
                    id="licence"
                    value={licence}
                    onChange={(e) => setLicence(e.target.value.toUpperCase())}
                    placeholder="KMPDC/2026/H001"
                    autoComplete="off"
                    required
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
              <div className="sm:w-56">
                <Field id="role" label="Role here">
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inputClass}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <p className="mb-3 text-micro text-ink-faint">
              {ROLES.find((r) => r.value === role)?.hint}{' '}
              {/* Said once, plainly. Someone who has not registered cannot be
                  added, and the refusal alone would not explain why. */}
              They must have registered on the health worker portal first.
            </p>

            <button
              type="submit"
              disabled={busy || !licence.trim()}
              className="inline-flex min-h-[44px] items-center rounded-md bg-gov px-5 font-semibold text-white disabled:opacity-60"
            >
              <Icon name="clinician" size={16} className="mr-2" />
              {busy ? 'Adding…' : 'Add to this facility'}
            </button>
          </form>
        )}

        {notice && (
          <p role="status" className="mb-4 text-sm text-good">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-sm text-critical">
            {error}
          </p>
        )}

        {staff === null && <p className="text-sm text-ink-soft">Loading…</p>}

        <ul className="space-y-2">
          {staff?.map((s) => (
            <li
              key={s.affiliationId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface p-3 sm:flex-nowrap sm:p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {s.displayName}
                  {s.onDuty && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-micro font-semibold text-good">
                      <span className="h-1.5 w-1.5 rounded-full bg-good" />
                      On duty
                    </span>
                  )}
                </p>
                <p className="truncate text-micro text-ink-soft">
                  {roleLabel(s.role)} · {s.cadre.replace(/_/g, ' ').toLowerCase()}
                  {/* Reception holds no licence, and blank here is correct
                      rather than missing data. */}
                  {s.licenceNumber ? (
                    <> · <span className="font-mono">{s.licenceNumber}</span></>
                  ) : (
                    <> · no licence held</>
                  )}
                </p>
                <p className="text-micro text-ink-faint">
                  {/* Where this affiliation came from — the ownership rule,
                      visible on every row rather than only in a refusal. */}
                  {s.grantedByKind === 'MINISTRY'
                    ? 'Posted by the Ministry'
                    : 'Engaged by this facility'}{' '}
                  · since {new Date(s.startedAt).toLocaleDateString()}
                </p>
              </div>

              {s.licenceStatus && s.licenceStatus !== 'ACTIVE' && (
                <span className="rounded bg-caution-soft px-2 py-1 text-micro font-semibold text-caution">
                  Licence {s.licenceStatus.toLowerCase()}
                </span>
              )}

              {!isPublic && (
                <button
                  onClick={() => remove(s)}
                  className="min-h-[36px] whitespace-nowrap rounded border border-rule px-2.5 text-micro text-ink-soft hover:border-critical hover:text-critical"
                >
                  No longer works here
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
