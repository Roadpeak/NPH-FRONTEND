/**
 * THE FACILITY PORTAL.
 *
 * Three properties decide whether these screens are right:
 *
 *   1. The reception desk shows identity and nothing else. Not "clinical
 *      data is hidden behind a control" — a receptionist looks at a screen
 *      facing a full waiting room, and what a passer-by can read over their
 *      shoulder must be limited to a name, an age and a photograph.
 *
 *   2. A public facility gets no "add staff" form. The Ministry posts its
 *      staff, so a form there would only ever produce a refusal, and
 *      teaching a rule by failing is not teaching it.
 *
 *   3. A pending facility says so, plainly. It can do nothing at all until
 *      a registrar approves it, and someone who does not know that will
 *      keep trying and conclude the portal is broken.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/facility/reception',
  useSearchParams: () => new URLSearchParams(),
}));

// Typed from the real client, so a change to an API shape breaks these
// tests rather than letting them assert against a fiction.
type Facility = typeof import('@/lib/api')['facility'];

const facilityStub: { [K in keyof Facility]: ReturnType<typeof vi.fn> } = {
  me: vi.fn(),
  staff: vi.fn(),
  addStaff: vi.fn(),
  removeStaff: vi.fn(),
  queue: vi.fn(),
  registerArrival: vi.fn(),
  closeArrival: vi.fn(),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    facility: facilityStub,
    auth: { ...actual.auth, logout: vi.fn(), me: vi.fn(async () => ({})) },
    hasSession: () => true,
    restoreSession: async () => true,
  };
});

const { default: ReceptionPage } = await import('@/app/facility/reception/page');
const { default: StaffPage } = await import('@/app/facility/staff/page');
const { default: ProfilePage } = await import('@/app/facility/profile/page');

const PROFILE = {
  id: 'f1',
  mflCode: 'MFL-12345',
  name: 'Milimani Family Clinic',
  kephLevel: 3,
  ownership: 'PRIVATE_FOR_PROFIT',
  registrationStatus: 'ACTIVE',
  locality: 'Milimani',
  approvedAt: '2026-08-01T00:00:00.000Z',
  businessRegNo: 'PVT-ABC1234',
  kraPin: 'P051234567X',
  practiceLicenceNo: null,
  ownerName: 'Amina Wanjiru',
  countyName: 'Kisumu',
  subcountyName: 'Kisumu Central',
  isPublic: false,
  staffingRule: 'You engage your own staff. Add them by licence number below.',
};

beforeEach(() => {
  vi.clearAllMocks();
  facilityStub.me.mockResolvedValue(PROFILE);
});

describe('the reception desk', () => {
  const WAITING = {
    facilityName: 'Milimani Family Clinic',
    queue: [
      {
        visitId: 'a1',
        nhpId: 'NHP-1234-5678',
        displayName: 'Grace Achieng',
        ageYears: 34,
        sex: 'FEMALE',
        photoDataUrl: null,
        arrivedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        reasonForVisit: 'Cough since Tuesday',
        seenBy: null,
      },
    ],
  };

  it('shows who is waiting, and how long they have waited', async () => {
    facilityStub.queue.mockResolvedValue(WAITING);

    render(<ReceptionPage />);

    expect(await screen.findByText('Grace Achieng')).toBeInTheDocument();
    expect(screen.getByText(/NHP-1234-5678/)).toBeInTheDocument();
    expect(screen.getByText(/12 min/)).toBeInTheDocument();
  });

  it('THE RECEPTION BOUNDARY — renders nothing clinical', async () => {
    /*
     * The server does not send clinical fields. This asserts the screen
     * would not render them even if it did — because the day someone adds
     * a field to that payload, this is what catches it.
     */
    facilityStub.queue.mockResolvedValue({
      ...WAITING,
      queue: [
        {
          ...WAITING.queue[0],
          bloodGroup: 'O_POS',
          allergies: ['Penicillin'],
          conditions: ['Type 2 diabetes'],
          nationalId: '31234567',
        },
      ],
    });

    const { container } = render(<ReceptionPage />);
    await screen.findByText('Grace Achieng');

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/penicillin|diabetes|O_POS|31234567/i);
    // …while still carrying what reception actually needs to do the job.
    expect(text).toContain('NHP-1234-5678');
  });

  it('says when somebody is already in the queue rather than adding them twice', async () => {
    facilityStub.queue.mockResolvedValue({ facilityName: 'X', queue: [] });
    facilityStub.registerArrival.mockResolvedValue({
      arrivalId: 'a1',
      alreadyWaiting: true,
      arrivedAt: new Date().toISOString(),
    });

    render(<ReceptionPage />);
    await screen.findByText(/Nobody is waiting/);

    await userEvent.type(screen.getByLabelText(/NHP number/i), 'NHP-1234-5678');
    await userEvent.click(screen.getByRole('button', { name: /add to queue/i }));

    expect(await screen.findByText(/already in the queue/i)).toBeInTheDocument();
  });

  it('surfaces an unknown NHP number as the desk would need to hear it', async () => {
    const { ApiError } = await import('@/lib/api');
    facilityStub.queue.mockResolvedValue({ facilityName: 'X', queue: [] });
    facilityStub.registerArrival.mockRejectedValue(
      new ApiError('No record found for NHP-0000-0000. Check the number on the card.', 400, 'PERSON_NOT_FOUND'),
    );

    render(<ReceptionPage />);
    await screen.findByText(/Nobody is waiting/);

    await userEvent.type(screen.getByLabelText(/NHP number/i), 'NHP-0000-0000');
    await userEvent.click(screen.getByRole('button', { name: /add to queue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Check the number on the card/);
  });
});

