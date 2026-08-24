/**
 * THE CLINICAL SAFETY BANNER.
 *
 * The component's own header carries an instruction: "DO NOT make this
 * collapsible, tabbed, or conditionally rendered." That is a design decision
 * with a clinical reason behind it — every "allergy was visible but missed"
 * incident in the literature traces to hiding it behind a disclosure — and a
 * comment cannot stop anyone.
 *
 * These tests turn that comment into something that fails a build. The
 * pressure the header predicts is real: the banner costs vertical space, and
 * the obvious way to fit more of the encounter form on screen is to collapse
 * it. When someone tries, this file is what tells them not to.
 *
 * They are not screenshot tests. They assert the properties that make the
 * banner do its job: that it is always rendered, that severity is encoded in
 * form and not only in colour, and that the withholding rule holds.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafetyBanner, type SafetyBannerProps } from '@/components/SafetyBanner';

const anaphylaxis = {
  substanceLabel: 'Penicillin',
  severity: 'ANAPHYLAXIS' as const,
  reaction: 'anaphylaxis',
};
const mild = {
  substanceLabel: 'Dust',
  severity: 'MILD' as const,
  reaction: 'sneezing',
};

const props = (over: Partial<SafetyBannerProps> = {}): SafetyBannerProps => ({
  allergies: [],
  medications: [],
  chronicConditions: [],
  ...over,
});

// =====================================================================

describe('it is always there', () => {
  it('renders even when the patient has nothing recorded', () => {
    render(<SafetyBanner {...props()} />);

    // An empty banner is not the same as no banner: "None recorded" is a
    // clinical statement a clinician can rely on. A missing banner is
    // indistinguishable from a banner that failed to load.
    expect(screen.getByLabelText(/critical patient safety information/i)).toBeInTheDocument();
    expect(screen.getAllByText(/none recorded/i).length).toBeGreaterThan(0);
  });

  it('exposes no control that could hide it', () => {
    const { container } = render(
      <SafetyBanner {...props({ allergies: [anaphylaxis, mild] })} />,
    );

    // The failure mode this guards against is a future edit adding a
    // "collapse" or "show more" affordance to reclaim vertical space.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('details, summary')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    expect(container.querySelectorAll('[hidden]')).toHaveLength(0);
  });

  it('renders every allergy, with no truncation or overflow cutoff', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      substanceLabel: `Substance ${i}`,
      severity: 'SEVERE' as const,
      reaction: 'rash',
    }));
    render(<SafetyBanner {...props({ allergies: many })} />);

    // "+3 more" behind a click is the same failure as collapsing: the
    // allergy that kills is as likely to be the eighth as the first.
    for (const a of many) {
      expect(screen.getByText(a.substanceLabel)).toBeInTheDocument();
    }
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument();
  });
});

describe('severity reads without colour', () => {
  it('marks a severe allergy with a different glyph than a mild one', () => {
    const { container } = render(
      <SafetyBanner {...props({ allergies: [anaphylaxis, mild] })} />,
    );

    const text = container.textContent ?? '';
    // Roughly 8% of men have a colour vision deficiency, and a phone in
    // Kenyan daylight washes out hue long before it washes out shape.
    expect(text).toContain('▲'); // severe
    expect(text).toContain('●'); // not severe
  });

  it('states the severity in words, not only as a glyph', () => {
    render(<SafetyBanner {...props({ allergies: [anaphylaxis] })} />);
    // A symbol whose meaning is not written down is a legend the clinician
    // has to have memorised.
    expect(screen.getByText(/ANAPHYLAXIS/)).toBeInTheDocument();
  });

  it('treats SEVERE and ANAPHYLAXIS alike, and MODERATE as not severe', () => {
    const glyphs = (severity: SafetyBannerProps['allergies'][number]['severity']) => {
      const { container, unmount } = render(
        <SafetyBanner {...props({ allergies: [{ substanceLabel: 'X', severity }] })} />,
      );
      const text = container.textContent ?? '';
      unmount();
      return text;
    };

    expect(glyphs('ANAPHYLAXIS')).toContain('▲');
    expect(glyphs('SEVERE')).toContain('▲');
    // MODERATE is not in the severe set — a banner that shouts at everything
    // is one clinicians learn to ignore.
    expect(glyphs('MODERATE')).toContain('●');
    expect(glyphs('MILD')).toContain('●');
  });
});

describe('the withholding rule', () => {
  it('says restricted records EXIST without showing them', () => {
    render(<SafetyBanner {...props({ restrictedRecordsExist: true })} />);

    // The whole point of the tier: a clinician who knows something is
    // withheld can ask the patient or use emergency access. One who does
    // not know assumes the record is complete and prescribes accordingly.
    expect(screen.getByText(/restricted records exist/i)).toBeInTheDocument();
    expect(screen.getByText(/ask the patient|emergency access/i)).toBeInTheDocument();
  });

  it('says nothing at all when there is nothing withheld', () => {
    render(<SafetyBanner {...props({ restrictedRecordsExist: false })} />);
    // A permanent "records may be restricted" notice teaches clinicians to
    // ignore it, which costs the signal exactly when it matters.
    expect(screen.queryByText(/restricted records exist/i)).not.toBeInTheDocument();
  });

  it('never names the withheld condition', () => {
    const { container } = render(
      <SafetyBanner
        {...props({
          restrictedRecordsExist: true,
          chronicConditions: [{ icd11Title: 'Type 2 diabetes mellitus' }],
        })}
      />,
    );

    // Tier 3 categories must not leak through this banner. Only the fact of
    // withholding is disclosed, never the subject.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/HIV|mental|substance|reproduct/i);
  });
});

describe('what it shows', () => {
  it('shows current medications with dose and frequency', () => {
    render(
      <SafetyBanner
        {...props({
          medications: [
            { genericName: 'Metformin', doseAmount: 500, doseUnit: 'mg', frequency: 'BD' },
          ],
        })}
      />,
    );

    expect(screen.getByText('Metformin')).toBeInTheDocument();
    // A drug name with no dose cannot be checked against what the clinician
    // is about to prescribe.
    expect(screen.getByText(/500mg BD/)).toBeInTheDocument();
  });

  it('shows pregnancy beside the allergies, not buried in a problem list', () => {
    render(<SafetyBanner {...props({ alerts: ['Pregnant · 24 weeks'] })} />);
    // It changes drug safety for almost everything, so it belongs where the
    // eye already goes.
    expect(screen.getByText(/pregnant · 24 weeks/i)).toBeInTheDocument();
  });

  it('counts the allergies so a truncated render is obvious', () => {
    render(<SafetyBanner {...props({ allergies: [anaphylaxis, mild] })} />);
    expect(screen.getByText(/allergies · 2/i)).toBeInTheDocument();
  });
});
