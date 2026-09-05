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
import { PORTALS, PORTAL_LIST, portalFor, refusalFor, type Portal } from '@/lib/portals';

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

/*
 * The facility administrator.
 *
 * The one case the account alone cannot settle. They hold a practitioner
 * id, because that is what keeps the licence checks and the audit trail
 * applying to them — so before this, every administrator signing in at
 * the facility door landed in the clinical portal instead.
 */
describe('routing a facility administrator', () => {
  it('sends them to the facility portal when they came through its door', () => {
    expect(
      portalFor({ ...me({ practitionerId: 'p1' }), facilityAdminOf: 'f1' }, PORTALS.facility).id,
    ).toBe('facility');
  });

  it('keeps them in the clinical portal when they signed in there', () => {
    // At a small clinic the same person runs the place and sees patients.
    // Neither portal is wrong, so the door they chose decides.
    expect(
      portalFor({ ...me({ practitionerId: 'p1' }), facilityAdminOf: 'f1' }, PORTALS.worker).id,
    ).toBe('worker');
  });

  it('does not strand an ordinary clinician at the facility door', () => {
    // They administer nothing. Sending them to a portal that would refuse
    // every route would be a permission wall through no fault of theirs.
    expect(
      portalFor({ ...me({ practitionerId: 'p1' }), facilityAdminOf: null }, PORTALS.facility).id,
    ).toBe('worker');
  });

  it('still routes with no portal given at all', () => {
    expect(portalFor({ ...me({ practitionerId: 'p1' }), facilityAdminOf: 'f1' }).id).toBe('worker');
  });
});

/*
 * Where each portal actually puts you.
 *
 * Signing in must land on a workspace. The facility portal landed on its
 * own public welcome page instead, which greeted somebody who had just
 * signed in with a "Sign in" button — a fault no server-side test could
 * have caught, because every route involved answered correctly.
 *
 * `basePath` is excluded: the Ministry portal serves its dashboard at
 * `/ministry` and its public page at `/ministry/welcome`, so there the
 * two genuinely coincide.
 */
describe('every portal lands on a workspace, not a sign-in screen', () => {
  it.each(PORTAL_LIST.map((p) => [p.id, p] as const))(
    '%s does not land back on its own sign-in or registration page',
    (_id, portal: Portal) => {
      expect(portal.landingPath).not.toBe(portal.signInPath);
      expect(portal.landingPath).not.toBe(portal.registerPath);
    },
  );

  it('sends a facility administrator to the reception desk', () => {
    // Named explicitly, because "not the sign-in page" was already true of
    // the broken value and would not have caught it.
    expect(PORTALS.facility.landingPath).toBe('/facility/reception');
  });
});

describe('routing a director who is not a clinician', () => {
  it('lands on the facility portal, not the citizen one', () => {
    // A hospital owner is usually a businessperson. With no practitionerId
    // they used to fall through to the citizen portal — the facility portal
    // was literally unreachable for the people who own the facilities.
    expect(
      portalFor({
        practitionerId: null,
        ministryUserId: null,
        personId: 'p1',
        facilityDirectorOf: 'f1',
      }).id,
    ).toBe('facility');
  });

  it('still sends a plain citizen to their own record', () => {
    expect(
      portalFor({ practitionerId: null, ministryUserId: null, personId: 'p1' }).id,
    ).toBe('citizen');
  });

  it('does not override a Ministry account', () => {
    // A Ministry user who also directs a facility is at work when they sign
    // in to the Ministry portal; national scope is the stronger claim.
    expect(
      portalFor({
        practitionerId: null,
        ministryUserId: 'm1',
        personId: 'p1',
        facilityDirectorOf: 'f1',
      }).id,
    ).toBe('ministry');
  });
});

/**
 * A SIGN-IN LANDS WHERE IT WAS AIMED, OR IS REFUSED.
 *
 * Silently redirecting somebody to a different portal is the worst of both
 * outcomes: they typed the facility address, gave correct credentials, and
 * arrived on their own medical record with no explanation — which reads as
 * the system being broken rather than as "you do not work at a facility".
 */
describe('entering the portal you actually asked for', () => {
  const nobody = { practitionerId: null, ministryUserId: null, personId: 'p1' };

  it('refuses a plain citizen at the facility door', () => {
    const refusal = refusalFor(nobody, PORTALS.facility);
    expect(refusal).toMatch(/not linked to a facility/i);
  });

  it('lets a director in at the facility door', () => {
    expect(refusalFor({ ...nobody, facilityDirectorOf: 'f1' }, PORTALS.facility)).toBeNull();
  });

  it('lets a facility administrator in at the facility door', () => {
    expect(
      refusalFor(
        { practitionerId: 'pr1', ministryUserId: null, personId: null, facilityAdminOf: 'f1' },
        PORTALS.facility,
      ),
    ).toBeNull();
  });

  it('refuses a citizen at the health worker door', () => {
    expect(refusalFor(nobody, PORTALS.worker)).toMatch(/no practising licence/i);
  });

  it('refuses anybody without a Ministry account at the Ministry door', () => {
    expect(refusalFor(nobody, PORTALS.ministry)).toMatch(/issued by the Ministry/i);
  });

  it('lets a citizen read their own record', () => {
    expect(refusalFor(nobody, PORTALS.citizen)).toBeNull();
  });

  it('THE DOOR WINS once entry is allowed', () => {
    // A clinician who also directs a facility signed in at the facility
    // door: they meant the facility, and they belong there.
    const both = {
      practitionerId: 'pr1',
      ministryUserId: null,
      personId: null,
      facilityAdminOf: 'f1',
    };
    expect(portalFor(both, PORTALS.facility).id).toBe('facility');
    // The same account at the worker door goes to the worker portal.
    expect(portalFor(both, PORTALS.worker).id).toBe('worker');
  });
});
