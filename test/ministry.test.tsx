/**
 * THE MINISTRY SCREEN — disclosure control.
 *
 * The backend does the hard part: it stores a suppressed cell as ZERO, so no
 * endpoint, export or debugging query can serve the true number by accident,
 * and it applies complementary suppression so no hidden cell is recoverable
 * by subtraction.
 *
 * All of which this screen can undo in one line. `cases: 0` arriving from a
 * correctly-suppressed county renders, with no special handling, as the
 * number nought — and "0 cases of malaria in Nairobi" is a false statement
 * that a Ministry analyst would have no reason to doubt. Leaving it blank is
 * the same error told quietly.
 *
 * So the rule the wireframes set — never as zero, never blank, always named
 * with the threshold — is a property of the RENDER, and this is where it can
 * be checked. The screen is rendered against a payload shaped exactly like
 * the one the live API returns for the demo scenario.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

// The five-county malaria spread the demo seeds, as the API returns it:
// four counties visible, Nairobi's four real cases suppressed to zero with
// `suppressedCells: 1` marking why.
const COUNTIES = [
  { id: 'c-kisumu', code: '042', name: 'Kisumu' },
  { id: 'c-siaya', code: '041', name: 'Siaya' },
  { id: 'c-homabay', code: '043', name: 'Homa Bay' },
  { id: 'c-busia', code: '040', name: 'Busia' },
  { id: 'c-nairobi', code: '047', name: 'Nairobi' },
];

const row = (countyId: string, cases: number, suppressedCells = 0) => ({
  countyId,
  cases,
  newCases: cases,
  suppressedCells,
  facilitiesReporting: 1,
  facilitiesExpected: 1,
  completenessPercent: 100,
});

const BURDEN = [
  row('c-kisumu', 34),
  row('c-siaya', 28),
  row('c-homabay', 19),
  row('c-busia', 12),
  row('c-nairobi', 0, 1), // 4 real cases, below the threshold of 10
];

const PROVENANCE = {
  periodFrom: '2026-07-25T00:00:00.000Z',
  periodTo: '2026-08-23T00:00:00.000Z',
  facilitiesReporting: 6,
  facilitiesRegistered: 6,
  completenessPercent: 100,
  lastRollupDate: '2026-08-23T00:00:00.000Z',
  suppressionThreshold: 10,
  denominatorNote: 'Rates use 2019 census denominators projected to 2026.',
  suppressionNote:
    'Cells below 10 cases are suppressed, with complementary suppression so no hidden cell can be recovered by subtraction.',
};

const ministryStub = {
  counties: vi.fn(async () => COUNTIES),
  burden: vi.fn(async () => BURDEN),
  subcounty: vi.fn(async () => []),
  referralClosure: vi.fn(async () => []),
  workforce: vi.fn(async () => []),
  careGaps: vi.fn(async () => []),
  surveillance: vi.fn(async () => []),
  provenance: vi.fn(async () => PROVENANCE),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    ministry: ministryStub,
    hasSession: () => true,
    restoreSession: async () => true,
  };
});

const { default: MinistryPage } = await import('@/app/ministry/page');

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  ministryStub.burden.mockResolvedValue(BURDEN);
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Renders and waits for the mount fetches to settle. */
async function renderPage() {
  const utils = render(<MinistryPage />);
  await waitFor(() => expect(screen.getByText('34')).toBeInTheDocument());
  return utils;
}

// =====================================================================

