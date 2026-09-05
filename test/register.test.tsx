/**
 * REGISTRATION.
 *
 * These forms are the only unauthenticated write surface in the system, and
 * the only screens a person meets before they have any account at all. Two
 * properties matter more than the fields rendering:
 *
 *   1. They must never imply a capability the account does not have. A
 *      clinician who registers cannot yet open a patient record, and a
 *      facility that registers cannot yet host one. Both screens have to say
 *      so, because the alternative is discovering it at a bedside.
 *
 *   2. They must never leak the password — not into the DOM, not into a
 *      query string, not back from the server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const registerStub = {
  citizen: vi.fn(),
  practitioner: vi.fn(),
  facility: vi.fn(),
};
const geoStub = {
  counties: vi.fn(async () => [{ id: 'c1', code: '042', name: 'Kisumu' }]),
  subcounties: vi.fn(async () => [{ id: 's1', name: 'Kisumu Central', kind: 'HEALTH_ADMIN' }]),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, register: registerStub, geo: geoStub };
});

const { default: CitizenRegister } = await import('@/app/citizen/register/page');
const { default: WorkerRegister } = await import('@/app/worker/register/page');
const { default: FacilityRegister } = await import('@/app/facility/register/page');

beforeEach(() => {
  registerStub.citizen.mockResolvedValue({ nhpId: 'NHP-AB12-CD34', message: 'ok' });
  registerStub.practitioner.mockResolvedValue({
    nhpId: 'NHP-EF56-GH78',
    practitionerId: 'p1',
    licenceNumber: 'NCK/2026/0038',
    clinicalLogin: 'NCK/2026/0038',
    verification: {},
    message:
      'Registration received. You cannot record clinical data until a facility affiliation is granted.',
    loginNote:
      'Sign in to the health workers portal with your LICENCE NUMBER, not your phone.',
  });
  registerStub.facility.mockResolvedValue({
    facilityId: 'f1',
    mflCode: 'MFL-12345',
    registrationStatus: 'PENDING',
    message:
      'Facility registered and awaiting Ministry approval. Staff cannot be affiliated until it is approved.',
  });
});

afterEach(() => vi.clearAllMocks());

/** Fills the shared identity block. */
async function fillPerson(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), 'Wanjiku');
  await user.type(screen.getByLabelText(/family name/i), 'Kamau');
  await user.type(screen.getByLabelText(/national id/i), '12345678');
  await user.type(screen.getByLabelText(/date of birth/i), '1994-06-15');
  await user.selectOptions(screen.getByLabelText(/sex at birth/i), 'FEMALE');
  await waitFor(() => expect(screen.getByLabelText(/^county$/i)).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText(/^county$/i), 'c1');
  await waitFor(() =>
    expect(screen.getByLabelText(/subcounty/i)).not.toBeDisabled(),
  );
  await user.selectOptions(screen.getByLabelText(/subcounty/i), 's1');
  await user.type(screen.getByLabelText(/phone number/i), '0712345678');
  await user.type(screen.getByLabelText(/^password$/i), 'a-long-enough-password');
  await user.type(screen.getByLabelText(/confirm password/i), 'a-long-enough-password');
}

// =====================================================================

