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
 * Whether an account may enter the portal whose door it used.
 *
 * The rule is that a sign-in either lands where it was aimed or is
 * refused. Silently redirecting somebody to a different portal is the
 * worst of both: they typed the facility address, gave correct
 * credentials, and ended up on their own medical record with no
 * explanation — which reads as the system being broken rather than as
 * "you do not work at a facility".
 *
 * Returns null when they belong, or the reason they do not.
 */
export function refusalFor(
  me: {
    practitionerId: string | null;
    ministryUserId: string | null;
    personId: string | null;
    facilityAdminOf?: string | null;
    facilityDirectorOf?: string | null;
    /** A facility they own that the Ministry has not approved yet. */
    facilityAwaitingApproval?: string | null;
  },
  portal: Portal,
): string | null {
  switch (portal.id) {
    case 'facility':
      // Either kind of link will do: a practitioner administering one, or
      // a person directing or working at one.
      if (me.facilityAdminOf || me.facilityDirectorOf) return null;
      // The named owner of a facility still in the queue. Telling them to
      // ask whoever runs the facility is doubly wrong: they are that
      // person, and there is nothing anybody can do but wait.
      if (me.facilityAwaitingApproval) {
        return `${me.facilityAwaitingApproval} is waiting for the Ministry to ` +
          'approve it. You will be able to sign in here once it is approved — ' +
          'nothing more is needed from you.';
      }
      return (
        'This account is not linked to a facility. Ask whoever runs the ' +
        'facility to add you, then sign in again.'
      );

    case 'worker':
      return me.practitionerId
        ? null
        : 'This is the health worker portal, and this account holds no ' +
            'practising licence. Sign in to your own record instead.';

    case 'ministry':
      return me.ministryUserId
        ? null
        : 'Ministry accounts are issued by the Ministry of Health. This ' +
            'account is not one.';

    case 'citizen':
      // Everybody with a person record has their own record to read, and a
      // clinician signing in here is reading their own — which is correct.
      return me.personId || me.practitionerId
        ? null
        : 'This account has no personal health record.';

    default:
      return null;
  }
}

/**
 * Which portal a signed-in account belongs to.
 *
 * Used once entry has been allowed, to pick the landing screen. Order
 * matters: a practitioner account and a citizen account are separate rows
 * for the same human being, so "has a practitioner id" must be asked
 * before "has a person id".
 *
 * The door still decides between the worker and facility portals for
 * somebody who is both, because at a small clinic the same person runs the
 * place and sees patients, and neither answer is wrong.
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
  // The door wins, now that entry has been checked against it: somebody who
  // signed in at the facility door and belongs there goes there.
  if (cameFrom && !refusalFor(me, cameFrom)) return cameFrom;

  if (me.practitionerId) return PORTALS.worker;
  if (me.ministryUserId) return PORTALS.ministry;
  if (me.facilityDirectorOf) return PORTALS.facility;
  return PORTALS.citizen;
}
