'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { register, geo, ApiError, type CountyOption, type SubcountyOption } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { PortalShell, Field, inputClass, SubmitButton, ErrorNote } from '@/components/PortalShell';

/**
 * Facility registration.
 *
 * A facility registers itself with its Kenya Master Health Facility List
 * code and stays PENDING until a Ministry registrar approves it. Until then
 * it can grant no affiliation and host no check-in, so it cannot reach a
 * patient record — the approval is a gate, not a formality.
 *
 * Ownership is the most consequential field on this form, because it decides
 * who may staff the facility for the rest of its life: private facilities
 * engage their own clinicians, public facilities are staffed by the Ministry.
 * The server enforces that in both directions, so this screen states the
 * consequence at the point of choosing rather than leaving it to be
 * discovered later.
 */

const KEPH_LEVELS = [
  { value: 2, label: 'Level 2 — Dispensary' },
  { value: 3, label: 'Level 3 — Health centre' },
  { value: 4, label: 'Level 4 — Primary hospital' },
  { value: 5, label: 'Level 5 — County referral hospital' },
  { value: 6, label: 'Level 6 — National referral hospital' },
];

const OWNERSHIP = [
  { value: 'PUBLIC_MOH', label: 'Public — Ministry of Health', isPublic: true },
  { value: 'PUBLIC_OTHER', label: 'Public — other government', isPublic: true },
  { value: 'PRIVATE_FOR_PROFIT', label: 'Private', isPublic: false },
  { value: 'FAITH_BASED', label: 'Faith-based / mission', isPublic: false },
  { value: 'NGO', label: 'NGO', isPublic: false },
];

export default function FacilityRegisterPage() {
  const [mflCode, setMflCode] = useState('');
  const [name, setName] = useState('');
  const [kephLevel, setKephLevel] = useState('');
  const [ownership, setOwnership] = useState('');
  const [countyId, setCountyId] = useState('');
  const [subcountyId, setSubcountyId] = useState('');
  const [locality, setLocality] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [subcounties, setSubcounties] = useState<SubcountyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ mflCode: string; message: string } | null>(null);

  const chosen = OWNERSHIP.find((o) => o.value === ownership);

  useEffect(() => {
    geo.counties().then(setCounties).catch(() => setCounties([]));
  }, []);

  useEffect(() => {
    if (!countyId) {
      setSubcounties([]);
      return;
    }
    let cancelled = false;
    geo
      .subcounties(countyId)
      .then((s) => !cancelled && setSubcounties(s))
      .catch(() => !cancelled && setSubcounties([]));
    return () => {
      cancelled = true;
    };
  }, [countyId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await register.facility({
        mflCode,
        name,
        kephLevel: Number(kephLevel),
        ownership,
        countyId,
        subcountyId,
        locality: locality || undefined,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      setDone({ mflCode: result.mflCode, message: result.message });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PortalShell portalName={PORTALS.facility.name} title="Awaiting approval" wide>
        <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-4 py-3 text-sm text-caution">
          {done.message}
        </p>

        <p className="mb-5 rounded-md border border-rule bg-surface-alt px-4 py-3">
          <span className="eyebrow mb-1 block">MFL code</span>
          <span className="font-mono text-lg font-semibold">{done.mflCode}</span>
        </p>

        <p className="mb-5 max-w-prose text-sm text-ink-soft">
          A Ministry registrar reviews the facility against the Master Health
          Facility List. Until it is approved, no clinician can check in here
          and no patient record can be opened.
        </p>

        <Link
          href={PORTALS.facility.signInPath}
          className="block w-full rounded-md bg-gov px-4 py-2.5 text-center font-semibold text-surface"
        >
          Sign in
        </Link>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      portalName={PORTALS.facility.name}
      title="Register a health facility"
      wide
      intro={
        <p className="mb-4 max-w-prose text-sm text-ink-soft">
          Register your facility against its Master Health Facility List code.
          The Ministry approves it before any clinician can work here.
        </p>
      }
    >
      <form onSubmit={submit}>
        <Field
          id="mflCode"
          label="MFL code"
          hint="From the Kenya Master Health Facility List."
        >
          <input
            id="mflCode"
            required
            value={mflCode}
            onChange={(e) => setMflCode(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field id="name" label="Facility name">
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            id="kephLevel"
            label="KEPH level"
            hint="Level 1 is community units, which have no facility."
          >
            <select
              id="kephLevel"
              required
              value={kephLevel}
              onChange={(e) => setKephLevel(e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {KEPH_LEVELS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="ownership" label="Ownership">
            <select
              id="ownership"
              required
              value={ownership}
              onChange={(e) => setOwnership(e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {OWNERSHIP.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {chosen && (
          /* Stated at the point of choosing, because it cannot be changed
             casually afterwards and it governs every future hire. */
          <p className="mb-4 rounded-md border border-rule bg-surface-alt px-3 py-2.5 text-sm text-ink-soft">
            {chosen.isPublic ? (
              <>
                <span className="font-semibold text-ink">
                  The Ministry posts staff to public facilities.
                </span>{' '}
                You will not be able to add clinicians yourself — the Ministry
                assigns them, and a posting nobody authorised is exactly what
                that prevents.
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">
                  You engage your own clinicians.
                </span>{' '}
                Once approved, you can affiliate any registered health worker
                to this facility from your portal.
              </>
            )}
          </p>
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="countyId" label="County">
            <select
              id="countyId"
              required
              value={countyId}
              onChange={(e) => {
                setCountyId(e.target.value);
                setSubcountyId('');
              }}
              className={inputClass}
            >
              <option value="">Select…</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="subcountyId" label="Subcounty">
            <select
              id="subcountyId"
              required
              disabled={!countyId}
              value={subcountyId}
              onChange={(e) => setSubcountyId(e.target.value)}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="">{countyId ? 'Select…' : 'Choose a county first'}</option>
              {subcounties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          id="locality"
          label="Locality"
          hint="Optional. The town or estate, if the facility is known by it."
        >
          <input
            id="locality"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="latitude" label="Latitude">
            <input
              id="latitude"
              type="number"
              step="any"
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-0.0917"
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field id="longitude" label="Longitude">
            <input
              id="longitude"
              type="number"
              step="any"
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="34.7680"
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>

        <p className="mb-4 max-w-prose text-micro text-ink-faint">
          {/* Not decoration: these coordinates are what routes a patient here
              when the recommender is choosing a facility for them. */}
          Coordinates place the facility for care routing — a patient sent
          here has to be able to reach it.
        </p>

        <SubmitButton busy={busy}>
          {busy ? 'Registering…' : 'Register facility'}
        </SubmitButton>

        <ErrorNote message={error} />

        <p className="mt-4 text-center text-sm text-ink-soft">
          Already registered?{' '}
          <Link href={PORTALS.facility.signInPath} className="font-semibold text-gov underline">
            Sign in
          </Link>
        </p>
      </form>
    </PortalShell>
  );
}
