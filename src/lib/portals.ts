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
    name: 'Health facilities',
    nameSw: 'Vituo vya afya',
    blurb: 'Register a facility, manage its staff and its services.',
    blurbSw: 'Sajili kituo, simamia wafanyakazi na huduma zake.',
    basePath: '/facility',
    signInPath: '/facility/login',
    registerPath: '/facility/register',
    landingPath: '/facility',
    selfRegistration: true,
  },
  ministry: {
    id: 'ministry',
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
 */
export function portalFor(me: {
  practitionerId: string | null;
  ministryUserId: string | null;
  personId: string | null;
}): Portal {
  if (me.practitionerId) return PORTALS.worker;
  if (me.ministryUserId) return PORTALS.ministry;
  return PORTALS.citizen;
}
