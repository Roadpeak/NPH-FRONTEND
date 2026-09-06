import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

/**
 * Which routes search engines may index.
 *
 * None of this is a security control — every private path is protected by
 * its own sign-in and role checks. These tests exist because the split is
 * easy to get wrong in the other direction: a `noindex` that creeps onto
 * /citizen/register would quietly make it impossible for a citizen to find
 * how to register, and nothing else in the suite would notice.
 */

/** Routes that must stay findable, and why each one matters. */
const PUBLIC = [
  '/',
  '/citizen',
  '/citizen/register',
  '/worker',
  '/worker/register',
  '/facility',
  '/facility/register',
];

/** Routes that must not appear in a search result. */
const PRIVATE = [
  '/ministry',
  '/ministry/welcome',
  '/ministry/admin',
  '/ministry/login',
  '/worker/patients',
  '/worker/profile',
  '/worker/shift',
  '/facility/reception',
  '/facility/profile',
  '/facility/staff',
  '/encounter',
  '/me',
  '/patient',
  '/login',
  '/citizen/login',
  '/worker/login',
  '/facility/login',
];

function disallowed(): string[] {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const d = rule.disallow;
  return Array.isArray(d) ? d : d ? [d] : [];
}

describe('robots.txt', () => {
  it('disallows every private route', () => {
    const d = disallowed();
    for (const path of PRIVATE) {
      // robots.txt matches by prefix, so /ministry/ covers
      // /ministry/welcome. Assert coverage rather than an exact entry, or
      // the test demands a redundantly long list to stay green.
      const covered = d.some((rule) => path === rule || path.startsWith(rule));
      expect(covered, `${path} must be disallowed`).toBe(true);
    }
  });

  it('leaves the registration and landing pages crawlable', () => {
    const d = disallowed();
    for (const path of PUBLIC) {
      expect(d, `${path} must stay indexable`).not.toContain(path);
      // A bare prefix would swallow the sub-path too: "/worker" as a
      // disallow rule takes /worker/register down with it.
      expect(d, `${path} must not be blocked by a prefix rule`).not.toContain(`${path}/`);
    }
  });

  it('blocks the administrative portal in full, not just its landing page', () => {
    // Disallow: /ministry alone leaves /ministry/admin crawlable on a
    // strict reading; the trailing-slash form is what covers the subtree.
    expect(disallowed()).toContain('/ministry/');
  });
});
