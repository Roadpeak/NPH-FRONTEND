/**
 * FIND CARE — the citizen-facing half of the routing engine.
 *
 * This is the screen where the system is most tempted to overreach, and
 * four properties are what keep it honest:
 *
 *   1. A red-flag match shows ONE instruction and NO facility list. Every
 *      red-flag rule is still unreviewed; offering a destination would be
 *      acting on a rule no clinician has signed.
 *   2. A citizen is never shown a rule id. "RF001" means nothing to them
 *      and the rule is not active anyway.
 *   3. When the person's own record changed the answer, the screen says so.
 *      Someone who cannot see why they were routed somewhere cannot
 *      disagree with it.
 *   4. The disclaimer is never conditional. NHP says where to go; it does
 *      not say what is wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(),
}));

const SYMPTOM_GROUPS = [
  {
    bodySystem: 'CARDIOVASCULAR',
    items: [
      { code: 'chest_pain', label: 'Chest pain', question: 'Do you have chest pain?', severityMarker: true },
      { code: 'breathlessness', label: 'Breathlessness', question: 'Are you short of breath?', severityMarker: true },
    ],
  },
  {
    bodySystem: 'GENERAL',
    items: [{ code: 'fever', label: 'Fever', question: 'Do you have a fever?', severityMarker: false }],
  },
];

/*
 * Shaped from the real `CitizenSummaryPayload`, not invented.
 *
 * A stub missing `dailyMedicines` rendered the whole page as an empty div —
 * the failure looked like the Find care tab being absent when it was really
 * the page throwing before it got there.
 */
const SUMMARY = {
  name: 'Achieng Otieno',
  displayNumber: 'NHP-1234-5678',
  age: 44,
  rightNow: [],
  dailyMedicines: [],
  pendingClinicianContact: false,
  ui: {},
};

const citizenStub = {
  summary: vi.fn(async () => SUMMARY as never),
  visits: vi.fn(async () => []),
  accessLog: vi.fn(async () => []),
  profile: vi.fn(async () => ({}) as never),
  family: vi.fn(async () => []),
  symptoms: vi.fn(async () => ({ ageYears: 44, groups: SYMPTOM_GROUPS })),
  recommend: vi.fn(),
};

const authStub = { logout: vi.fn(), me: vi.fn(async () => ({}) as never) };

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    citizen: { ...actual.citizen, ...citizenStub },
    auth: { ...actual.auth, ...authStub },
    photo: { ...actual.photo, get: vi.fn(async () => null) },
    hasSession: () => true,
    restoreSession: async () => true,
  };
});

const { default: CitizenPage } = await import('@/app/me/page');

beforeEach(() => {
  vi.clearAllMocks();
  citizenStub.summary.mockResolvedValue(SUMMARY as never);
  citizenStub.visits.mockResolvedValue([]);
  citizenStub.symptoms.mockResolvedValue({ ageYears: 44, groups: SYMPTOM_GROUPS });
});

/** Opens the Find care tab and waits for the symptom picker. */
async function openCareTab() {
  render(<CitizenPage />);
  await userEvent.click(await screen.findByRole('button', { name: /find care/i }));
  await screen.findByRole('button', { name: 'Chest pain' });
}

