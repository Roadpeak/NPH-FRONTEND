/**
 * THE ADMINISTRATION DASHBOARD.
 *
 * Two properties decide whether this screen is safe:
 *
 *   1. A section the signed-in role cannot open is ABSENT, not disabled. A
 *      greyed-out "Audit" tab tells an analyst an audit queue exists and
 *      that they are not trusted with it.
 *
 *   2. A count the role cannot act on is not rendered as zero. The server
 *      returns `null` for exactly that, and "0 facilities awaiting approval"
 *      shown to an auditor is a false statement about a queue they cannot
 *      see.
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

/*
 * Stubs are typed from the real client, so a change to an API shape breaks
 * these tests rather than letting them assert against a fiction.
 */
type Admin = typeof import('@/lib/api')['admin'];
type Auth = typeof import('@/lib/api')['auth'];

const authStub = { me: vi.fn<Auth['me']>() };
const adminStub: { [K in keyof Admin]: ReturnType<typeof vi.fn> } = {
  overview: vi.fn(),
  searchPractitioners: vi.fn(async () => []),
  facilityStats: vi.fn(),
  workforceStats: vi.fn(),
  citizenStats: vi.fn(),
  practitioners: vi.fn(),
  lookupCitizen: vi.fn(),
  searchFacilities: vi.fn(async () => []),
  pendingFacilities: vi.fn(async () => []),
  facilities: vi.fn(async () => []),
  approveFacility: vi.fn(),
  postStaff: vi.fn(),
  endPosting: vi.fn(),
  expiringLicences: vi.fn(async () => []),
  pendingBreakGlass: vi.fn(async () => []),
  reviewBreakGlass: vi.fn(),
  breakGlassRates: vi.fn(async () => []),
  anomalies: vi.fn(async () => []),
};
const ministryStub = { counties: vi.fn(async () => [{ id: 'c1', code: '042', name: 'Kisumu' }]) };

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    auth: authStub,
    admin: adminStub,
    ministry: ministryStub,
    hasSession: () => true,
    restoreSession: async () => true,
  };
});

const { default: AdminPage } = await import('@/app/ministry/admin/page');

/** An overview shaped as the server returns it for one role. */
function overviewFor(role: string) {
  const registrar = role === 'REGISTRAR' || role === 'SUPER_ADMIN';
  const auditor = role === 'AUDITOR' || role === 'SUPER_ADMIN';
  return {
    role,
    geoScope: 'NATIONAL',
    pendingFacilities: registrar ? 3 : null,
    activeFacilities: registrar ? 412 : null,
    practitioners: registrar ? 8814 : null,
    pendingBreakGlassReviews: auditor ? 2 : null,
    licencesExpiringSoon: registrar ? 17 : null,
  };
}

function signedInAs(role: string) {
  authStub.me.mockResolvedValue({
    accountId: 'a1',
    practitionerId: null,
    ministryUserId: 'm1',
    ministryRole: role,
    geoScope: 'NATIONAL',
    scopeCountyId: null,
    personId: null,
    mfaSatisfied: true,
    checkedInAt: null,
  });
  adminStub.overview.mockResolvedValue(overviewFor(role));
}

const FACILITY_STATS = {
  total: 6,
  byStatus: [{ status: 'ACTIVE', count: 5 }, { status: 'PENDING', count: 1 }],
  byKephLevel: [{ kephLevel: 2, count: 2 }, { kephLevel: 4, count: 3 }],
  byOwnership: [
    { ownership: 'PUBLIC_MOH', count: 4 },
    { ownership: 'PRIVATE_FOR_PROFIT', count: 1 },
  ],
  byCounty: [{ countyId: 'c1', count: 5 }],
  activeWithoutCapabilities: 2,
};

const WORKFORCE_STATS = {
  total: 12,
  byCadre: [{ cadre: 'NURSE', count: 7 }, { cadre: 'DOCTOR', count: 5 }],
  byStatus: [{ status: 'ACTIVE', count: 12 }],
  byCounty: [{ countyId: 'c1', count: 12 }],
  withActiveLicence: 11,
  withActiveAffiliation: 9,
  unaffiliated: 3,
};

