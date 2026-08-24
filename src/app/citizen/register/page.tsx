'use client';

import { useState } from 'react';
import Link from 'next/link';
import { register, ApiError } from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { PortalShell, SubmitButton, ErrorNote } from '@/components/PortalShell';
import {
  PersonFields,
  emptyPerson,
  localProblems,
  type PersonFormState,
} from '@/components/PersonFields';

/**
 * Citizen registration.
 *
 * The brief's rule: a citizen registers uniquely with National ID and phone,
 * email optional, and sets their own password. Under-18s do not register
 * here — they are tied to a parent, and a facility finds them by searching
 * the guardian's ID. The server refuses an under-18 self-registration and
 * this screen shows that refusal in the server's own words rather than
 * pre-empting it with a different explanation.
 *
 * Registration does NOT sign anyone in. The client uses the normal sign-in
 * path afterwards, so there is exactly one way to obtain a session.
 */
export default function CitizenRegisterPage() {
  const [person, setPerson] = useState<PersonFormState>(emptyPerson);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ nhpId: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = localProblems(person);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const result = await register.citizen({
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
      });
      setDone({ nhpId: result.nhpId });
    } catch (err) {
      // The server's wording, not a paraphrase — "that National ID is
      // already registered" tells someone exactly what to do next.
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PortalShell portalName={PORTALS.citizen.name} title="You are registered">
        <p className="mb-4 text-sm text-ink-soft">
          Your health record has been created. This is your NHP number — a
          facility can find your record with it, or with your National ID.
        </p>

        <p className="mb-5 rounded-md border border-good/30 bg-good-soft px-4 py-3 text-center font-mono text-xl font-semibold text-good">
          {done.nhpId}
        </p>

        <Link
          href={PORTALS.citizen.signInPath}
          className="block w-full rounded-md bg-gov px-4 py-2.5 text-center font-semibold text-surface"
        >
          Sign in
        </Link>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      portalName={PORTALS.citizen.name}
      title="Create your health record"
      wide
      intro={
        <p className="mb-4 max-w-prose text-sm text-ink-soft">
          One record, for life, that follows you to any facility in Kenya. You
          must be 18 or over to register yourself — a child is registered by
          their parent or guardian.
        </p>
      }
    >
      <form onSubmit={submit}>
        <PersonFields value={person} onChange={setPerson} />

        <SubmitButton busy={busy}>
          {busy ? 'Creating your record…' : 'Create my record'}
        </SubmitButton>

        <ErrorNote message={error} />

        <p className="mt-4 text-center text-sm text-ink-soft">
          Already registered?{' '}
          <Link
            href={PORTALS.citizen.signInPath}
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-gov underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </PortalShell>
  );
}