describe('citizen registration', () => {
  it('submits the identity the backend requires', async () => {
    const user = userEvent.setup();
    render(<CitizenRegister />);
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /create my record/i }));

    await waitFor(() => expect(registerStub.citizen).toHaveBeenCalled());
    expect(registerStub.citizen.mock.calls[0][0]).toMatchObject({
      nationalId: '12345678',
      phone: '0712345678',
      givenName: 'Wanjiku',
      familyName: 'Kamau',
      sexAtBirth: 'FEMALE',
      countyId: 'c1',
      subcountyId: 's1',
    });
  });

  it('shows the NHP number, because that is what a facility asks for', async () => {
    const user = userEvent.setup();
    render(<CitizenRegister />);
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /create my record/i }));

    await waitFor(() => expect(screen.getByText('NHP-AB12-CD34')).toBeInTheDocument());
  });

  it('refuses mismatched passwords without asking the server', async () => {
    const user = userEvent.setup();
    render(<CitizenRegister />);
    await fillPerson(user);
    await user.clear(screen.getByLabelText(/confirm password/i));
    await user.type(screen.getByLabelText(/confirm password/i), 'something-else-entirely');
    await user.click(screen.getByRole('button', { name: /create my record/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    // A round trip that could only ever fail is a round trip worth skipping.
    expect(registerStub.citizen).not.toHaveBeenCalled();
  });

  it('shows the server refusal in the server\'s own words', async () => {
    // "That National ID is already registered" tells someone exactly what to
    // do next; a paraphrased "registration failed" does not.
    const { ApiError } = await import('@/lib/api');
    registerStub.citizen.mockRejectedValue(
      new ApiError('That National ID is already registered', 400, 'IDENTIFIER_ALREADY_REGISTERED'),
    );

    const user = userEvent.setup();
    render(<CitizenRegister />);
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /create my record/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
  });

  it('states the age rule before anyone fills the form in', async () => {
    render(<CitizenRegister />);
    // Under-18s are registered by a guardian. Saying so up front beats a
    // rejection after a person has typed everything.
    expect(screen.getByText(/18 or over/i)).toBeInTheDocument();
  });

  it('never puts the password in the DOM as readable text', async () => {
    const user = userEvent.setup();
    const { container } = render(<CitizenRegister />);
    await fillPerson(user);

    // A `type="text"` password field would render the value into the
    // accessibility tree and any screen recording.
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
    expect(container.textContent).not.toContain('a-long-enough-password');
  });
});

describe('health worker registration', () => {
  it('sends the licence and cadre with the identity', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'NURSE');
    await user.type(screen.getByLabelText(/licence number/i), 'NCK/2026/0038');
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => expect(registerStub.practitioner).toHaveBeenCalled());
    expect(registerStub.practitioner.mock.calls[0][0]).toMatchObject({
      cadre: 'NURSE',
      licenceNumber: 'NCK/2026/0038',
      // Derived from the cadre, so a nurse cannot be filed under KMPDC.
      regulator: 'NCK',
    });
  });

  it('names the regulator for the chosen cadre', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'PHARMACIST');
    expect(screen.getByText(/as issued by PPB/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'DOCTOR');
    expect(screen.getByText(/as issued by KMPDC/i)).toBeInTheDocument();
  });

  it('THE CAPABILITY RULE — says registering is not permission to treat', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'NURSE');
    await user.type(screen.getByLabelText(/licence number/i), 'NCK/2026/0038');
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    // The server's own wording. A screen that congratulated the clinician
    // and stopped there would send them to a bedside expecting access.
    expect(await screen.findByText(/cannot record clinical data/i)).toBeInTheDocument();
  });

  it('THE OWNERSHIP RULE — explains both onboarding paths', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'NURSE');
    await user.type(screen.getByLabelText(/licence number/i), 'NCK/2026/0038');
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    // Private facilities engage their own staff; the Ministry posts to
    // public ones. A clinician who does not know which applies to them
    // cannot tell who to chase.
    await waitFor(() =>
      expect(screen.getByText(/If you work at a private facility/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/If you work at a public facility/i)).toBeInTheDocument();
    // Both halves of the rule, named: who engages you, and who posts you.
    expect(screen.getByText(/that facility engages you directly/i)).toBeInTheDocument();
    expect(screen.getByText(/the Ministry of Health posts you/i)).toBeInTheDocument();
  });
});

