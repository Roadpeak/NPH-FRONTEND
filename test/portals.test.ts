/**
 * THE PORTAL MAP.
 *
 * Four portals with four front doors means four chances to send someone to
 * the wrong one — and that failure is invisible in a typecheck, because
 * every path is just a string. It already happened once: `landingFor()` knew
 * only practitioner-vs-citizen, so a Ministry analyst was routed to the
 * citizen screen and met with "this endpoint is for citizen accounts".
 *
 * `portals.ts` is the single description of which portal is which, so this
 * is where that class of bug is caught.
 */
import { describe, it, expect } from 'vitest';
import { PORTALS, PORTAL_LIST, portalFor, type Portal } from '@/lib/portals';

const me = (over: Partial<Parameters<typeof portalFor>[0]> = {}) => ({
  practitionerId: null,
  ministryUserId: null,
  personId: null,
  ...over,
});

describe('routing an account to its portal', () => {
  it('sends a practitioner to the worker portal', () => {
    expect(portalFor(me({ practitionerId: 'p1' })).id).toBe('worker');
  });

  it('sends a Ministry user to the Ministry portal', () => {
    expect(portalFor(me({ ministryUserId: 'm1' })).id).toBe('ministry');
  });

  it('sends a citizen to the citizen portal', () => {
    expect(portalFor(me({ personId: 'x1' })).id).toBe('citizen');
  });

  it('THE PRECEDENCE RULE — a clinician who is also a patient is a clinician', () => {
    // A practitioner account and a citizen account are separate rows for the
    // same human being. Asking "has a person id" first would land every
    // clinician on the citizen screen — the original bug, in a new place.
    const both = me({ practitionerId: 'p1', personId: 'x1' });
    expect(portalFor(both).id).toBe('worker');
  });

  it('prefers Ministry over citizen when both are somehow set', () => {
    expect(portalFor(me({ ministryUserId: 'm1', personId: 'x1' })).id).toBe('ministry');
  });

  it('falls back to the citizen portal rather than throwing', () => {
    // An account with no recognised role must still land somewhere. A thrown
    // error here would be a blank screen straight after a correct sign-in.
    expect(portalFor(me()).id).toBe('citizen');
  });
});

describe('the portal definitions', () => {
  it('gives every portal a distinct base path', () => {
    const paths = PORTAL_LIST.map((p) => p.basePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every portal its own sign-in', () => {
    const paths = PORTAL_LIST.map((p) => p.signInPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of PORTAL_LIST) {
      expect(p.signInPath, p.id).toMatch(/^\/[a-z]+\/login$/);
    }
  });

  it('THE MINISTRY RULE — the Ministry portal offers no self-registration', () => {
    // A national-scope account reaches every county's aggregates. An open
    // form for that role would be the softest target in the system.
    expect(PORTALS.ministry.selfRegistration).toBe(false);
    // And its "register" path must not be a registration form.
    expect(PORTALS.ministry.registerPath).toBe(PORTALS.ministry.signInPath);
  });

  it('lets the other three portals register', () => {
    for (const id of ['citizen', 'worker', 'facility'] as const) {
      expect(PORTALS[id].selfRegistration, id).toBe(true);
      expect(PORTALS[id].registerPath, id).toMatch(/\/register$/);
    }
  });

  it('names every portal in Swahili as well as English', () => {
    // The chooser is exactly where someone decides the system is not for
    // them. An empty Swahili string renders as a blank line, not a fallback.
    for (const p of PORTAL_LIST) {
      expect(p.nameSw.trim(), p.id).not.toBe('');
      expect(p.blurbSw.trim(), p.id).not.toBe('');
    }
  });

  it('describes what you can do, not what you are', () => {
    // A blurb of "For citizens" tells a nurse nothing about which door is
    // theirs. Each should name an action.
    for (const p of PORTAL_LIST) {
      expect(p.blurb.length, p.id).toBeGreaterThan(20);
    }
  });

  it('lists every defined portal exactly once', () => {
    const ids = PORTAL_LIST.map((p: Portal) => p.id).sort();
    expect(ids).toEqual(Object.keys(PORTALS).sort());
  });
});