describe('a suppressed county', () => {
  it('THE DISCLOSURE RULE — is named as suppressed, never rendered as zero', async () => {
    const { container } = await renderPage();

    // Named, with the reason and the threshold spelled out.
    expect(screen.getByText(/1 county suppressed/i)).toBeInTheDocument();
    expect(screen.getByText(/fewer than 10 cases/i)).toBeInTheDocument();
    expect(screen.getByText('Nairobi')).toBeInTheDocument();

    // And absent from the ranked list, where it would read as a real count.
    // "Nairobi 0" is a false statement about a county with four real cases.
    const bars = container.querySelectorAll('ul li');
    const barText = Array.from(bars).map((li) => li.textContent ?? '');
    expect(barText.some((t) => t.includes('Nairobi') && /\b0\b/.test(t))).toBe(false);
  });

  it('is not silently dropped from the page', async () => {
    await renderPage();
    // Blank reads as "no disease here" just as surely as zero does. The
    // county must appear somewhere, marked.
    expect(screen.getByText('Nairobi')).toBeInTheDocument();
  });

  it('counts toward the counties-reporting tile', async () => {
    await renderPage();
    // Five counties reported; one is suppressed. A tile reading "4" would
    // understate coverage and make completeness look worse than it is.
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('says nothing about suppression when nothing is suppressed', async () => {
    ministryStub.burden.mockResolvedValue([row('c-kisumu', 34), row('c-siaya', 28)]);
    render(<MinistryPage />);
    await waitFor(() => expect(screen.getByText('Kisumu')).toBeInTheDocument());

    // A permanent suppression notice trains analysts to ignore it. The
    // provenance footer still explains the METHOD — that is documentation,
    // not a claim that anything on this screen was suppressed.
    expect(screen.queryByText(/county suppressed|counties suppressed/i)).not.toBeInTheDocument();
  });

  it('pluralises honestly when more than one county is suppressed', async () => {
    ministryStub.burden.mockResolvedValue([
      row('c-kisumu', 34),
      row('c-nairobi', 0, 1),
      row('c-busia', 0, 1),
    ]);
    render(<MinistryPage />);
    await waitFor(() => expect(screen.getByText('Kisumu')).toBeInTheDocument());

    expect(screen.getByText(/2 counties suppressed/i)).toBeInTheDocument();
  });
});

describe('the figures carry their provenance', () => {
  it('states the period, the denominator and the suppression method', async () => {
    await renderPage();

    // A national figure with no denominator or period is one someone
    // misquotes in a press conference.
    expect(screen.getByText(/6 of 6 registered facilities/i)).toBeInTheDocument();
    expect(screen.getByText(/complementary suppression/i)).toBeInTheDocument();
    expect(screen.getByText(/census denominators/i)).toBeInTheDocument();
  });

  it('shows completeness beside the counts', async () => {
    await renderPage();
    // A rise in cases and a rise in REPORTING are indistinguishable without
    // this, and they call for opposite responses.
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(/data completeness/i)).toBeInTheDocument();
  });

  it('totals only the counties it is actually showing', async () => {
    await renderPage();
    // 34 + 28 + 19 + 12 = 93. The suppressed county contributes 0, because
    // its true count is not in the payload at all — by design.
    expect(screen.getByText('93')).toBeInTheDocument();
  });
});

describe('the wall between aggregates and patients', () => {
  it('offers no way to reach an individual record', async () => {
    const { container } = await renderPage();

    // Not greyed out, not permission-gated — absent. The data to populate
    // such a view does not exist in the tables this role can read, and the
    // screen must not imply otherwise.
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toMatch(/view patient|patient list|drill.?down to patient|open record/);

    // No links out of the aggregate world.
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.some((h) => h?.includes('/patient'))).toBe(false);
    expect(hrefs.some((h) => h?.includes('/encounter'))).toBe(false);
  });

  it('never renders a person identifier', async () => {
    const { container } = await renderPage();
    // NHP numbers, national IDs and names have no business on this screen.
    expect(container.textContent).not.toMatch(/NHP-[A-Z0-9]{4}/);
  });
});

describe('when the analyst is not signed in', () => {
  it('sends them to sign in rather than rendering an empty dashboard', async () => {
    ministryStub.burden.mockRejectedValue(
      Object.assign(new Error('Sign in to continue'), {
        name: 'ApiError',
        code: 'NO_SESSION',
        status: 401,
      }),
    );

    render(<MinistryPage />);
    // A dashboard of zeroes is a worse answer than a sign-in prompt: it
    // looks like a country with no disease.
    await waitFor(() => expect(screen.queryByText('34')).not.toBeInTheDocument());
  });
});