describe('facility registration', () => {
  async function fillFacility(user: ReturnType<typeof userEvent.setup>, ownership: string) {
    await user.type(screen.getByLabelText(/mfl code/i), 'MFL-12345');
    await user.type(screen.getByLabelText(/facility name/i), 'Migosi Health Centre');
    await user.selectOptions(screen.getByLabelText(/keph level/i), '3');
    await user.selectOptions(screen.getByLabelText(/ownership/i), ownership);
    await waitFor(() => expect(screen.getByLabelText(/^county$/i)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^county$/i), 'c1');
    await waitFor(() => expect(screen.getByLabelText(/subcounty/i)).not.toBeDisabled());
    await user.selectOptions(screen.getByLabelText(/subcounty/i), 's1');
    await user.type(screen.getByLabelText(/latitude/i), '-0.0917');
    await user.type(screen.getByLabelText(/longitude/i), '34.768');

    // The facility's own line. A registrar has to be able to ask about the
    // ownership evidence before approving.
    await user.type(screen.getByLabelText(/facility phone number/i), '0733111222');

    // A non-public facility must assert its own legality; the Ministry
    // checks the number against the Business Registry before approving.
    if (ownership !== 'PUBLIC_MOH' && ownership !== 'PUBLIC_OTHER') {
      await user.type(
        screen.getByLabelText(/business registration number/i),
        'PVT-ABC1234',
      );
      // Required: without it, approval creates a facility nobody can
      // administer, silently and with no route to fix it.
      await user.type(
        screen.getByLabelText(/your licence number/i),
        'KMPDC/2026/H001',
      );
    }
  }

  /** Fills every required field EXCEPT the one named, to prove it is required. */
  async function fillFacilityWithout(
    user: ReturnType<typeof userEvent.setup>,
    ownership: string,
    skip: RegExp,
  ) {
    const maybe = async (label: RegExp, value: string) => {
      if (skip.source === label.source) return;
      await user.type(screen.getByLabelText(label), value);
    };
    await maybe(/mfl code/i, 'MFL-12345');
    await maybe(/facility name/i, 'Migosi Health Centre');
    await user.selectOptions(screen.getByLabelText(/keph level/i), '3');
    await user.selectOptions(screen.getByLabelText(/ownership/i), ownership);
    await waitFor(() => expect(screen.getByLabelText(/^county$/i)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/^county$/i), 'c1');
    await waitFor(() => expect(screen.getByLabelText(/subcounty/i)).not.toBeDisabled());
    await user.selectOptions(screen.getByLabelText(/subcounty/i), 's1');
    await maybe(/latitude/i, '-0.0917');
    await maybe(/longitude/i, '34.768');
    await maybe(/facility phone number/i, '0733111222');
    if (ownership !== 'PUBLIC_MOH' && ownership !== 'PUBLIC_OTHER') {
      await maybe(/business registration number/i, 'PVT-ABC1234');
      await maybe(/your licence number/i, 'KMPDC/2026/H001');
    }
  }

  it('asks a non-public facility to prove it is a legal entity', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await user.selectOptions(screen.getByLabelText(/ownership/i), 'PRIVATE_FOR_PROFIT');

    expect(
      screen.getByLabelText(/business registration number/i),
    ).toBeInTheDocument();
  });

  it('asks a public facility for no ownership evidence at all', async () => {
    // The Ministry stands behind its own facilities. Asking a dispensary
    // to prove it is registered with the Business Registry is meaningless.
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await user.selectOptions(screen.getByLabelText(/ownership/i), 'PUBLIC_MOH');

    expect(
      screen.queryByLabelText(/business registration number/i),
    ).not.toBeInTheDocument();
  });

  it('sends the ownership evidence with a private registration', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await fillFacility(user, 'PRIVATE_FOR_PROFIT');
    await user.click(screen.getByRole('button', { name: /register facility/i }));

    await waitFor(() => expect(registerStub.facility).toHaveBeenCalled());
    expect(registerStub.facility.mock.calls[0][0]).toMatchObject({
      businessRegNo: 'PVT-ABC1234',
    });
  });

  it('submits the facility with its KEPH level and coordinates', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await fillFacility(user, 'PRIVATE_FOR_PROFIT');
    await user.click(screen.getByRole('button', { name: /register facility/i }));

    await waitFor(() => expect(registerStub.facility).toHaveBeenCalled());
    expect(registerStub.facility.mock.calls[0][0]).toMatchObject({
      mflCode: 'MFL-12345',
      kephLevel: 3,
      ownership: 'PRIVATE_FOR_PROFIT',
      latitude: -0.0917,
      longitude: 34.768,
    });
  });

  it('THE OWNERSHIP RULE — warns a public facility it cannot staff itself', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await user.selectOptions(screen.getByLabelText(/ownership/i), 'PUBLIC_MOH');

    // Stated at the point of choosing, because it governs every future hire
    // and the server refuses the alternative outright.
    expect(screen.getByText(/Ministry posts staff to public facilities/i)).toBeInTheDocument();
  });

  it('tells a private facility it engages its own clinicians', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await user.selectOptions(screen.getByLabelText(/ownership/i), 'FAITH_BASED');

    expect(screen.getByText(/you engage your own clinicians/i)).toBeInTheDocument();
  });

  it('does not offer KEPH level 1', async () => {
    render(<FacilityRegister />);
    // Level 1 is community units, which have no facility. Offering it would
    // produce a rejection the form could have prevented.
    const options = Array.from(
      screen.getByLabelText(/keph level/i).querySelectorAll('option'),
    ).map((o) => o.textContent);
    expect(options.some((o) => o?.includes('Level 1'))).toBe(false);
    expect(options.some((o) => o?.includes('Level 2'))).toBe(true);
  });

  it('shows PENDING, never implying the facility is live', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await fillFacility(user, 'PRIVATE_FOR_PROFIT');
    await user.click(screen.getByRole('button', { name: /register facility/i }));

    // An unapproved facility can grant no affiliation and host no check-in.
    await waitFor(() =>
      expect(screen.getByText(/awaiting Ministry approval/i)).toBeInTheDocument(),
    );
  });

  it('will not submit a private facility without an administrator licence', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await fillFacilityWithout(user, 'PRIVATE_FOR_PROFIT', /your licence number/i);
    await user.click(screen.getByRole('button', { name: /register/i }));

    // Without it the facility registers with no pending administrator, and
    // approval then creates a facility nobody can administer — silently,
    // with no route to fix it from any screen.
    expect(registerStub.facility).not.toHaveBeenCalled();
  });

  it('will not submit any facility without a contact number', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await fillFacilityWithout(user, 'PUBLIC_MOH', /facility phone number/i);
    await user.click(screen.getByRole('button', { name: /register/i }));

    // A registrar with no way to reach the facility cannot ask about the
    // ownership evidence they are meant to be checking.
    expect(registerStub.facility).not.toHaveBeenCalled();
  });

  it('tells a registrant they need a health worker account first', async () => {
    const user = userEvent.setup();
    render(<FacilityRegister />);
    await user.selectOptions(screen.getByLabelText(/ownership/i), 'PRIVATE_FOR_PROFIT');

    // This used to be the faintest text on the page, under a field most
    // people skip — so somebody could reach the end still looking for a
    // password field that was never going to exist.
    expect(
      screen.getByText(/need a health worker account before you can run a facility/i),
    ).toBeInTheDocument();
  });

  /**
   * AUTO-DETECTING THE FACILITY'S LOCATION.
   *
   * Typing a decimal coordinate by hand is how a facility ends up in the
   * wrong county, or in the sea. The button fills both fields from the
   * device — but it is offered, never automatic, because whoever registers
   * a facility is not always standing in it.
   */
  describe('use my current location', () => {
    const withGeolocation = (impl: Partial<Geolocation>) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: impl,
        configurable: true,
      });
    };

    afterEach(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        configurable: true,
      });
    });

    it('fills both coordinates from the device', async () => {
      withGeolocation({
        getCurrentPosition: (ok) =>
          ok({
            coords: { latitude: -1.2795, longitude: 36.8305, accuracy: 12 },
          } as GeolocationPosition),
      });
      const user = userEvent.setup();
      render(<FacilityRegister />);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/latitude/i)).toHaveValue(-1.2795),
      );
      expect(screen.getByLabelText(/longitude/i)).toHaveValue(36.8305);
    });

    it('states the accuracy rather than implying the fix is exact', async () => {
      withGeolocation({
        getCurrentPosition: (ok) =>
          ok({
            coords: { latitude: -1.2795, longitude: 36.8305, accuracy: 850 },
          } as GeolocationPosition),
      });
      const user = userEvent.setup();
      render(<FacilityRegister />);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      // 850 m is fine for a rural dispensary and useless for telling two
      // clinics on one street apart. Only the registrant can judge which.
      await waitFor(() => expect(screen.getByText(/about 850 m/i)).toBeInTheDocument());
    });

    it('REFUSES A LOCATION OUTSIDE KENYA rather than filling it in', async () => {
      withGeolocation({
        getCurrentPosition: (ok) =>
          ok({
            coords: { latitude: 51.5072, longitude: -0.1276, accuracy: 20 },
          } as GeolocationPosition),
      });
      const user = userEvent.setup();
      render(<FacilityRegister />);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      // Registering a Kenyan facility from another country is the common
      // case, and silently writing London into the form would place a
      // facility somewhere no patient can be routed to.
      await waitFor(() => expect(screen.getByText(/outside Kenya/i)).toBeInTheDocument());
      expect(screen.getByLabelText(/latitude/i)).toHaveValue(null);
    });

    it('names the reason when permission is refused', async () => {
      withGeolocation({
        getCurrentPosition: (_ok, fail) =>
          fail?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      });
      const user = userEvent.setup();
      render(<FacilityRegister />);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      // "Could not get location" leaves somebody tapping a button that will
      // never work.
      await waitFor(() =>
        expect(screen.getByText(/permission was refused/i)).toBeInTheDocument(),
      );
    });

    it('says so when the browser cannot do it at all', async () => {
      const user = userEvent.setup();
      render(<FacilityRegister />);

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      await waitFor(() =>
        expect(screen.getByText(/cannot detect location/i)).toBeInTheDocument(),
      );
    });
  });
});