describe('find care', () => {
  it('offers symptoms to PICK, never a free-text box', async () => {
    await openCareTab();

    // Free text into a rules engine promises an understanding the engine
    // does not have.
    expect(screen.getByRole('button', { name: 'Chest pain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fever' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('A RED FLAG SHOWS NO FACILITIES — just where to go', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'EMERGENCY',
      emergency: true,
      adviceEn: 'Your symptoms may be serious. Go to the nearest emergency department now, or call 999 for an ambulance.',
      adviceSw: '',
      facilities: [],
      scope: 'NONE',
      historyFactors: [],
      rulesFired: [],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Chest pain' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    expect(await screen.findByText(/Go now/i)).toBeInTheDocument();
    expect(screen.getByText(/emergency department now/i)).toBeInTheDocument();
    // No destination is offered, because no clinician signed the rule that
    // would choose one. Asserted on the results HEADING, not on the phrase:
    // the tab's own intro text contains it too.
    expect(screen.queryByRole('heading', { name: /Where to go/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Kisumu County Hospital')).not.toBeInTheDocument();
  });

  it('never shows a citizen a rule id', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'EMERGENCY',
      emergency: true,
      adviceEn: 'Go to the nearest emergency department now.',
      adviceSw: '',
      facilities: [],
      scope: 'NONE',
      historyFactors: [],
      rulesFired: [],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    const { container } = render(<CitizenPage />);
    await userEvent.click(await screen.findByRole('button', { name: /find care/i }));
    await screen.findByRole('button', { name: 'Chest pain' });
    await userEvent.click(screen.getByRole('button', { name: 'Chest pain' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));
    await screen.findByText(/Go now/i);

    expect(container.textContent).not.toMatch(/RF\d{3}/);
  });

  it('SAYS WHY the search was widened by their own record', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'SOON_7D',
      emergency: false,
      adviceEn: 'See a clinician within a week.',
      adviceSw: '',
      facilities: [
        { id: 'f1', name: 'Kisumu County Hospital', kephLevel: 4, mflCode: null, locality: null, is24Hour: true, distanceKm: 8 },
      ],
      scope: 'COUNTY',
      historyFactors: [{ label: 'diabetes', capabilities: ['DIABETES_CLINIC'] }],
      rulesFired: ['R012'],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    // Silently reordering results would give somebody no way to tell us the
    // reason is wrong.
    expect(await screen.findByText(/Why these facilities/i)).toBeInTheDocument();
    /*
     * Scoped to the "why" paragraph.
     *
     * "diabetes" now appears twice by design — once in this explanation and
     * again in the collapsible trace beneath the result — so a bare text
     * query matches both. Asserting on the explanation itself keeps the
     * test about what the citizen is told, not about how many places the
     * word occurs.
     */
    const why = screen.getByText(/Why these facilities/i).closest('p')!;
    expect(why.textContent).toMatch(/living with/i);
    expect(why.textContent).toMatch(/diabetes/i);
    expect(screen.getByText('Kisumu County Hospital')).toBeInTheDocument();
  });

  it('always carries the disclaimer', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'ROUTINE',
      emergency: false,
      adviceEn: 'Book a visit.',
      adviceSw: '',
      facilities: [],
      scope: 'NONE',
      historyFactors: [],
      rulesFired: [],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    /*
     * Appears twice by design — once in the tab's opening explanation and
     * again under the result — so this asserts on the count rather than
     * demanding a single match. Using `findByText` here failed on the
     * second copy, which is the behaviour we want.
     */
    await waitFor(() =>
      expect(screen.getAllByText(/not a diagnosis/i).length).toBeGreaterThanOrEqual(2),
    );
  });

  it('refuses to search with nothing selected', async () => {
    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one symptom/i);
    expect(citizenStub.recommend).not.toHaveBeenCalled();
  });

  it('says plainly when nothing nearby can help, instead of an empty list', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'SOON_7D',
      emergency: false,
      adviceEn: 'See a clinician within a week.',
      adviceSw: '',
      facilities: [],
      scope: 'NONE',
      historyFactors: [],
      rulesFired: ['R012'],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    expect(await screen.findByText(/could not find a facility/i)).toBeInTheDocument();
  });
});

/*
 * THE MATCHING SURFACE.
 *
 * The screen is meant to read as intelligent. The risk in making it read
 * that way is that it starts claiming more than a rules engine does, so
 * these pin the line:
 *
 *   - Every step names work the engine really performs.
 *   - The trace is kept AFTER the answer, so a person can interrogate it.
 *   - A gated emergency gets no trace at all — a citizen has no use for a
 *     rule id, and the rule that matched is unreviewed anyway.
 */
describe('smart care matching surface', () => {
  const ROUTINE = {
    urgency: 'SOON_7D',
    emergency: false,
    adviceEn: 'See a clinician within a week.',
    adviceSw: '',
    facilities: [
      { id: 'f1', name: 'Kisumu County Hospital', kephLevel: 4, mflCode: null, locality: null, is24Hour: true, distanceKm: 8 },
      { id: 'f2', name: 'Siaya County Hospital', kephLevel: 4, mflCode: null, locality: null, is24Hour: false, distanceKm: 31 },
    ],
    scope: 'COUNTY',
    historyFactors: [{ label: 'diabetes', capabilities: ['DIABETES_CLINIC'] }],
    rulesFired: ['R102'],
    requiredCapabilities: ['OPD_GENERAL', 'LAB_BASIC', 'DIABETES_CLINIC'],
    disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
  };

  it('shows the reasoning steps, naming work the engine really does', async () => {
    citizenStub.recommend.mockResolvedValue(ROUTINE);

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    expect(await screen.findByText(/Smart care matching/i)).toBeInTheDocument();
    expect(screen.getByText(/Matching your symptoms to care rules/i)).toBeInTheDocument();
    expect(screen.getByText(/Checking your health record/i)).toBeInTheDocument();
    // Counts come from the server's answer, never from a script.
    expect(await screen.findByText(/2 found/i)).toBeInTheDocument();
  });

  it('KEEPS the trace after the answer, so the result can be interrogated', async () => {
    citizenStub.recommend.mockResolvedValue(ROUTINE);

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    const trace = await screen.findByText(/How this was worked out/i);
    await userEvent.click(trace);

    // The rule id, the capabilities, and what the record contributed —
    // the things that make this auditable rather than merely convincing.
    expect(screen.getByText('R102')).toBeInTheDocument();
    expect(screen.getByText(/opd general/i)).toBeInTheDocument();
  });

  it('marks the engine\'s best match rather than making the reader infer it', async () => {
    citizenStub.recommend.mockResolvedValue(ROUTINE);

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fever' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    expect(await screen.findByText(/Best match/i)).toBeInTheDocument();
  });

  it('shows NO trace for a gated emergency', async () => {
    citizenStub.recommend.mockResolvedValue({
      urgency: 'EMERGENCY',
      emergency: true,
      adviceEn: 'Go to the nearest emergency department now.',
      adviceSw: '',
      facilities: [],
      scope: 'NONE',
      historyFactors: [],
      rulesFired: [],
      disclaimer: 'This is guidance on where to seek care, not a diagnosis.',
    });

    await openCareTab();
    await userEvent.click(screen.getByRole('button', { name: 'Chest pain' }));
    await userEvent.click(screen.getByRole('button', { name: /find a facility/i }));

    await screen.findByText(/Go now/i);
    // No rule ids, no capability list — the matched rule is unreviewed and
    // a citizen has no use for it either way.
    expect(screen.queryByText(/How this was worked out/i)).not.toBeInTheDocument();
  });
});
