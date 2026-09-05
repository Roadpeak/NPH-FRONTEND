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

  // Ownership evidence, asked for only of a non-public facility. Reference
  // numbers rather than uploaded documents: the Ministry checks these
  // against the Business Registry, KRA and its own register, which proves
  // more than a scan anyone could produce.
  const [businessRegNo, setBusinessRegNo] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [practiceLicenceNo, setPracticeLicenceNo] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerNationalId, setOwnerNationalId] = useState('');
  const [adminLicenceNumber, setAdminLicenceNumber] = useState('');
  /*
   * The FACILITY's contact details, not the registrant's.
   *
   * A registrar has to be able to ask about the ownership evidence before
   * approving, and a referral has to reach the place it names. Neither is
   * served by the personal number of whoever filled this form in.
   */
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  /** How precise the browser said the fix was, in metres. */
  const [accuracy, setAccuracy] = useState<number | null>(null);

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

  /*
   * Fill the coordinates from the device.
   *
   * Typing a decimal coordinate by hand is how a facility ends up in the
   * wrong county, or in the sea — and this form already says the point of
   * these numbers is that a patient sent here can reach the place.
   *
   * Deliberately a button rather than something that fires on load. A
   * silent location prompt on a registration form is both alarming and
   * useless: whoever fills this in is not always standing at the facility,
   * so the value has to be offered, not assumed.
   */
  function useMyLocation() {
    setLocateError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('This browser cannot detect location. Enter the coordinates by hand.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;

        /*
         * Same bounding box the API enforces, checked here so the refusal
         * arrives with the reason attached rather than as a rejected
         * submission ten fields later. It also catches the common case of
         * registering a Kenyan facility from somewhere else entirely.
         */
        const inKenya = lat >= -5.0 && lat <= 5.5 && lng >= 33.5 && lng <= 42.0;
        if (!inKenya) {
          setLocating(false);
          setLocateError(
            'That location is outside Kenya, so it is not where the facility is. ' +
              'Enter the coordinates by hand.',
          );
          return;
        }

        // Six decimals is roughly 0.1 m — well past what any phone GPS
        // knows, and enough that the number does not imply false precision.
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setAccuracy(Math.round(acc));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        // Named causes, because "could not get location" leaves somebody
        // tapping a button that will never work.
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was refused. Allow it in your browser, or enter the coordinates by hand.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'No location fix available — indoors or without GPS this often fails. Enter the coordinates by hand.'
              : 'Locating took too long. Try again, or enter the coordinates by hand.',
        );
      },
      // A facility is a fixed point, so a cached fix from the last few
      // minutes is as good as a new one and much faster.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  }

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
        phone: phone || undefined,
        email: email || undefined,
        // Sent only when they apply. A public facility that carried these
        // would be asserting an ownership it does not have.
        ...(chosen && !chosen.isPublic
          ? {
              businessRegNo,
              kraPin: kraPin || undefined,
              practiceLicenceNo: practiceLicenceNo || undefined,
              ownerName: ownerName || undefined,
              ownerNationalId: ownerNationalId || undefined,
              adminLicenceNumber: adminLicenceNumber || undefined,
            }
          : {}),
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

        {chosen && !chosen.isPublic && (
          /*
           * Proving the facility is real and legally allowed to operate.
           *
           * Reference numbers, not uploads. A registrar checks each of
           * these against the register that issued it, which is a stronger
           * check than any document a portal could accept — and it means
           * nobody has to store scans of somebody's identity papers.
           */
          <fieldset className="mb-5 rounded-lg border border-rule bg-surface-alt p-4">
            <legend className="px-1.5 text-sm font-semibold">
              Ownership and legality
            </legend>

            {/* Promoted from a micro-hint under a field nobody reads. A
                facility is not an account: you sign in as YOURSELF, a
                registered practitioner. Somebody who reaches the end of
                this form still looking for a password has been failed by
                the form, not by their own reading. */}
            <p className="mb-3 rounded-md border border-caution/40 bg-caution-soft px-3 py-2.5 text-sm text-caution">
              <span className="font-semibold">
                You need a health worker account before you can run a facility.
              </span>{' '}
              A facility has no password of its own — you sign in as yourself,
              with the licence number and password from your health worker
              registration.{' '}
              <Link href={PORTALS.worker.registerPath} className="underline">
                Register as a health worker
              </Link>{' '}
              first if you have not already, then come back and give that
              licence number below.
            </p>
            <p className="mb-3 text-micro text-ink-soft">
              The Ministry checks these against the Business Registry, KRA and
              its own register before approving. Give the numbers as they
              appear on the certificates — no documents are uploaded.
            </p>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field id="businessRegNo" label="Business registration number">
                <input
                  id="businessRegNo"
                  required
                  value={businessRegNo}
                  onChange={(e) => setBusinessRegNo(e.target.value.toUpperCase())}
                  placeholder="PVT-ABC1234"
                  autoComplete="off"
                  className={`${inputClass} font-mono`}
                />
              </Field>

              <Field id="kraPin" label="KRA PIN">
                <input
                  id="kraPin"
                  value={kraPin}
                  onChange={(e) => setKraPin(e.target.value.toUpperCase())}
                  placeholder="P051234567X"
                  autoComplete="off"
                  className={`${inputClass} font-mono`}
                />
              </Field>

              <Field
                id="practiceLicenceNo"
                label="Practice licence number (optional)"
              >
                <input
                  id="practiceLicenceNo"
                  value={practiceLicenceNo}
                  onChange={(e) => setPracticeLicenceNo(e.target.value.toUpperCase())}
                  autoComplete="off"
                  className={`${inputClass} font-mono`}
                />
              </Field>

              <Field id="ownerName" label="Owner's full name">
                <input
                  id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field id="ownerNationalId" label="Owner's National ID">
              <input
                id="ownerNationalId"
                inputMode="numeric"
                value={ownerNationalId}
                onChange={(e) => setOwnerNationalId(e.target.value.replace(/\D/g, ''))}
                maxLength={12}
                autoComplete="off"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <p className="-mt-2 mb-4 text-micro text-ink-faint">
              Stored encrypted and read only by the registrar checking it. It
              is never shown back on this portal.
            </p>

            <Field
              id="adminLicenceNumber"
              label="Your licence number, to administer this facility"
            >
              <input
                id="adminLicenceNumber"
                /* Required. Without it the facility registers with no
                   pending administrator, and approval then creates a
                   facility nobody can administer — silently, with no route
                   to fix it from any screen. */
                required
                value={adminLicenceNumber}
                onChange={(e) => setAdminLicenceNumber(e.target.value.toUpperCase())}
                placeholder="KMPDC/2026/H001"
                autoComplete="off"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <p className="-mt-2 text-micro text-ink-faint">
              {/* Says plainly why this is asked for and when it takes
                  effect. Nobody administers a facility the Ministry has
                  not yet verified. */}
              Whoever registers a private facility runs it. Register on the
              health worker portal first, then give that licence number here —
              you become the administrator once the Ministry approves the
              facility, not before.
            </p>
          </fieldset>
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

        {/* The facility's own contact details. A registrar has to be able to
            ask about the ownership evidence before approving, and a referral
            has to reach the place it names — neither is served by the
            personal number of whoever filled this form in. */}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            id="phone"
            label="Facility phone number"
            hint="The facility's own line, not your personal number."
          >
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              className={inputClass}
            />
          </Field>

          <Field id="email" label="Facility email" hint="Optional.">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="rounded-md border border-gov px-3 py-1.5 text-sm font-semibold text-gov disabled:opacity-60"
          >
            {locating ? 'Locating…' : 'Use my current location'}
          </button>
          {accuracy !== null && !locateError && (
            /* State the accuracy rather than implying the fix is exact. A
               reading good to 800 m is fine for a dispensary and useless
               for telling two clinics on one street apart, and only the
               person registering it can judge which they have. */
            <span className="text-micro text-ink-soft">
              Filled from this device · accurate to about {accuracy} m. Correct it
              if the facility is elsewhere.
            </span>
          )}
        </div>

        {locateError && (
          <p className="mb-3 rounded-md border border-caution/40 bg-caution-soft px-3 py-2 text-micro text-caution">
            {locateError}
          </p>
        )}

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
          <Link
            href={PORTALS.facility.signInPath}
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-gov underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </PortalShell>
  );
}
