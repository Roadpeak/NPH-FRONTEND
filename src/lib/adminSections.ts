/**
 * Which admin sections each Ministry role may open.
 *
 * Kept as data, in one file, for the same reason the portal map is: a
 * permission expressed as an `if` scattered across six components is a
 * permission nobody can audit. Here the whole matrix is readable at once.
 *
 * This mirrors the server's `requireMinistry(ctx, roles)` and does NOT
 * replace it. The server refuses regardless of what this file says; this
 * only decides what the UI bothers rendering, so nobody is shown a section
 * that would then refuse to open.
 */

export type MinistryRole =
  | 'SUPER_ADMIN'
  | 'ANALYST'
  | 'REGISTRAR'
  | 'SURVEILLANCE'
  | 'AUDITOR';

export type SectionId =
  | 'overview'
  | 'facilities'
  | 'postings'
  | 'licences'
  | 'analytics'
  | 'surveillance'
  | 'audit';

export interface AdminSection {
  id: SectionId;
  label: string;
  /** What this section is for, in a sentence a new administrator can act on. */
  blurb: string;
  /** Empty means every Ministry role; SUPER_ADMIN always passes. */
  roles: MinistryRole[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    blurb: 'What is waiting for you, and the size of the register.',
    // The portal landing. Every role needs somewhere to arrive.
    roles: [],
  },
  {
    id: 'facilities',
    label: 'Facilities',
    blurb: 'Approve registrations and read the national facility register.',
    roles: ['REGISTRAR'],
  },
  {
    id: 'postings',
    label: 'Postings',
    blurb: 'Assign staff to public facilities. Private facilities engage their own.',
    roles: ['REGISTRAR'],
  },
  {
    id: 'licences',
    label: 'Licences',
    blurb: 'Licences about to lapse. A lapsed licence stops a clinician writing.',
    roles: ['REGISTRAR'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    blurb: 'Disease burden, referral loop closure and workforce distribution.',
    roles: ['ANALYST'],
  },
  {
    id: 'surveillance',
    label: 'Surveillance',
    blurb: 'Notifiable disease signals raised automatically as they are recorded.',
    roles: ['SURVEILLANCE'],
  },
  {
    id: 'audit',
    label: 'Audit',
    blurb: 'Emergency access awaiting review, and actors whose access is often refused.',
    roles: ['AUDITOR'],
  },
];

/**
 * Whether a role may open a section.
 *
 * Fails closed on an absent role, matching the server: a token with no role
 * claim satisfies nothing. Treating "no role" as "all roles" is the classic
 * mistake, and it is the one that would render an audit queue to an analyst.
 */
export function canOpen(section: AdminSection, role: string | null | undefined): boolean {
  if (section.roles.length === 0) return true;
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;
  return (section.roles as string[]).includes(role);
}

export function sectionsFor(role: string | null | undefined): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => canOpen(s, role));
}
