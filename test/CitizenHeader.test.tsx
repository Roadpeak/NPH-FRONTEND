/**
 * THE CITIZEN'S IDENTITY STRIP.
 *
 * Same shape as the clinician's patient header — one system should look
 * like one system — but the words are deliberately different. A clinician
 * reads "Allergies · Active issues · Medications". This screen is read by
 * someone with no clinical training, possibly worried, possibly in Swahili
 * on a shared handset.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CitizenHeader } from '@/components/CitizenHeader';

const EN = {
  harmful: 'Things that could harm you',
  longTerm: 'Long-term conditions',
  medicines: 'Medicines you take',
  none: 'None recorded',
  yourNumber: 'Your number',
};

const base = {
  name: "Achieng' Wanjala",
  displayNumber: 'NHP-NY0C-GP59',
  age: 34,
  items: [],
  medicines: [],
  labels: EN,
};

describe('the citizen identity strip', () => {
  it('labels the NHP number, rather than showing a bare code', () => {
    render(<CitizenHeader {...base} />);
    // A citizen has no reason to know what a bare NHP number is or why it
    // matters at a counter.
    expect(screen.getByText(/Your number NHP-NY0C-GP59/)).toBeInTheDocument();
  });

  it('THE PLAIN-LANGUAGE RULE — uses no clinical vocabulary', () => {
    const { container } = render(
      <CitizenHeader
        {...base}
        items={[
          { kind: 'ALLERGY', title: 'You are allergic to Penicillin', detail: '', tone: 'critical' },
          { kind: 'CHRONIC', title: 'Your blood pressure is higher than it should be', detail: '', tone: 'caution' },
        ]}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('Things that could harm you');
    // "Allergies", "Active issues" and an ICD code are all things this
    // reader should never have to decode.
    expect(text).not.toMatch(/\bAllergies\b/);
    expect(text).not.toMatch(/\bActive issues\b/);
    // Real ICD-11 codes look like 1F41.0 or BA00.Z. Matched precisely, so
    // the NHP number's own alphanumerics are not a false positive.
    expect(text).not.toMatch(/\b[0-9A-Z]{2}\d{2}\.[0-9A-Z]\b/);
  });

  it('THE MEDICINES BUG — reads medicines from their own array', () => {
    // The summary payload keeps medicines in `dailyMedicines`, NOT in
    // `rightNow`. Filtering `items` for MEDICATION rendered an empty column
    // beside a record that plainly listed two, which is worse than showing
    // nothing: it says "no medicines" to someone who takes two.
    render(
      <CitizenHeader
        {...base}
        items={[{ kind: 'ALLERGY', title: 'You are allergic to Sulfa', detail: '', tone: 'critical' }]}
        medicines={[{ name: 'Amlodipine' }, { name: 'Metformin' }]}
      />,
    );

    expect(screen.getByText(/Amlodipine, Metformin/)).toBeInTheDocument();
  });

  it('marks a severe allergy in form as well as colour', () => {
    const { container } = render(
      <CitizenHeader
        {...base}
        items={[
          { kind: 'ALLERGY', title: 'You are allergic to Penicillin', detail: '', tone: 'critical' },
        ]}
      />,
    );
    // A shared handset in daylight loses hue long before it loses shape.
    expect(container.textContent).toContain('▲');
  });

  it('says "None recorded" rather than leaving a column blank', () => {
    render(<CitizenHeader {...base} />);
    // Blank reads as "failed to load". "None recorded" is a statement.
    expect(screen.getAllByText(EN.none).length).toBe(3);
  });

  it('THE ALWAYS-VISIBLE RULE — nothing collapses', () => {
    const { container } = render(
      <CitizenHeader
        {...base}
        items={[
          { kind: 'ALLERGY', title: 'You are allergic to Penicillin', detail: '', tone: 'critical' },
          { kind: 'ALLERGY', title: 'You are allergic to Sulfa', detail: '', tone: 'caution' },
        ]}
      />,
    );

    // An allergy hidden behind a tap is an allergy nobody mentions at the
    // counter.
    expect(container.querySelectorAll('details, summary')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    // Both listed, not truncated to the first.
    expect(container.textContent).toContain('Penicillin');
    expect(container.textContent).toContain('Sulfa');
  });

  it('renders every label from props, so it translates with the content', () => {
    const SW = {
      harmful: 'Vitu vinavyoweza kukudhuru',
      longTerm: 'Magonjwa ya muda mrefu',
      medicines: 'Dawa unazotumia',
      none: 'Hakuna iliyorekodiwa',
      yourNumber: 'Nambari yako',
    };
    const { container } = render(<CitizenHeader {...base} labels={SW} />);

    // No English may leak through when the reader has chosen Swahili.
    expect(container.textContent).toContain('Vitu vinavyoweza kukudhuru');
    expect(container.textContent).not.toContain('Things that could harm you');
    expect(container.textContent).not.toContain('Your number');
  });

  it('falls back to initials when there is no photograph', () => {
    render(<CitizenHeader {...base} />);
    expect(screen.getByText('AW')).toBeInTheDocument();
  });
});