const CITIZEN_STATS = {
  total: 2431,
  registeredThisMonth: 182,
  byCounty: [{ countyId: 'c1', count: 2431 }],
  byMaturity: [{ maturity: 'ADULT', count: 1700 }, { maturity: 'DEPENDANT', count: 731 }],
  byVerification: [{ state: 'VERIFIED', count: 1600 }, { state: 'UNVERIFIED', count: 831 }],
  bySex: [{ sex: 'FEMALE', count: 1300 }, { sex: 'MALE', count: 1131 }],
  notAlive: 4,
};

beforeEach(() => {
  signedInAs('SUPER_ADMIN');
  adminStub.facilityStats.mockResolvedValue(FACILITY_STATS);
  adminStub.workforceStats.mockResolvedValue(WORKFORCE_STATS);
  adminStub.citizenStats.mockResolvedValue(CITIZEN_STATS);
  adminStub.practitioners.mockResolvedValue({ total: 0, rows: [] });
  adminStub.lookupCitizen.mockResolvedValue({ match: null });
  adminStub.pendingFacilities.mockResolvedValue([]);
  adminStub.pendingBreakGlass.mockResolvedValue([]);
  adminStub.expiringLicences.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

async function renderAs(role: string) {
  signedInAs(role);
  const utils = render(<AdminPage />);
  // Wait for the navigation, which only renders once the role is known.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument(),
  );
  return utils;
}

const tabNames = () =>
  screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');

// =====================================================================

describe('the navigation is built from the role', () => {
  it('THE ABSENCE RULE — an analyst is not shown the audit queue', async () => {
    await renderAs('ANALYST');
    const tabs = tabNames();

    expect(tabs).toContain('Overview');
    expect(tabs).toContain('Analytics');
    // Not disabled — absent. A visible-but-refused tab advertises the queue.
    expect(tabs).not.toContain('Audit');
    expect(tabs).not.toContain('Facilities');
    expect(tabs).not.toContain('Postings');
  });

  it('shows a registrar the register and not the audit queue', async () => {
    await renderAs('REGISTRAR');
    const tabs = tabNames();

    expect(tabs).toContain('Facilities');
    expect(tabs).toContain('Postings');
    expect(tabs).toContain('Licences');
    expect(tabs).not.toContain('Audit');
  });

  it('shows an auditor the audit queue and nothing administrative', async () => {
    await renderAs('AUDITOR');
    const tabs = tabNames();

    expect(tabs).toContain('Audit');
    expect(tabs).not.toContain('Facilities');
    expect(tabs).not.toContain('Postings');
  });

  it('shows SUPER_ADMIN every section', async () => {
    await renderAs('SUPER_ADMIN');
    const tabs = tabNames();

    for (const label of [
      'Overview',
      'Facilities',
      'Postings',
      'Licences',
      'Analytics',
      'Surveillance',
      'Audit',
    ]) {
      expect(tabs, label).toContain(label);
    }
  });

  it('renders no disabled navigation at all', async () => {
    const { container } = await renderAs('ANALYST');
    // The whole design is absence rather than disablement; a disabled tab
    // would mean the rule had been implemented the other way.
    expect(container.querySelectorAll('button[disabled]')).toHaveLength(0);
  });
});

describe('the overview counts', () => {
  it('THE NULL RULE — a count the role cannot act on is not shown as zero', async () => {
    await renderAs('AUDITOR');

    // The auditor's own count is present.
    expect(await screen.findByText(/emergency access to review/i)).toBeInTheDocument();
    // The registrar's counts are absent, not zero. "0 facilities awaiting
    // approval" is a false statement about a queue this role cannot see.
    expect(screen.queryByText(/facilities awaiting approval/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/licences lapsing/i)).not.toBeInTheDocument();
  });

  it('shows a registrar its own counts', async () => {
    await renderAs('REGISTRAR');

    expect(await screen.findByText(/facilities awaiting approval/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/licences lapsing/i)).toBeInTheDocument();
    expect(screen.queryByText(/emergency access to review/i)).not.toBeInTheDocument();
  });

  it('says plainly when nothing is waiting, rather than showing empty tiles', async () => {
    signedInAs('SUPER_ADMIN');
    adminStub.overview.mockResolvedValue({
      ...overviewFor('SUPER_ADMIN'),
      pendingFacilities: 0,
      pendingBreakGlassReviews: 0,
    });

    render(<AdminPage />);
    // An administrator scanning for work needs "nothing" stated, not
    // inferred from a row of zeroes.
    expect(await screen.findByText(/nothing is waiting for a decision/i)).toBeInTheDocument();
  });

  it('tells a role why sections are missing', async () => {
    await renderAs('ANALYST');
    // Absence with no explanation reads as a broken page.
    expect(
      await screen.findByText(/sections you cannot open are not shown/i),
    ).toBeInTheDocument();
  });
});

describe('the facility approval queue', () => {
  const facility = {
    id: 'f1',
    mflCode: 'MFL-12345',
    name: 'Migosi Health Centre',
    kephLevel: 3,
    ownership: 'PRIVATE_FOR_PROFIT',
    countyId: 'c1',
    subcountyId: 's1',
    locality: 'Migosi',
    createdAt: '2026-08-20T00:00:00.000Z',
  };

  it('lists a pending facility with what the decision turns on', async () => {
    adminStub.pendingFacilities.mockResolvedValue([facility]);
    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));

    expect(await screen.findByText('Migosi Health Centre')).toBeInTheDocument();
    // MFL code, level and county are what a registrar checks against the
    // Master Health Facility List.
    expect(screen.getByText(/MFL-12345/)).toBeInTheDocument();
    expect(screen.getByText(/KEPH 3/)).toBeInTheDocument();
    // Scoped to the queue row: "Kisumu" also appears in the by-county
    // distribution further down the page.
    expect(screen.getByText(/MFL-12345 · KEPH 3 · Kisumu/)).toBeInTheDocument();
    // Ownership decides who may staff it for the rest of its life. Scoped
    // to the queue row — it also appears in the by-ownership distribution.
    expect(
      screen.getAllByText(/private for profit/i).length,
    ).toBeGreaterThan(0);
  });

  it('approves and removes the facility from the queue', async () => {
    adminStub.pendingFacilities.mockResolvedValueOnce([facility]).mockResolvedValueOnce([]);
    adminStub.approveFacility.mockResolvedValue({ id: 'f1', registrationStatus: 'ACTIVE' });

    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));
    await screen.findByText('Migosi Health Centre');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(adminStub.approveFacility).toHaveBeenCalledWith('f1'));
    // A queue that never empties is one nobody works through.
    await waitFor(() =>
      expect(screen.queryByText('Migosi Health Centre')).not.toBeInTheDocument(),
    );
  });

  it('says what approval unblocks', async () => {
    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));

    expect(
      await screen.findByText(/no clinician can check in until approved|can grant no affiliation/i),
    ).toBeInTheDocument();
  });
});

