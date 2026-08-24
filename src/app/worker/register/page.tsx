'use client';

import { useState } from 'react';
import Link from 'next/link';
import { register, ApiError } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { PortalShell, Field, inputClass, SubmitButton, ErrorNote } from '@/components/PortalShell';
import {
  PersonFields,
  emptyPerson,
  localProblems,
  type PersonFormState,
} from '@/components/PersonFields';

/**
 * Health worker registration.
 *
 * The brief: doctors and nurses self-register with their regulator
 * credentials, and are tied to the facilities they work at.
 *
 * Registering is NOT being able to work. A clinician leaves this screen with
 * an identity and a licence on file, and no affiliation — so no check-in, so
 * no patient record. That is deliberate, and this screen says so plainly
 * rather than letting someone discover it at a patient's bedside.
 *
 * Who grants the affiliation depends on who owns the facility, and the
 * server enforces it in both directions: the Ministry posts staff to public
 * facilities, private facilities engage their own. A private employer
 * cannot post someone to a county hospital, and the Ministry cannot staff a
 * private clinic.
 */

/** The regulator that licenses each cadre. */
const CADRES: Array<{ value: string; label: string; regulator: string }> = [
  { value: 'DOCTOR', label: 'Doctor', regulator: 'KMPDC' },
  { value: 'DENTIST', label: 'Dentist', regulator: 'KMPDC' },
  { value: 'CLINICAL_OFFICER', label: 'Clinical officer', regulator: 'COC' },
  { value: 'NURSE', label: 'Nurse', regulator: 'NCK' },
  { value: 'MIDWIFE', label: 'Midwife', regulator: 'NCK' },
  { value: 'PHARMACIST', label: 'Pharmacist', regulator: 'PPB' },
  { value: 'LAB_TECH', label: 'Laboratory technologist', regulator: 'KMLTTB' },
  { value: 'RADIOGRAPHER', label: 'Radiographer', regulator: 'KMLTTB' },
  { value: 'NUTRITIONIST', label: 'Nutritionist', regulator: 'KNDI' },
  { value: 'PSYCHOLOGIST', label: 'Psychologist', regulator: 'KMPDC' },
  { value: 'CHW', label: 'Community health worker', regulator: 'COC' },
];

export default function WorkerRegisterPage() {
  const [person, setPerson] = useState<PersonFormState>(emptyPerson);
  const [cadre, setCadre] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    nhpId: string;
    message: string;
    clinicalLogin: string;
    loginNote: string;
  } | null>(null);

  const regulator = CADRES.find((c) => c.value === cadre)?.regulator;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = localProblems(person);
    if (problem) {
      setError(problem);
      return;
    }
    if (!cadre) {
      setError('Select your cadre');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const result = await register.practitioner({
        nationalId: person.nationalId,
        phone: person.phone,
        email: person.email || undefined,
        givenName: person.givenName,
        middleName: person.middleName || undefined,
        familyName: person.familyName,
        sexAtBirth: person.sexAtBirth as 'MALE' | 'FEMALE' | 'INTERSEX',
        dateOfBirth: person.dateOfBirth,
        countyId: person.countyId,
        subcountyId: person.subcountyId,
        password: person.password,
        photo: person.photo ?? undefined,
        cadre,
        licenceNumber,
        regulator,
      });
      setDone({
        nhpId: result.nhpId,
        message: result.message,
        clinicalLogin: result.clinicalLogin,
        loginNote: result.loginNote,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PortalShell portalName={PORTALS.worker.name} title="Registration received" wide>
        <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-4 py-3 text-sm text-caution">
          {/* The server's own wording. This screen must never imply that
              registering is enough to open a patient record. */}
          {done.message}
        </p>

        <p className="eyebrow mb-1.5">What happens next</p>
        <ul className="mb-5 space-y-2 text-sm text-ink-soft">
          <li>
            <span className="font-semibold text-ink">If you work at a private facility</span>{' '}
            — a mission hospital, an NGO clinic, or a private practice — that
            facility engages you directly. Ask its administrator to add you
            from their facility portal.
          </li>
          <li>
            <span className="font-semibold text-ink">If you work at a public facility</span>{' '}
            — a county or national hospital, a public health centre or
            dispensary — the Ministry of Health posts you. A private employer
            cannot assign you to a public facility.
          </li>
        </ul>

        <p className="mb-5 text-sm text-ink-soft">
          You can sign in now, but you will not be able to record clinical data
          until your affiliation is granted.
        </p>

        {/* The most important thing on this screen. A clinician who takes
            their phone number to the worker portal signs in as a PATIENT,
            lands on the citizen record, and concludes the system is broken. */}
        <p className="mb-4 rounded-md border border-gov/40 bg-surface-alt px-4 py-3">
          <span className="eyebrow mb-1 block">Sign in with this</span>
          <span className="font-mono text-lg font-semibold">{done.clinicalLogin}</span>
          <span className="mt-1 block text-micro text-ink-soft">{done.loginNote}</span>
        </p>

        <p className="mb-5 rounded-md border border-rule bg-surface-alt px-4 py-3">
          <span className="eyebrow mb-1 block">Your NHP number</span>
          <span className="font-mono text-lg font-semibold">{done.nhpId}</span>
          <span className="mt-1 block text-micro text-ink-faint">
            Your own patient record, found by your phone number.
          </span>
        </p>

        <Link
          href={PORTALS.worker.signInPath}
          className="block w-full rounded-md bg-gov px-4 py-2.5 text-center font-semibold text-surface"
        >
          Sign in
        </Link>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      portalName={PORTALS.worker.name}
      title="Register as a health worker"
      wide
      intro={
        <p className="mb-4 max-w-prose text-sm text-ink-soft">
          Your licence is checked against your regulator. Registering creates
          your professional identity — a facility affiliation, which is what
          lets you record clinical data, is granted separately.
        </p>
      }
    >
      <form onSubmit={submit}>
        <p className="eyebrow mb-3">Professional registration</p>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="cadre" label="Cadre">
            <select
              id="cadre"
              required
              value={cadre}
              onChange={(e) => setCadre(e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {CADRES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="licenceNumber"
            label="Licence number"
            hint={
              regulator
                ? `As issued by ${regulator}.`
                : 'Select your cadre to see which regulator issues it.'
            }
          >
            <input
              id="licenceNumber"
              required
              value={licenceNumber}
              onChange={(e) => setLicenceNumber(e.target.value)}
              placeholder={regulator ? `${regulator}/2026/0000` : ''}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>

        <hr className="my-5 border-rule" />
        <p className="eyebrow mb-3">Your identity</p>
        <p className="mb-4 max-w-prose text-micro text-ink-faint">
          A clinician is a person first. These details create your own health
          record too, so that if you are ever treated you are the same person
          in the system, not a second one.
        </p>

        <PersonFields value={person} onChange={setPerson} />

        <SubmitButton busy={busy}>
          {busy ? 'Registering…' : 'Register'}
        </SubmitButton>

        <ErrorNote message={error} />

        <p className="mt-4 text-center text-sm text-ink-soft">
          Already registered?{' '}
          <Link href={PORTALS.worker.signInPath} className="font-semibold text-gov underline">
            Sign in
          </Link>
        </p>
      </form>
    </PortalShell>
  );
}
