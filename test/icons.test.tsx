/**
 * THE ICON VOCABULARY.
 *
 * Icons are an anchor, never the message. Two rules follow from the
 * audience — clinicians on shared desktops, citizens on mid-range Android
 * phones, roughly 78% adult literacy:
 *
 *   1. An icon never REPLACES a label. Someone who cannot decode a
 *      pictogram still reads the sentence.
 *   2. An icon is never the only carrier of severity. The banner encodes it
 *      in shape, weight and colour too; an SVG that fails to load must not
 *      take the warning with it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon, IconLabel, Icons } from '@/components/icons';
import { ADMIN_SECTIONS } from '@/lib/adminSections';

describe('the icon vocabulary', () => {
  it('THE DECORATIVE RULE — every icon is hidden from screen readers', () => {
    const { container } = render(<Icon name="allergy" />);
    // The label beside it already says the thing; announcing both would say
    // it twice, and announcing "triangle" says nothing useful.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('THE LABEL RULE — an icon never stands alone', () => {
    render(<IconLabel name="allergy">Allergies</IconLabel>);
    // The words carry the meaning, for a reader who cannot decode a glyph.
    expect(screen.getByText('Allergies')).toBeInTheDocument();
  });

  it('gives every admin section an icon', () => {
    for (const s of ADMIN_SECTIONS) {
      expect(s.icon, s.id).toBeTruthy();
      // Named by meaning and resolvable — a typo would render nothing at
      // all, which reads as a broken page rather than a missing icon.
      expect(Object.keys(Icons), s.id).toContain(s.icon);
    }
  });

  it('names icons by meaning, not by shape', () => {
    // `Icons.allergy` can change glyph without touching a component;
    // `Icons.triangle` could not.
    for (const key of ['allergy', 'medication', 'condition', 'family', 'access']) {
      expect(Object.keys(Icons)).toContain(key);
    }
    expect(Object.keys(Icons)).not.toContain('triangle');
  });

  it('uses one glyph per meaning across the system', () => {
    // A triangle that means "danger" on one screen and "information" on
    // another teaches people to ignore it.
    expect(Icons.allergy).not.toBe(Icons.condition);
    expect(Icons.confirmed).not.toBe(Icons.notConfirmed);
  });
});