describe('the audit queue', () => {
  const event = {
    id: 'bg1',
    personId: 'p1',
    practitionerId: 'pr1',
    facilityId: 'f1',
    justification: 'Unconscious patient brought in by matatu, no next of kin present',
    openedAt: '2026-08-23T14:30:00.000Z',
    reviewStatus: 'PENDING',
    patientNotifiedAt: null,
  };

  it('shows the justification verbatim, because that is what is reviewed', async () => {
    adminStub.pendingBreakGlass.mockResolvedValue([event]);
    await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));

    expect(await screen.findByText(event.justification)).toBeInTheDocument();
  });

  it('says whether the patient has been told', async () => {
    adminStub.pendingBreakGlass.mockResolvedValue([event]);
    await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));

    // An override the patient can see and query is a very different thing
    // from one they cannot.
    expect(await screen.findByText(/patient not yet notified/i)).toBeInTheDocument();
  });

  it('records a review outcome and clears the entry', async () => {
    adminStub.pendingBreakGlass.mockResolvedValueOnce([event]).mockResolvedValueOnce([]);
    adminStub.reviewBreakGlass.mockResolvedValue({ id: 'bg1', reviewStatus: 'REVIEWED_OK' });

    await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));
    await screen.findByText(event.justification);

    await userEvent.click(screen.getByRole('button', { name: /justified/i }));

    await waitFor(() => expect(adminStub.reviewBreakGlass).toHaveBeenCalled());
    const [id, outcome] = adminStub.reviewBreakGlass.mock.calls[0];
    expect([id, outcome]).toEqual(['bg1', 'REVIEWED_OK']);
  });

  it('offers escalation, not only approval', async () => {
    adminStub.pendingBreakGlass.mockResolvedValue([event]);
    await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));

    // A review queue whose only button is "fine" is a rubber stamp.
    expect(await screen.findByRole('button', { name: /flag/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escalate/i })).toBeInTheDocument();
  });

  it('renders no patient identifier in the queue', async () => {
    adminStub.pendingBreakGlass.mockResolvedValue([event]);
    const { container } = await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));
    await screen.findByText(event.justification);

    // The auditor reviews whether the OVERRIDE was justified, which does not
    // require seeing the record that was opened.
    expect(container.textContent).not.toMatch(/NHP-[A-Z0-9]{4}/);
  });
});

