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

const authStub = { me: vi.fn<() => Promise<any>>() };
/* eslint-disable @typescript-eslint/no-explicit-any */
const adminStub = {
  overview: vi.fn<() => Promise<any>>(),
  pendingFacilities: vi.fn<() => Promise<any[]>>(async () => []),
  facilities: vi.fn<() => Promise<any[]>>(async () => []),
  approveFacility: vi.fn<(id: string) => Promise<any>>(),
  postStaff: vi.fn(),
  endPosting: vi.fn(),
  expiringLicences: vi.fn<(days?: number) => Promise<any[]>>(async () => []),
  pendingBreakGlass: vi.fn<() => Promise<any[]>>(async () => []),
  reviewBreakGlass: vi.fn<(id: string, outcome: string, note?: string) => Promise<any>>(),
  breakGlassRates: vi.fn<() => Promise<any[]>>(async () => []),
  anomalies: vi.fn<() => Promise<any[]>>(async () => []),
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

beforeEach(() => {
  signedInAs('SUPER_ADMIN');
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
    expect(screen.getByText(/Kisumu/)).toBeInTheDocument();
    // Ownership decides who may staff it for the rest of its life.
    expect(screen.getByText(/private for profit/i)).toBeInTheDocument();
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
