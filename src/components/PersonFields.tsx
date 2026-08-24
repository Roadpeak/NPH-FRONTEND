'use client';

import { useEffect, useState } from 'react';
import { geo, type CountyOption, type SubcountyOption } from '@/lib/api';
import { Field, inputClass } from './PortalShell';
import { PhotoField } from './PhotoField';

/**
 * The identity a person registers with.
 *
 * Shared by the citizen and health-worker forms, because a clinician is a
 * person first — the identity and the professional registration are separate
 * records precisely so a doctor who is also a patient is one human being
 * with one health record.
 *
 * Every field here is required by the backend, so the form asks for exactly
 * what it needs and nothing more. A registration form that collects data it
 * has no use for is a data-protection liability, not thoroughness.
 */

export interface PersonFormState {
  nationalId: string;
  phone: string;
  email: string;
  givenName: string;
  middleName: string;
  familyName: string;
  sexAtBirth: 'MALE' | 'FEMALE' | 'INTERSEX' | '';
  dateOfBirth: string;
  countyId: string;
  subcountyId: string;
  password: string;
  confirmPassword: string;
  /** Base64 data URL, or null. Optional by design. */
  photo: string | null;
}

export const emptyPerson: PersonFormState = {
  nationalId: '',
  phone: '',
  email: '',
  givenName: '',
  middleName: '',
  familyName: '',
  sexAtBirth: '',
  dateOfBirth: '',
  countyId: '',
  subcountyId: '',
  password: '',
  confirmPassword: '',
  photo: null,
};

/** The server's floor. Stated here so the form can say so before submitting. */
export const PASSWORD_MIN = 12;

/**
 * What the form can check before asking the server.
 *
 * Deliberately does NOT duplicate the rules the backend owns — the age
 * limit, whether an ID is already registered, whether a licence is valid.
 * Those are the server's to enforce and its wording is what the user sees.
 * This only catches what would otherwise be a pointless round trip.
 */
export function localProblems(p: PersonFormState): string | null {
  if (p.password !== p.confirmPassword) return 'The two passwords do not match';
  if (p.password.length < PASSWORD_MIN) {
    return `Your password must be at least ${PASSWORD_MIN} characters`;
  }
  if (!p.sexAtBirth) return 'Select sex at birth';
  if (!p.countyId || !p.subcountyId) return 'Select your county and subcounty';
  return null;
}

export function PersonFields({
  value,
  onChange,
}: {
  value: PersonFormState;
  onChange: (next: PersonFormState) => void;
}) {
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [subcounties, setSubcounties] = useState<SubcountyOption[]>([]);
  const set = (patch: Partial<PersonFormState>) => onChange({ ...value, ...patch });

  useEffect(() => {
    geo.counties().then(setCounties).catch(() => setCounties([]));
  }, []);

  useEffect(() => {
    if (!value.countyId) {
      setSubcounties([]);
      return;
    }
    let cancelled = false;
    geo
      .subcounties(value.countyId)
      .then((s) => !cancelled && setSubcounties(s))
      .catch(() => !cancelled && setSubcounties([]));
    return () => {
      cancelled = true;
    };
  }, [value.countyId]);

  return (
    <>
      <PhotoField value={value.photo} onChange={(photo) => set({ photo })} />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field id="givenName" label="First name">
          <input
            id="givenName"
            autoComplete="given-name"
            required
            value={value.givenName}
            onChange={(e) => set({ givenName: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field id="familyName" label="Family name">
          <input
            id="familyName"
            autoComplete="family-name"
            required
            value={value.familyName}
            onChange={(e) => set({ familyName: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        id="middleName"
        label="Middle name"
        hint="Optional. Include it if it appears on your ID."
      >
        <input
          id="middleName"
          autoComplete="additional-name"
          value={value.middleName}
          onChange={(e) => set({ middleName: e.target.value })}
          className={inputClass}
        />
      </Field>

      <Field
        id="nationalId"
        label="National ID number"
        hint="This is how a facility finds your record. It is stored encrypted."
      >
        <input
          id="nationalId"
          inputMode="numeric"
          required
          value={value.nationalId}
          onChange={(e) => set({ nationalId: e.target.value })}
          className={`${inputClass} font-mono`}
        />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field id="dateOfBirth" label="Date of birth">
          <input
            id="dateOfBirth"
            type="date"
            required
            // Nobody can be born tomorrow. The server checks this too.
            max={new Date().toISOString().slice(0, 10)}
            value={value.dateOfBirth}
            onChange={(e) => set({ dateOfBirth: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field
          id="sexAtBirth"
          label="Sex at birth"
          hint="Recorded because it changes clinical reference ranges."
        >
          <select
            id="sexAtBirth"
            required
            value={value.sexAtBirth}
            onChange={(e) => set({ sexAtBirth: e.target.value as PersonFormState['sexAtBirth'] })}
            className={inputClass}
          >
            <option value="">Select…</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="INTERSEX">Intersex</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field id="countyId" label="County">
          <select
            id="countyId"
            required
            value={value.countyId}
            // Changing county invalidates the chosen subcounty, so clear it
            // rather than submitting a mismatched pair.
            onChange={(e) => set({ countyId: e.target.value, subcountyId: '' })}
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
            disabled={!value.countyId}
            value={value.subcountyId}
            onChange={(e) => set({ subcountyId: e.target.value })}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">{value.countyId ? 'Select…' : 'Choose a county first'}</option>
            {subcounties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id="phone"
        label="Phone number"
        hint="You sign in with this, and it receives your security codes."
      >
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="07XX XXX XXX"
          className={inputClass}
        />
      </Field>

      <Field id="email" label="Email address" hint="Optional.">
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          id="password"
          label="Password"
          hint={`At least ${PASSWORD_MIN} characters.`}
        >
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            value={value.password}
            onChange={(e) => set({ password: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field id="confirmPassword" label="Confirm password">
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={value.confirmPassword}
            onChange={(e) => set({ confirmPassword: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
    </>
  );
}
