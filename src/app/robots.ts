import type { MetadataRoute } from 'next';

/**
 * Which parts of the portal a search engine may crawl.
 *
 * This stops FUTURE crawling; the `noindex` metadata in the matching
 * layout.tsx files is what removes pages already in an index. Both are
 * needed, because a disallow rule here forbids the very crawl that would
 * discover a noindex tag — a URL blocked in robots.txt can stay listed
 * indefinitely on the strength of inbound links alone.
 *
 * Neither is a security control. Every path below is protected by its own
 * sign-in and role checks, and this file is itself public: it names the
 * paths it hides. It is here so an administrative door is not ADVERTISED,
 * not so it is hidden.
 *
 * Kept deliberately allowed: the four portal landing pages and the three
 * registration pages. Somebody searching for how to register as a citizen,
 * a health worker or a facility should find the real page rather than a
 * third party's description of it.
 */
const PRIVATE_PATHS = [
  // The administrative portal, in full.
  '/ministry',
  // Signed-in workspaces.
  '/worker/patients',
  '/worker/profile',
  '/worker/shift',
  '/facility/profile',
  '/facility/reception',
  '/facility/staff',
  '/encounter',
  '/me',
  // Patient records — the URL shape as much as the pages.
  '/patient',
  // Sign-in screens.
  '/login',
  '/citizen/login',
  '/worker/login',
  '/facility/login',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS.map((p) => `${p}/`).concat(PRIVATE_PATHS),
      },
    ],
  };
}
