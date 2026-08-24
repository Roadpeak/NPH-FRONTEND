/**
 * THE PATIENT IDENTITY STRIP.
 *
 * Takes its shape from the EMR reference: photograph, name, then the
 * clinical facts as inline labelled columns. It is a summary a clinician
 * reads while walking to the patient — it does NOT replace the SafetyBanner
 * below it, and nothing in it collapses.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PatientHeader } from '@/components/PatientHeader';

const base = {
  displayNumber: 'NHP-AB12-CD34',
  givenName: 'Grace',
  familyName: 'Achieng',
  age: 32,
  sexAtBirth: 'FEMALE',
  allergies: [],
  medications: [],
  chronicConditions: [],
};

describe('the identity strip', () => {
  it('shows who the patient is', () => {
    render(<PatientHeader {...base} />);
    expect(screen.getByText('Grace Achieng')).toBeInTheDocument();
    expect(screen.getByText(/NHP-AB12-CD34/)).toBeInTheDocument();
  });

  it('falls back to initials when there is no photograph', () => {
    render(<PatientHeader {...base} />);
    // A broken image icon reads as a failure; initials read as "no photo".
    expect(screen.getByText('GA')).toBeInTheDocument();
  });

  it('shows the photograph when there is one', () => {
    render(<PatientHeader {...base} photo="data:image/jpeg;base64,AAAA" />);
    const img = screen.getByAltText('Grace Achieng') as HTMLImageElement;
    expect(img.src).toContain('data:image/jpeg');
  });

  it('THE SEVERITY RULE — a severe allergy reads in form, not only colour', () => {
    const { container } = render(
      <PatientHeader
        {...base}
        allergies={[{ substanceLabel: 'Penicillin', severity: 'ANAPHYLAXIS' }]}
      />,
    );
    // A phone in Kenyan daylight washes out hue long before it washes out
    // shape.
    expect(container.textContent).toContain('▲');
    expect(screen.getByText(/Penicillin/)).toBeInTheDocument();
  });

  it('says "None recorded", never leaves the allergy column blank', () => {
    render(<PatientHeader {...base} />);
    // Blank is indistinguishable from "failed to load"; "None recorded" is
    // a clinical statement a clinician can act on.
    expect(screen.getAllByText(/none recorded/i).length).toBeGreaterThan(0);
  });

  it('THE ALWAYS-VISIBLE RULE — nothing here collapses', () => {
    const { container } = render(
      <PatientHeader
        {...base}
        allergies={[
          { substanceLabel: 'Penicillin', severity: 'ANAPHYLAXIS' },
          { substanceLabel: 'Sulfa', severity: 'MODERATE' },
        ]}
        chronicConditions={[{ icd11Title: 'Asthma' }]}
      />,
    );

    // The reference design puts sections behind "Show ▾". Allergies must
    // never be one of them: every "allergy was visible but missed" incident
    // traces to exactly that change.
    expect(container.querySelectorAll('details, summary')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    expect(container.querySelectorAll('[hidden]')).toHaveLength(0);

    // Every allergy is listed, not truncated to the first.
    expect(container.textContent).toContain('Penicillin');
    expect(container.textContent).toContain('Sulfa');
  });

  it('renders the actions it is given', () => {
    render(<PatientHeader {...base} actions={<button>Not my patient</button>} />);
    expect(screen.getByRole('button', { name: /not my patient/i })).toBeInTheDocument();
  });
});
