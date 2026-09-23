/**
 * THE ENCOUNTER SCREEN.
 *
 * This is the one screen that writes to a national health record, and until
 * now it wrote nothing at all: three of its five steps rendered "not built
 * yet", and the two that worked only updated local state.
 *
 * Three properties decide whether it is right:
 *
 *   1. Nothing is written until Complete. Clinical tables are append-only,
 *      so a diagnosis saved the moment it is tapped cannot be removed when
 *      the clinician changes their mind — only superseded with a formal
 *      amendment. A mis-tap must cost nothing.
 *
 *   2. A failed save leaves the encounter OPEN. An open encounter is
 *      visibly unfinished and can be completed; one closed around missing
 *      diagnoses looks complete and is not.
 *
 *   3. A clinician can record a treatment the catalogue has not thought of.
 *      A list that refuses them produces a record that quietly disagrees
 *      with what happened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/encounter',
  useSearchParams: () => new URLSearchParams('patient=NHP-1234-5678'),
}));

const TREATMENTS = [
  {
    txCode: 'NHP-TX-0001',
    title: 'Wound cleaning and dressing',
    plainEn: 'Your wound was cleaned and covered',
    plainSw: 'Jeraha lako lilisafishwa na kufungwa',
    category: 'WOUND_CARE',
    minKephLevel: 2,
    requiresConsent: false,
    score: 0,
  },
  {
    txCode: 'NHP-TX-0002',
    title: 'Simple suturing',
    plainEn: 'Your cut was stitched closed',
    plainSw: 'Jeraha lako lilishonwa',
    category: 'WOUND_CARE',
    minKephLevel: 2,
    requiresConsent: true,
    score: 0,
  },
];

const PATIENT = {
  person: {
    id: 'p1',
    displayNumber: 'NHP-1234-5678',
    givenName: 'Grace',
    familyName: 'Achieng',
    dateOfBirth: '1992-04-11',
    age: 34,
    maturity: 'ADULT' as const,
    sexAtBirth: 'FEMALE' as const,
    verificationState: 'VERIFIED',
    bloodGroup: null,
    lifeStatus: 'ALIVE',
  },
  allergies: [],
  medications: [],
  chronicConditions: [],
  restrictedRecordsExist: false,
  withheldCategories: [],
};

const nhpStub = {
  patientSummary: vi.fn(async () => PATIENT),
  /*
   * The check-in gate.
   *
   * The server refuses a clinical write without an open check-in, and the
   * screen disables Complete for the same reason. A stub returning null
   * would make every save test fail for the right reason at the wrong time.
   */
  currentSession: vi.fn(async () => ({
    facilityName: 'Milimani Family Clinic',
    facilityId: 'f1',
    minutesRemaining: 240,
  })),
  searchTreatments: vi.fn(async () => TREATMENTS),
  openEncounter: vi.fn(async () => ({ id: 'enc-1' })),
  recordDiagnosis: vi.fn(async () => ({ id: 'c1', icd11Title: 'x' })),
  recordTreatment: vi.fn(async () => ({ id: 't1', code: 'NHP-TX-0001', title: 'x' })),
  recordMedication: vi.fn(async () => ({ id: 'm1' })),
  closeEncounter: vi.fn(async () => ({
    id: 'enc-1',
    endedAt: '2026-09-06T10:00:00.000Z',
    disposition: 'DISCHARGED' as const,
  })),
  checkPrescribing: vi.fn(async () => ({ verdict: 'ALLOW', reasons: [], alternatives: [] })),
  // Decision support. Stubbed so these panels cannot reach the real API
  // from a unit test — an unstubbed call would fail silently and the
  // panels would render empty, which is indistinguishable from working.
  brief: vi.fn(async () => ({
    brief: '44-year-old female. SEVERE allergy: Penicillin (Anaphylaxis).',
    ageYears: 44,
    severeAllergies: [{ substanceLabel: 'Penicillin', reaction: 'Anaphylaxis' }],
    chronicConditions: [],
    currentMedications: [],
    lastSeen: null,
    derivedFrom: 'STRUCTURED_RECORD' as const,
  })),
  triageAssist: vi.fn(async () => ({
    urgency: 'EMERGENCY',
    redFlag: false,
    rulesFired: [],
    inactiveRulesMatched: ['RF001'],
    requiredCapabilities: ['EMERGENCY_24H', 'ECG'],
    minKephLevel: 4,
    historyFactors: [],
    adviceEn: 'Seek emergency care.',
    advisory: true as const,
    disclaimer:
      'Decision support only. These rules do not diagnose, and the clinical judgement in the room overrides them.',
  })),
  destinations: vi.fn(async () => ({
    requiredCapabilities: ['SURGERY_GENERAL'],
    destinations: [
      { id: 'f2', name: 'Kisumu County Hospital', kephLevel: 4, mflCode: null, locality: null, is24Hour: true, distanceKm: 12 },
    ],
  })),
};

