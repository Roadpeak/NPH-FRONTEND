/**
 * WHICH ADMIN SECTIONS A ROLE MAY OPEN.
 *
 * The Ministry portal is the platform administrator and its roles operate
 * different sectors, so the navigation is built from the signed-in role
 * rather than being a fixed list with disabled entries.
 *
 * That distinction matters more than it looks. A greyed-out "Audit" tab
 * tells an analyst that an audit queue exists and that they are not trusted
 * with it — a disclosure and an invitation in one. A section a role cannot
 * open must be ABSENT.
 *
 * This mirrors the server's `requireMinistry(ctx, roles)` and does not
 * replace it. The tests below check the mirror stays true, and in particular
 * that it fails closed the same way the server does.
 */
import { describe, it, expect } from 'vitest';
import {
  ADMIN_SECTIONS,
  canOpen,
  sectionsFor,
  type AdminSection,
} from '@/lib/adminSections';

const byId = (id: string) => ADMIN_SECTIONS.find((s) => s.id === id) as AdminSection;
const idsFor = (role: string | null) => sectionsFor(role).map((s) => s.id);

describe('the section matrix', () => {
  it('gives a REGISTRAR the register, not the audit queue', () => {
    const ids = idsFor('REGISTRAR');
    expect(ids).toContain('facilities');
    expect(ids).toContain('postings');
    expect(ids).toContain('licences');
    // Approving facilities is not a reason to read who opened a record
    // under emergency access.
    expect(ids).not.toContain('audit');
    expect(ids).not.toContain('analytics');
  });

  it('gives an AUDITOR the audit queue and nothing administrative', () => {
    const ids = idsFor('AUDITOR');
    expect(ids).toContain('audit');
    expect(ids).not.toContain('facilities');
    expect(ids).not.toContain('postings');
  });

  it('gives an ANALYST analytics and nothing else but the overview', () => {
    expect(idsFor('ANALYST').sort()).toEqual(['analytics', 'overview']);
  });

  it('gives SURVEILLANCE its own section only', () => {
    expect(idsFor('SURVEILLANCE').sort()).toEqual(['overview', 'surveillance']);
  });

  it('gives SUPER_ADMIN every section', () => {
    expect(idsFor('SUPER_ADMIN')).toEqual(ADMIN_SECTIONS.map((s) => s.id));
  });

  it('THE FAIL-CLOSED RULE — no role opens only the overview', () => {
    // Matches the server: a token with no role claim satisfies nothing.
    // Treating "no role" as "all roles" is the mistake that would render an
    // audit queue to an analyst.
    expect(idsFor(null)).toEqual(['overview']);
    expect(idsFor(undefined as never)).toEqual(['overview']);
    expect(idsFor('')).toEqual(['overview']);
  });

  it('refuses an unrecognised role rather than falling through', () => {
    expect(idsFor('NOT_A_REAL_ROLE')).toEqual(['overview']);
  });

  it('leaves the overview open to every role, since it is the landing', () => {
    for (const role of ['ANALYST', 'REGISTRAR', 'SURVEILLANCE', 'AUDITOR', 'SUPER_ADMIN']) {
      expect(canOpen(byId('overview'), role), role).toBe(true);
    }
  });

  it('never leaves a role with nothing to land on', () => {
    // A signed-in administrator who sees an empty navigation reads it as a
    // broken page, not as a permission boundary.
    for (const role of [null, 'ANALYST', 'REGISTRAR', 'SURVEILLANCE', 'AUDITOR']) {
      expect(sectionsFor(role).length, String(role)).toBeGreaterThan(0);
    }
  });
});

describe('the section definitions', () => {
  it('describes each section in a sentence an administrator can act on', () => {
    for (const s of ADMIN_SECTIONS) {
      expect(s.blurb.length, s.id).toBeGreaterThan(20);
      expect(s.label.trim(), s.id).not.toBe('');
    }
  });

  it('has no duplicate ids', () => {
    const ids = ADMIN_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('states the ownership rule where postings are described', () => {
    // The rule that decides who may staff a facility belongs where someone
    // is about to try: the Ministry posts to public facilities only.
    expect(byId('postings').blurb).toMatch(/private facilities engage their own/i);
  });
});