describe('what a clinician signs in with', () => {
  /**
   * THE REGRESSION, on the screen where it bit. Registration creates TWO
   * accounts for one human being: a citizen account on their phone, and a
   * clinical account on their licence number. A clinician who takes their
   * phone to the worker portal signs in as a PATIENT, lands on the citizen
   * record, and concludes the system is broken.
   */
  it('shows the licence number as the clinical login', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'NURSE');
    await user.type(screen.getByLabelText(/licence number/i), 'NCK/2026/0038');
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(await screen.findByText(/sign in with this/i)).toBeInTheDocument();
    expect(screen.getByText(/not your phone/i)).toBeInTheDocument();
  });

  it('distinguishes the clinical login from their own patient record', async () => {
    const user = userEvent.setup();
    render(<WorkerRegister />);

    await user.selectOptions(screen.getByLabelText(/cadre/i), 'NURSE');
    await user.type(screen.getByLabelText(/licence number/i), 'NCK/2026/0038');
    await fillPerson(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    // Both are shown, each labelled with what it is for. Showing only the
    // NHP number is what left a clinician with no way to sign in as one.
    expect(await screen.findByText('NHP-EF56-GH78')).toBeInTheDocument();
    expect(screen.getByText(/your own patient record/i)).toBeInTheDocument();
  });
});