const authStub = {
  me: vi.fn(async () => ({ name: 'Dr Wanjiru', licenceNumber: 'KMPDC-1234' })),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    nhp: { ...actual.nhp, ...nhpStub },
    auth: { ...actual.auth, ...authStub },
    photo: { ...actual.photo, get: vi.fn(async () => null) },
    hasSession: () => true,
    restoreSession: async () => true,
  };
});

vi.mock('@/lib/search', () => ({
  loadDiagnosisIndex: vi.fn(async () => []),
  loadMedicationIndex: vi.fn(async () => []),
  // One real hit, so a test can actually put a diagnosis in the encounter.
  // An empty index made the save tests vacuous: nothing was ever recorded,
  // so a swallowed write looked identical to a successful one.
  searchDiagnoses: (_index: unknown, q: string) =>
    q.toLowerCase().startsWith('mal')
      ? [{ term: { c: '1F41.0', t: 'Plasmodium falciparum malaria', r: 'TIER_2_GENERAL', n: false }, score: 900 }]
      : [],
  searchMedications: () => [],
}));

const { default: EncounterPage } = await import('@/app/encounter/page');

beforeEach(() => {
  vi.clearAllMocks();
  nhpStub.patientSummary.mockResolvedValue(PATIENT);
  nhpStub.currentSession.mockResolvedValue({
    facilityName: 'Milimani Family Clinic',
    facilityId: 'f1',
    minutesRemaining: 240,
  });
  nhpStub.searchTreatments.mockResolvedValue(TREATMENTS);
  nhpStub.openEncounter.mockResolvedValue({ id: 'enc-1' });
});

/** Walk forward to the final step from wherever the flow currently is. */
async function goToDisposition() {
  for (let i = 0; i < 6; i++) {
    const next = screen.queryByRole('button', { name: /^next$/i });
    if (!next) return;
    await userEvent.click(next);
  }
}

/** Fill in the chief complaint and move to the named step. */
async function reachStep(label: RegExp) {
  render(<EncounterPage />);
  const complaint = await screen.findByPlaceholderText(/in their own words/i);
  await userEvent.type(complaint, 'fever for three days');
  // Walk forward until the step heading appears.
  for (let i = 0; i < 5; i++) {
    if (screen.queryByRole('heading', { name: label })) return;
    const next = screen.queryByRole('button', { name: /^next$/i });
    if (!next) break;
    await userEvent.click(next);
  }
}