describe('the staff roster', () => {
  const STAFF = [
    {
      affiliationId: 'af1',
      practitionerId: 'p1',
      displayName: 'Amina Wanjiru',
      cadre: 'DOCTOR',
      role: 'ATTENDING',
      status: 'ACTIVE',
      startedAt: '2026-01-05T00:00:00.000Z',
      grantedByKind: 'FACILITY',
      onDuty: true,
      licenceNumber: 'KMPDC/2026/H001',
      licenceStatus: 'ACTIVE',
    },
    {
      affiliationId: 'af2',
      practitionerId: 'p2',
      displayName: 'Peter Otieno',
      cadre: 'RECEPTION',
      role: 'ATTENDING',
      status: 'ACTIVE',
      startedAt: '2026-02-01T00:00:00.000Z',
      grantedByKind: 'FACILITY',
      onDuty: false,
      // Reception holds none. Blank here is correct, not missing data.
      licenceNumber: null,
      licenceStatus: null,
    },
  ];

  it('offers a private facility a way to engage its own clinicians', async () => {
    facilityStub.staff.mockResolvedValue({
      facilityName: 'Milimani Family Clinic',
      isPublic: false,
      staff: STAFF,
    });

    render(<StaffPage />);

    expect(await screen.findByLabelText(/Licence number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to this facility/i })).toBeInTheDocument();
  });

  it('THE OWNERSHIP RULE — a public facility gets an explanation, not a form', async () => {
    facilityStub.staff.mockResolvedValue({
      facilityName: 'Kondele Dispensary',
      isPublic: true,
      staff: STAFF,
    });

    render(<StaffPage />);

    expect(await screen.findByText(/Ministry posts staff to public facilities/i)).toBeInTheDocument();
    // Absent, not disabled: a form that only ever refuses teaches the rule
    // by failure.
    expect(screen.queryByLabelText(/Licence number/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add to this facility/i }),
    ).not.toBeInTheDocument();
    // And nobody can be removed from a roster they were posted to either.
    expect(
      screen.queryByRole('button', { name: /no longer works here/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a member of staff with no licence as holding none, not as an error', async () => {
    facilityStub.staff.mockResolvedValue({
      facilityName: 'Milimani Family Clinic',
      isPublic: false,
      staff: STAFF,
    });

    render(<StaffPage />);

    expect(await screen.findByText('Peter Otieno')).toBeInTheDocument();
    expect(screen.getByText(/no licence held/i)).toBeInTheDocument();
  });

  it('marks who is on duty right now', async () => {
    facilityStub.staff.mockResolvedValue({
      facilityName: 'Milimani Family Clinic',
      isPublic: false,
      staff: STAFF,
    });

    render(<StaffPage />);

    expect(await screen.findByText(/On duty/i)).toBeInTheDocument();
  });

  it('says where each affiliation came from', async () => {
    facilityStub.staff.mockResolvedValue({
      facilityName: 'Milimani Family Clinic',
      isPublic: false,
      staff: [{ ...STAFF[0], grantedByKind: 'MINISTRY' }],
    });

    render(<StaffPage />);

    expect(await screen.findByText(/Posted by the Ministry/i)).toBeInTheDocument();
  });
});

describe('the facility record', () => {
  it('says plainly that a pending facility can do nothing yet', async () => {
    facilityStub.me.mockResolvedValue({
      ...PROFILE,
      registrationStatus: 'PENDING',
      approvedAt: null,
    });

    render(<ProfilePage />);

    expect(await screen.findByText(/Awaiting Ministry approval/i)).toBeInTheDocument();
    expect(screen.getByText(/no staff can be added/i)).toBeInTheDocument();
  });

  it('shows the ownership evidence back to a private facility', async () => {
    render(<ProfilePage />);

    expect(await screen.findByText('PVT-ABC1234')).toBeInTheDocument();
    expect(screen.getByText('P051234567X')).toBeInTheDocument();
    // Not given, said rather than left blank — a blank row reads as a
    // rendering fault instead of "nothing was supplied".
    expect(screen.getByText(/Not given/i)).toBeInTheDocument();
  });

  it("never shows the owner's National ID", async () => {
    // It is encrypted at rest and read by registrars. A reception terminal
    // reading it back on screen would undo that.
    const { container } = render(<ProfilePage />);
    await screen.findByText('PVT-ABC1234');

    expect(container.textContent).not.toMatch(/National ID/i);
  });

  it('asks a public facility for no ownership evidence', async () => {
    facilityStub.me.mockResolvedValue({
      ...PROFILE,
      ownership: 'PUBLIC_MOH',
      isPublic: true,
      businessRegNo: null,
      kraPin: null,
      ownerName: null,
      staffingRule: 'The Ministry posts staff to public facilities.',
    });

    render(<ProfilePage />);

    await screen.findByText(/Ministry of Health/i);
    // An empty ownership panel on a public dispensary would read as
    // missing paperwork rather than as an inapplicable question.
    expect(screen.queryByText(/Ownership and legality/i)).not.toBeInTheDocument();
  });
});

/*
 * WHICH BUILDING AM I IN?
 *
 * A clinician who works at a county referral on some days and their own
 * clinic on others has two facilities. `/facility/me` answers "which do
 * you administer"; the queue answers "which desk are you at". Those are
 * different buildings, and the portal showed one name in the navigation
 * beside the other's queue — which is how the fault was noticed at all.
 */
describe('the facility named in the navigation', () => {
  it('distinguishes the desk they are at from the facility they run', async () => {
    facilityStub.me.mockResolvedValue(PROFILE); // administers Milimani
    facilityStub.queue.mockResolvedValue({
      // …but is checked in at the county referral today.
      facilityName: 'Kisumu County Referral',
      queue: [],
    });

    const { container } = render(<ReceptionPage />);
    await screen.findByText(/Nobody is waiting/);

    // Both are true and both are named, because Reception is scoped to the
    // desk while the roster is scoped to the facility they administer.
    // Naming only one put a county referral in the navigation above a
    // roster headed with a private clinic.
    expect(container.textContent).toMatch(/At\s*Kisumu County Referral/);
    expect(container.textContent).toMatch(/Runs\s*Milimani Family Clinic/);
  });

  it('attaches level and ownership to the facility they actually describe', async () => {
    facilityStub.me.mockResolvedValue(PROFILE); // Level 3, private
    facilityStub.queue.mockResolvedValue({
      facilityName: 'Kisumu County Referral', // in truth a level 5 public
      queue: [],
    });

    const { container } = render(<ReceptionPage />);
    await screen.findByText(/Nobody is waiting/);

    // "Level 3 · Private" describes Milimani, so it must sit with
    // Milimani's name and not with the county referral's.
    expect(container.textContent).toMatch(
      /Runs\s*Milimani Family Clinic\s*·\s*Level 3\s*·\s*Private/,
    );
    expect(container.textContent).not.toMatch(/Kisumu County Referral\s*·\s*Level 3/);
  });

  it('says it once when the desk IS the facility they run', async () => {
    facilityStub.me.mockResolvedValue(PROFILE);
    facilityStub.queue.mockResolvedValue({
      facilityName: 'Milimani Family Clinic',
      queue: [],
    });

    const { container } = render(<ReceptionPage />);
    await screen.findByText(/Nobody is waiting/);

    expect(container.textContent).toMatch(/Level 3/);
    // One building, so no "Runs …" clause repeating what "At …" said.
    expect(container.textContent).not.toMatch(/Runs/);
  });
});
