/**
 * THE OFFICIAL-WEBSITE BANNER.
 *
 * A health portal that asks for a National ID and a password is exactly
 * what a phishing site imitates. A constant, unmissable band at the top of
 * the real one gives people something to look for — which only works if it
 * is on EVERY page and never moves.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GovBanner } from '@/components/GovBanner';

describe('the government banner', () => {
  it('states plainly that this is an official site', () => {
    render(<GovBanner />);
    expect(
      screen.getByText(/an official website of the kenyan government/i),
    ).toBeInTheDocument();
  });

  it('shows the flag before the text', () => {
    const { container } = render(<GovBanner />);
    const svg = container.querySelector('svg');
    const text = screen.getByText(/official website/i);

    expect(svg).toBeTruthy();
    // Order matters: the flag is the thing recognised at a glance, before
    // any of the words are read.
    expect(svg!.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks the flag decorative, since the text carries the meaning', () => {
    const { container } = render(<GovBanner />);
    // A screen reader announcing "flag" adds nothing to a sentence that
    // already says which government.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('runs edge to edge, and is not interactive', () => {
    const { container } = render(<GovBanner />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.className).toContain('w-full');
    // A mark of provenance, not a message competing with the page: nothing
    // here should invite a click.
    expect(container.querySelectorAll('a, button')).toHaveLength(0);
  });
});