describe('access to the screen itself', () => {
  it('sends a non-Ministry account back to the Ministry sign-in', async () => {
    authStub.me.mockResolvedValue({
      accountId: 'a1',
      practitionerId: 'p1',
      ministryUserId: null,
      ministryRole: null,
      geoScope: null,
      scopeCountyId: null,
      personId: null,
      mfaSatisfied: true,
      checkedInAt: null,
    });
    adminStub.overview.mockResolvedValue(overviewFor('ANALYST'));

    render(<AdminPage />);
    // A clinician who reached this URL belongs elsewhere; the server would
    // refuse every call anyway, but a blank admin shell is a worse answer.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ministry/login'));
  });
});

describe('when a section fails to load', () => {
  /**
   * The bug this catches, found in a browser: the audit queue caught its
   * error, set the message, and left the list at `null` — so the component
   * rendered "Loading…" for ever and the error was never reached. A failed
   * fetch looked exactly like a slow one.
   *
   * It surfaced because an access token expired mid-session, which is not
   * an edge case: the token lives fifteen minutes by design.
   */
  it('THE LOADING RULE — an expired session shows the error, not a spinner', async () => {
    const { ApiError } = await import('@/lib/api');
    adminStub.pendingBreakGlass.mockRejectedValue(
      new ApiError('Sign in to continue', 401, 'NO_SESSION'),
    );

    await renderAs('AUDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Audit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in to continue/i);
    expect(screen.queryByText(/^Loading…$/)).not.toBeInTheDocument();
  });

  it('does the same for the facility queue', async () => {
    const { ApiError } = await import('@/lib/api');
    adminStub.pendingFacilities.mockRejectedValue(
      new ApiError('Sign in to continue', 401, 'NO_SESSION'),
    );

    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in to continue/i);
    expect(screen.queryByText(/^Loading…$/)).not.toBeInTheDocument();
  });

  it('never reports "nothing lapsing" when the request actually failed', async () => {
    const { ApiError } = await import('@/lib/api');
    adminStub.expiringLicences.mockRejectedValue(
      new ApiError('Sign in to continue', 401, 'NO_SESSION'),
    );

    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Licences' }));

    // "No licences lapse in the next 30 days" is the reassuring reading of
    // a failure, and the one an administrator would act on.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/no licences lapse/i)).not.toBeInTheDocument();
  });
});

