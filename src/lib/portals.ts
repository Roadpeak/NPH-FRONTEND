/**
 * The four portals.
 *
 * NHP is one system with four audiences, and they have almost nothing in
 * common: a citizen reading their own record on a shared handset, a nurse
 * recording an encounter between patients, a facility administrator managing
 * staff, and a Ministry analyst reading national aggregates.
 *
 * Each gets its own front door — its own sign-in, its own registration, its
 * own landing. What they share is the auth MODULE underneath, not the page:
 * one place where tokens, refresh and CSRF are handled, so a session bug has
 * one home rather than four.
 *
 * This file is the single description of which portal is which. A screen
 * that needs to know "where does this role belong" asks here rather than
 * hard-coding a path, so adding a portal is one edit and not a search.
 */

export type PortalId = 'citizen' | 'worker' | 'facility' | 'ministry';

export interface Portal {
  id: PortalId;
  /** What this audience calls itself, not what the system calls them. */
  name: string;
  nameSw: string;
  /**
   * The name set large on the welcome screen, under "Welcome to NHP".
   * Written as a portal name — "Citizen Portal" — because that is what the
   * person arriving needs to recognise in one glance.
   */
  welcomeName: string;
  /** One line, for the chooser. Says what you can do, not what you are. */
  blurb: string;
  blurbSw: string;
  basePath: string;
  signInPath: string;
  registerPath: string;
  /** Where a signed-in member of this portal lands. */
  landingPath: string;
  /** Whether anyone can create this kind of account themselves. */
  selfRegistration: boolean;
}

export const PORTALS: Record<PortalId, Portal> = {
  citizen: {
    id: 'citizen',
    welcomeName: 'Citizen Portal',
    name: 'Citizens',
    nameSw: 'Wananchi',
    blurb: 'See your health record, your visits, and who has opened it.',
    blurbSw: 'Ona rekodi yako ya afya, matembezi yako, na nani ameifungua.',
    basePath: '/citizen',
    signInPath: '/citizen/login',
    registerPath: '/citizen/register',
    landingPath: '/me',
    selfRegistration: true,
  },
  worker: {
    id: 'worker',
    welcomeName: 'Health Workers Portal',
    name: 'Health workers',
    nameSw: 'Wahudumu wa afya',
    blurb: 'Record encounters, prescribe, and read the patients you treat.',
    blurbSw: 'Andika matibabu, agiza dawa, na soma rekodi za wagonjwa wako.',
    basePath: '/worker',
    signInPath: '/worker/login',
    registerPath: '/worker/register',
    landingPath: '/encounter',
    selfRegistration: true,
  },
  facility: {
    id: 'facility',
    welcomeName: 'Health Facility Portal',
    name: 'Health facilities',
    nameSw: 'Vituo vya afya',
    blurb: 'Register a facility, manage its staff and its services.',
    blurbSw: 'Sajili kituo, simamia wafanyakazi na huduma zake.',
    basePath: '/facility',
    signInPath: '/facility/login',
    registerPath: '/facility/register',
    // The reception desk, not the front door. Every other portal lands on
    // a workspace; this one landed on its own marketing page, which
    // offered "Sign in" to somebody who had just signed in.
    landingPath: '/facility/reception',
    selfRegistration: true,
  },
  ministry: {
    id: 'ministry',
    welcomeName: 'Ministry Portal',
    name: 'Ministry of Health',
    nameSw: 'Wizara ya Afya',
    blurb: 'National statistics, facility approvals and staff postings.',
    blurbSw: 'Takwimu za kitaifa, idhini ya vituo na uwekaji wa wafanyakazi.',
    basePath: '/ministry',
    signInPath: '/ministry/login',
    registerPath: '/ministry/login',
    landingPath: '/ministry',
    // Deliberately false. A Ministry account carries national scope over
    // every county's data; it is issued, never self-created. An open
    // registration form for this role would be the softest target in the
    // system.
    selfRegistration: false,
  },
};

export const PORTAL_LIST: Portal[] = [
  PORTALS.citizen,
  PORTALS.worker,
  PORTALS.facility,
  PORTALS.ministry,
];

/**
 * Which portal a signed-in account belongs to.
 *
 * Order matters. A practitioner account and a citizen account are separate
 * rows for the same human being, so "has a practitioner id" must be asked
 * before "has a person id" or every clinician lands on the citizen screen.
 *
 * A facility administrator is the one case the account alone cannot
 * settle. They ARE a practitioner — that is what keeps the licence checks
 * and audit trail applying to them — and at a small clinic the same person
 * both runs the place and sees patients, so neither portal is wrong. The
 * door they signed in through decides: someone who went to the facility
 * sign-in wants the facility portal, and everyone else keeps the clinical
 * one they had before.
 *
 * A DIRECTOR is the case that needs no deciding. A hospital owner is
 * usually a businessperson, holding no licence at all, so there is no
 * clinical portal they could belong to — the facility portal is the only
 * one that means anything to them. Checked before the citizen fallback,
 * which is where they used to land.
 */
export function portalFor(
  me: {
    practitionerId: string | null;
    ministryUserId: string | null;
    personId: string | null;
    facilityAdminOf?: string | null;
    facilityDirectorOf?: string | null;
  },
  /** The portal whose sign-in form they used, when there was one. */
  cameFrom?: Portal,
): Portal {
  if (me.practitionerId) {
    if (cameFrom?.id === 'facility' && me.facilityAdminOf) return PORTALS.facility;
    return PORTALS.worker;
  }
  if (me.ministryUserId) return PORTALS.ministry;
  // Before the citizen fallback: a director with no licence is not a
  // patient looking at their own record, and sending them there was how a
  // non-clinical owner found the facility portal unreachable.
  if (me.facilityDirectorOf) return PORTALS.facility;
  return PORTALS.citizen;
}