describe('the encounter screen', () => {
  it('starts at Presentation, because that is what opens the encounter', async () => {
    render(<EncounterPage />);
    expect(
      await screen.findByRole('heading', { name: /presentation/i }),
    ).toBeInTheDocument();
  });

  it('will not move on until the chief complaint is written', async () => {
    render(<EncounterPage />);
    await screen.findByRole('heading', { name: /presentation/i });

    // The server needs it to open an encounter; nothing else can be
    // recorded before it exists.
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText(/in their own words/i),
      'fever for three days',
    );
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();
  });

  it('writes NOTHING while the clinician is still working', async () => {
    await reachStep(/treatment/i);

    // Every step has been visited and nothing has reached the record. This
    // is what makes a mis-tap free.
    expect(nhpStub.openEncounter).not.toHaveBeenCalled();
    expect(nhpStub.recordDiagnosis).not.toHaveBeenCalled();
    expect(nhpStub.recordTreatment).not.toHaveBeenCalled();
  });

  it('records a treatment the catalogue does not list', async () => {
    await reachStep(/treatment/i);

    const search = await screen.findByLabelText(/search treatments/i);
    await userEvent.type(search, 'traditional bone-setting reviewed');

    // The uncoded escape hatch. A clinician does things the catalogue has
    // not thought of, and refusing them falsifies the record.
    const keep = await screen.findByText(/keep as|uncoded|note/i);
    expect(keep).toBeInTheDocument();
  });

  it('does not close the encounter when a diagnosis fails to save', async () => {
    /*
     * Sabotaging the diagnosis write used to pass every test, because no
     * test recorded one. A consultation whose diagnoses silently failed but
     * whose encounter closed would look complete and be empty.
     */
    nhpStub.recordDiagnosis.mockRejectedValueOnce(new Error('network'));
    await reachStep(/diagnosis/i);

    // Type and press Enter — how a clinician actually uses this, and the
    // interaction the screen was designed around.
    await userEvent.type(await screen.findByRole('combobox'), 'malaria');
    await screen.findByRole('option', { name: /malaria/i });
    await userEvent.keyboard('{Enter}');
    await goToDisposition();
    await userEvent.click(screen.getByRole('radio', { name: /discharged/i }));
    await userEvent.click(screen.getByRole('button', { name: /complete encounter/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(nhpStub.recordDiagnosis).toHaveBeenCalled();
    expect(nhpStub.closeEncounter).not.toHaveBeenCalled();
  });

  it('offers no Complete button until the visit has an ending', async () => {
    await reachStep(/disposition/i);

    const complete = screen.getByRole('button', { name: /complete encounter/i });
    expect(complete).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /discharged/i }));
    expect(complete).toBeEnabled();
  });

  it('does not offer Referred — that belongs to the referral flow', async () => {
    await reachStep(/disposition/i);

    // A bare REFERRED would claim a referral that was never created, and
    // the server refuses it. Offering it here would teach the rule by
    // failing.
    // The accessible name folds in the detail line, so an anchored match on
    // the label alone never fires — assert over the actual values instead.
    const values = screen
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).value);
    expect(values).not.toContain('REFERRED');
    expect(screen.getByText(/referring instead/i)).toBeInTheDocument();
  });

  it('saves the whole consultation and closes it, in that order', async () => {
    await reachStep(/disposition/i);
    await userEvent.click(screen.getByRole('radio', { name: /discharged/i }));
    await userEvent.click(screen.getByRole('button', { name: /complete encounter/i }));

    await waitFor(() => expect(nhpStub.closeEncounter).toHaveBeenCalled());
    expect(nhpStub.openEncounter).toHaveBeenCalledWith(
      expect.objectContaining({ chiefComplaint: 'fever for three days' }),
    );
    expect(nhpStub.closeEncounter).toHaveBeenCalledWith('enc-1', 'DISCHARGED');
  });

  it('LEAVES THE ENCOUNTER OPEN when a save fails partway', async () => {
    /*
     * The sharpest edge. An encounter closed around missing data looks
     * finished and is not; an open one is visibly unfinished and can be
     * completed. The close must never run after a failure.
     *
     * openEncounter is the step made to fail because it always runs — a
     * consultation with no diagnoses recorded would skip a recordDiagnosis
     * rejection entirely and the test would pass without proving anything.
     */
    nhpStub.openEncounter.mockRejectedValueOnce(new Error('network'));
    await reachStep(/disposition/i);
    await userEvent.click(screen.getByRole('radio', { name: /discharged/i }));
    await userEvent.click(screen.getByRole('button', { name: /complete encounter/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(nhpStub.closeEncounter).not.toHaveBeenCalled();
  });

  it('does not open a second encounter when a retry follows a failure', async () => {
    // The encounter succeeded; a later step did not. Pressing Complete
    // again must finish the SAME consultation, not start a duplicate one
    // for the same visit.
    nhpStub.closeEncounter.mockRejectedValueOnce(new Error('network'));
    await reachStep(/disposition/i);
    await userEvent.click(screen.getByRole('radio', { name: /discharged/i }));
    await userEvent.click(screen.getByRole('button', { name: /complete encounter/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /complete encounter/i }));
    await waitFor(() => expect(nhpStub.closeEncounter).toHaveBeenCalledTimes(2));
    expect(nhpStub.openEncounter).toHaveBeenCalledTimes(1);
  });
});

/*
 * CLINICAL DECISION SUPPORT ON THE ENCOUNTER SCREEN.
 *
 * Advisory tools, and the properties that keep them advisory:
 *
 *   - The brief says it was assembled, not generated. A clinician must
 *     never have to wonder whether a sentence came from a model.
 *   - Triage assist NAMES the inactive red-flag rules. They are the people
 *     who can get those rules signed off, and hiding it is how a rule set
 *     stays unreviewed forever.
 *   - Nothing here writes to the record.
 */
describe('decision support', () => {
  it('briefs the clinician and says the brief was assembled, not generated', async () => {
    render(<EncounterPage />);

    expect(await screen.findByText(/At a glance/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/SEVERE allergy: Penicillin/i),
    ).toBeInTheDocument();
    // The line that stops it being mistaken for a model's summary.
    expect(screen.getByText(/Nothing here was generated/i)).toBeInTheDocument();
  });

  it('NAMES an inactive red-flag rule to the clinician', async () => {
    render(<EncounterPage />);

    const input = await screen.findByPlaceholderText(/chest_pain/i);
    await userEvent.type(input, 'chest_pain, breathlessness');
    await userEvent.click(screen.getByRole('button', { name: /check rules/i }));

    // A citizen is never shown a rule id; a clinician always is, because
    // they are the one who can say whether RF001 should be active.
    expect(await screen.findByText(/RF001 matched but is not active/i)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting clinical review/i)).toBeInTheDocument();
    expect(nhpStub.triageAssist).toHaveBeenCalledWith('NHP-1234-5678', [
      'chest_pain',
      'breathlessness',
    ]);
  });

  it('carries the advisory disclaimer with every result', async () => {
    render(<EncounterPage />);

    const input = await screen.findByPlaceholderText(/chest_pain/i);
    await userEvent.type(input, 'fever');
    await userEvent.click(screen.getByRole('button', { name: /check rules/i }));

    expect(
      await screen.findByText(/clinical judgement in the room overrides/i),
    ).toBeInTheDocument();
  });

  it('writes nothing to the record', async () => {
    render(<EncounterPage />);

    const input = await screen.findByPlaceholderText(/chest_pain/i);
    await userEvent.type(input, 'fever');
    await userEvent.click(screen.getByRole('button', { name: /check rules/i }));
    await screen.findByText(/Urgency/i);

    // Decision support is a question, not an entry. Nothing it does may
    // reach an append-only clinical table.
    expect(nhpStub.recordDiagnosis).not.toHaveBeenCalled();
    expect(nhpStub.recordTreatment).not.toHaveBeenCalled();
    expect(nhpStub.recordMedication).not.toHaveBeenCalled();
    expect(nhpStub.openEncounter).not.toHaveBeenCalled();
  });
});