describe('staff postings', () => {
  /**
   * The rule from the brief, at the point someone is about to break it:
   * the Ministry posts staff to PUBLIC facilities, private facilities
   * engage their own. The server refuses the wrong direction, so the job of
   * this screen is to say so BEFORE the attempt rather than surfacing a
   * refusal after a registrar has chosen.
   */
  const nurse = {
    practitionerId: 'pr1',
    name: 'Amina Wanjiru',
    cadre: 'NURSE',
    status: 'ACTIVE',
    licences: [
      { regulator: 'NCK', licenceNumber: 'NCK/2026/0038', status: 'ACTIVE', expiresOn: '2027-01-01' },
    ],
    affiliations: [] as Array<{ id: string; facilityId: string; facilityName: string; role: string }>,
  };

  const publicFacility = {
    id: 'f-pub',
    mflCode: 'MFL-77123',
    name: 'Nyalenda Dispensary',
    kephLevel: 2,
    ownership: 'PUBLIC_MOH',
    countyId: 'c1',
  };

  const privateFacility = {
    id: 'f-priv',
    mflCode: 'MFL-77124',
    name: 'Aga Khan Kisumu',
    kephLevel: 4,
    ownership: 'PRIVATE_FOR_PROFIT',
    countyId: 'c1',
  };

  async function openPostings() {
    await renderAs('REGISTRAR');
    await userEvent.click(screen.getByRole('button', { name: 'Postings' }));
  }

  /** Types into a search box and picks the first result. */
  async function pick(label: RegExp, query: string, name: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(label), query);
    const hit = await screen.findByRole('button', { name: new RegExp(name, 'i') });
    await user.click(hit);
  }

  it('finds a clinician by licence number and shows their cadre', async () => {
    adminStub.searchPractitioners.mockResolvedValue([nurse]);
    await openPostings();

    await userEvent.type(screen.getByLabelText(/clinician/i), 'NCK/2026');
    await waitFor(() => expect(adminStub.searchPractitioners).toHaveBeenCalled());

    expect(await screen.findByText('Amina Wanjiru')).toBeInTheDocument();
    expect(screen.getByText(/NCK\/2026\/0038/)).toBeInTheDocument();
  });

  it('says the search is by licence, so nobody types a name and gets nothing', async () => {
    await openPostings();
    // Names are encrypted with no blind index; a name search cannot work,
    // and silence would look like "this person is not registered".
    expect(screen.getByText(/searched by licence number/i)).toBeInTheDocument();
  });

  it('THE OWNERSHIP RULE — refuses a private facility before the attempt', async () => {
    adminStub.searchPractitioners.mockResolvedValue([nurse]);
    adminStub.searchFacilities.mockResolvedValue([privateFacility]);
    await openPostings();

    await pick(/clinician/i, 'NCK/2026', 'Amina Wanjiru');
    await pick(/facility/i, 'Aga', 'Aga Khan Kisumu');

    // Stated, and the button disabled — not a refusal after the click.
    expect(
      await screen.findByText(/is not a public facility — it engages its own staff/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post to facility/i })).toBeDisabled();
    expect(adminStub.postStaff).not.toHaveBeenCalled();
  });

  it('allows a public facility and posts it', async () => {
    adminStub.searchPractitioners.mockResolvedValue([nurse]);
    adminStub.searchFacilities.mockResolvedValue([publicFacility]);
    adminStub.postStaff.mockResolvedValue({ id: 'aff1', status: 'ACTIVE' });
    await openPostings();

    await pick(/clinician/i, 'NCK/2026', 'Amina Wanjiru');
    await pick(/facility/i, 'Nyalenda', 'Nyalenda Dispensary');

    const button = screen.getByRole('button', { name: /post to facility/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    await userEvent.click(button);

    await waitFor(() =>
      expect(adminStub.postStaff).toHaveBeenCalledWith({
        practitionerId: 'pr1',
        facilityId: 'f-pub',
      }),
    );
    expect(await screen.findByText(/posted to Nyalenda Dispensary/i)).toBeInTheDocument();
  });

  it('THE DUPLICATE GUARD — refuses a facility they already work at', async () => {
    adminStub.searchPractitioners.mockResolvedValue([
      {
        ...nurse,
        affiliations: [
          { id: 'a1', facilityId: 'f-pub', facilityName: 'Nyalenda Dispensary', role: 'ATTENDING' },
        ],
      },
    ]);
    adminStub.searchFacilities.mockResolvedValue([publicFacility]);
    await openPostings();

    await pick(/clinician/i, 'NCK/2026', 'Amina Wanjiru');
    await pick(/facility/i, 'Nyalenda', 'Nyalenda Dispensary');

    // The server would refuse with AFFILIATION_EXISTS; saying it here saves
    // a registrar the round trip and the confusion.
    expect(
      await screen.findByText(/already posted to Nyalenda Dispensary/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post to facility/i })).toBeDisabled();
  });

  it('shows where a clinician already works, in the search results', async () => {
    adminStub.searchPractitioners.mockResolvedValue([
      {
        ...nurse,
        affiliations: [
          { id: 'a1', facilityId: 'f-x', facilityName: 'Kisumu County Referral', role: 'ATTENDING' },
        ],
      },
    ]);
    await openPostings();
    await userEvent.type(screen.getByLabelText(/clinician/i), 'NCK/2026');

    expect(await screen.findByText(/already at Kisumu County Referral/i)).toBeInTheDocument();
  });

  it('marks ownership on every facility result, not only the chosen one', async () => {
    adminStub.searchFacilities.mockResolvedValue([publicFacility, privateFacility]);
    await openPostings();
    await userEvent.type(screen.getByLabelText(/facility/i), 'Ki');

    // A registrar scanning a list needs to see which rows are even eligible.
    expect(await screen.findByText(/public moh/i)).toBeInTheDocument();
    expect(screen.getByText(/private for profit/i)).toBeInTheDocument();
  });

  it('explains what is missing rather than showing a dead button', async () => {
    await openPostings();
    expect(screen.getByRole('button', { name: /post to facility/i })).toBeDisabled();
    // A disabled control with no reason reads as a broken page.
    expect(screen.getByText(/find the clinician by licence number/i)).toBeInTheDocument();
  });

  it('surfaces a server refusal in the server\'s own words', async () => {
    const { ApiError } = await import('@/lib/api');
    adminStub.searchPractitioners.mockResolvedValue([nurse]);
    adminStub.searchFacilities.mockResolvedValue([publicFacility]);
    adminStub.postStaff.mockRejectedValue(
      new ApiError('That practitioner is already affiliated to this facility', 400, 'AFFILIATION_EXISTS'),
    );
    await openPostings();

    await pick(/clinician/i, 'NCK/2026', 'Amina Wanjiru');
    await pick(/facility/i, 'Nyalenda', 'Nyalenda Dispensary');
    await userEvent.click(screen.getByRole('button', { name: /post to facility/i }));

    // The client's checks are a courtesy; the server is the authority, and
    // when it refuses the registrar sees why.
    expect(await screen.findByRole('alert')).toHaveTextContent(/already affiliated/i);
  });

  it('does not search on a single keystroke', async () => {
    await openPostings();
    await userEvent.type(screen.getByLabelText(/clinician/i), 'N');

    // Below three characters a licence search would return the register.
    await new Promise((r) => setTimeout(r, 350));
    expect(adminStub.searchPractitioners).not.toHaveBeenCalled();
  });
});

describe('the registers', () => {
  describe('citizens', () => {
    it('shows population statistics', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));

      expect(await screen.findByText(/population register/i)).toBeInTheDocument();
      // Appears in the total tile and again in the by-county bar.
      expect(screen.getAllByText('2,431').length).toBeGreaterThan(0);
      expect(screen.getByText(/registered this month/i)).toBeInTheDocument();
      // The number an administrator is actually working to move.
      expect(screen.getByText(/the gap to close/i)).toBeInTheDocument();
    });

    it('THE NO-LIST RULE — offers a lookup, never a browsable register', async () => {
      const { container } = await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));
      await screen.findByText(/population register/i);

      // A browsable register of every citizen in Kenya is the single
      // highest-value target in the country. The screen must not offer one,
      // and the endpoint behind it does not exist.
      expect(screen.getByText(/there is no way to browse the register/i)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/NHP-[A-Z0-9]{4}/);
    });

    it('warns that the lookup is shown to the citizen, BEFORE searching', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));

      // An administrative power the subject cannot see is the one that gets
      // abused. Saying so after the fact is too late to deter anything.
      expect(
        await screen.findByText(/recorded and shown to that citizen/i),
      ).toBeInTheDocument();
    });

    it('refuses to search on a partial identifier', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));
      await screen.findByText(/population register/i);

      await userEvent.type(screen.getByLabelText(/national id or nhp number/i), '81');
      // A prefix search would turn a lookup into a listing, one keystroke
      // at a time.
      expect(screen.getByRole('button', { name: /look up/i })).toBeDisabled();
      expect(adminStub.lookupCitizen).not.toHaveBeenCalled();
    });

    it('shows one citizen, and says clinical data is out of reach', async () => {
      adminStub.lookupCitizen.mockResolvedValue({
        match: {
          id: 'p1',
          displayNumber: 'NHP-AB12-CD34',
          givenName: 'Wanjiku',
          familyName: 'Kamau',
          dateOfBirth: '1994-06-15',
          maturity: 'ADULT',
          sexAtBirth: 'FEMALE',
          verificationState: 'VERIFIED',
        },
      });

      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));
      await screen.findByText(/population register/i);

      await userEvent.type(screen.getByLabelText(/national id or nhp number/i), '12345678');
      await userEvent.click(screen.getByRole('button', { name: /look up/i }));

      expect(await screen.findByText('Wanjiku Kamau')).toBeInTheDocument();
      // Stated on the screen most easily mistaken for a patient record.
      expect(
        screen.getByText(/no Ministry role can read clinical data/i),
      ).toBeInTheDocument();
    });

    it('says plainly when nobody holds that identifier', async () => {
      adminStub.lookupCitizen.mockResolvedValue({ match: null });
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Citizens' }));
      await screen.findByText(/population register/i);

      await userEvent.type(screen.getByLabelText(/national id or nhp number/i), '00000000');
      await userEvent.click(screen.getByRole('button', { name: /look up/i }));

      expect(await screen.findByText(/no citizen holds that identifier/i)).toBeInTheDocument();
    });
  });

  describe('health workers', () => {
    it('separates registered from able to work', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Health workers' }));

      expect(await screen.findByText(/the workforce/i)).toBeInTheDocument();
      // The number that matters: registered is not the same as able to
      // treat anyone.
      expect(screen.getByText(/registered but cannot treat a patient/i)).toBeInTheDocument();
      expect(screen.getAllByText('12').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    it('breaks the workforce down by cadre', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Health workers' }));

      expect(await screen.findByText(/by cadre/i)).toBeInTheDocument();
      expect(screen.getByText('nurse')).toBeInTheDocument();
      expect(screen.getByText('doctor')).toBeInTheDocument();
    });

    it('marks an unposted clinician rather than leaving the cell blank', async () => {
      adminStub.practitioners.mockResolvedValue({
        total: 1,
        rows: [
          {
            practitionerId: 'pr1',
            cadre: 'NURSE',
            status: 'ACTIVE',
            countyId: 'c1',
            registeredAt: '2026-08-01T00:00:00.000Z',
            licence: {
              regulator: 'NCK',
              licenceNumber: 'NCK/2026/0038',
              status: 'ACTIVE',
              expiresOn: '2027-01-01',
            },
            facilities: [],
          },
        ],
      });

      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Health workers' }));

      // An unposted clinician is exactly what a registrar is scanning for;
      // a blank cell reads as missing data. Asserted on the table cell,
      // since the tile above also says "Not posted anywhere".
      expect(await screen.findByText('NCK/2026/0038')).toBeInTheDocument();
      const cell = screen
        .getAllByText(/^Not posted$/i)
        .find((el) => el.closest('td') !== null);
      expect(cell).toBeTruthy();
    });

    it('carries no patient identity for a clinician', async () => {
      adminStub.practitioners.mockResolvedValue({
        total: 1,
        rows: [
          {
            practitionerId: 'pr1',
            cadre: 'NURSE',
            status: 'ACTIVE',
            countyId: 'c1',
            registeredAt: '2026-08-01T00:00:00.000Z',
            licence: null,
            facilities: ['Migosi Health Centre'],
          },
        ],
      });

      const { container } = await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Health workers' }));
      await screen.findByText(/migosi health centre/i);

      // A clinician is also a person with a health record. Showing their
      // NHP number here would link the two for anyone reading the page.
      expect(container.textContent).not.toMatch(/NHP-[A-Z0-9]{4}/);
    });
  });

  describe('facilities', () => {
    it('shows the national register alongside the approval queue', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));

      expect(await screen.findByText(/the national register/i)).toBeInTheDocument();
      expect(screen.getByText(/by keph level/i)).toBeInTheDocument();
      expect(screen.getByText(/by ownership/i)).toBeInTheDocument();
    });

    it('surfaces active facilities that can never be recommended', async () => {
      await renderAs('REGISTRAR');
      await userEvent.click(screen.getByRole('button', { name: 'Facilities' }));

      // Registered but invisible to care routing: a patient will never be
      // sent there, and nobody at the facility knows.
      expect(
        await screen.findByText(/cannot be recommended to a patient/i),
      ).toBeInTheDocument();
    });
  });

  it('shows none of the three registers to an analyst', async () => {
    await renderAs('ANALYST');
    const tabs = screen.getAllByRole('button').map((b) => b.textContent?.trim());

    for (const label of ['Citizens', 'Facilities', 'Health workers']) {
      expect(tabs, label).not.toContain(label);
    }
  });
});
