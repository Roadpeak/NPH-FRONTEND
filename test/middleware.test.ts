/**
 * SUBDOMAIN ROUTING.
 *
 * Six hostnames serve one app. The rewrite is small, and the reason it is
 * small is the thing worth protecting: the obvious implementation —
 * prefixing every path with the portal — breaks five routes that
 * deliberately sit outside the portal trees.
 *
 * `/me`, `/encounter`, `/patient/[nhpId]` and `/login` are shared on
 * purpose. A citizen signing in lands on `/me`; rewriting that to
 * `/citizen/me` 404s a screen that exists, and it would 404 only on the
 * subdomain, only after a successful sign-in — which is exactly the kind of
 * bug that reaches production.
 *
 * So the tests that matter here are the ones asserting what is NOT
 * rewritten.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/** A request as it arrives from nginx: real Host header, real path. */
function req(host: string, path = '/') {
  return new NextRequest(new URL(`https://${host}${path}`), {
    headers: { host },
  });
}

/** Where the response actually sends the request, or null when untouched. */
function rewriteTarget(res: Response): string | null {
  const to = res.headers.get('x-middleware-rewrite');
  return to ? new URL(to).pathname : null;
}

describe('a portal subdomain', () => {
  it('opens on its own portal instead of the chooser', () => {
    expect(rewriteTarget(middleware(req('citizen.nationalhealthportal.com')))).toBe('/citizen');
    expect(rewriteTarget(middleware(req('worker.nationalhealthportal.com')))).toBe('/worker');
    expect(rewriteTarget(middleware(req('facility.nationalhealthportal.com')))).toBe('/facility');
    expect(rewriteTarget(middleware(req('ministry.nationalhealthportal.com')))).toBe('/ministry');
  });

  it('matches on the leading label, so staging and previews work too', () => {
    // A hardcoded hostname list fails closed the first time a new domain
    // appears, and fails silently — the subdomain just shows the chooser.
    expect(rewriteTarget(middleware(req('citizen.staging.example.com')))).toBe('/citizen');
  });

  it('ignores a port, which a development Host header carries', () => {
    expect(rewriteTarget(middleware(req('worker.localhost:3100')))).toBe('/worker');
  });

  it('is case-insensitive, because a Host header need not be lowercase', () => {
    expect(rewriteTarget(middleware(req('MINISTRY.nationalhealthportal.com')))).toBe('/ministry');
  });
});

describe('the apex and anything unrecognised', () => {
  it('shows the chooser, untouched', () => {
    expect(rewriteTarget(middleware(req('nationalhealthportal.com')))).toBeNull();
    expect(rewriteTarget(middleware(req('www.nationalhealthportal.com')))).toBeNull();
  });

  it('does not invent a portal for an unknown subdomain', () => {
    // `admin.` is not a portal. Failing to the chooser is right; guessing
    // would hand someone a portal nobody granted them.
    expect(rewriteTarget(middleware(req('admin.nationalhealthportal.com')))).toBeNull();
    expect(rewriteTarget(middleware(req('api.nationalhealthportal.com')))).toBeNull();
  });

  it('survives a missing Host header rather than throwing', () => {
    const r = new NextRequest(new URL('https://example.com/'));
    expect(() => middleware(r)).not.toThrow();
  });
});

describe('THE SHARED ROUTES — what must never be rewritten', () => {
  /*
   * These live outside every portal prefix on purpose. `/patient/[nhpId]`
   * is the same record whether a doctor or a facility administrator opens
   * it; duplicating it under four prefixes would be four screens to keep in
   * step, and three of them would rot.
   */
  const SHARED = ['/me', '/encounter', '/login', '/patient/NHP-1234-ABCD'];

  for (const host of ['citizen', 'worker', 'facility', 'ministry']) {
    for (const path of SHARED) {
      it(`leaves ${path} alone on ${host}.`, () => {
        // Prefixing this would 404 — and only on the subdomain, only after
        // a successful sign-in.
        expect(
          rewriteTarget(middleware(req(`${host}.nationalhealthportal.com`, path))),
        ).toBeNull();
      });
    }
  }

  it('leaves a portal path alone rather than doubling its prefix', () => {
    // /citizen/login on citizen. must not become /citizen/citizen/login.
    expect(
      rewriteTarget(middleware(req('citizen.nationalhealthportal.com', '/citizen/login'))),
    ).toBeNull();
  });

  it('does not confine a subdomain to its own portal', () => {
    // A facility administrator is also a practitioner and may legitimately
    // reach a worker screen. The subdomain is a front door, not a fence —
    // authorisation is the API's job, and pretending otherwise here would
    // be a permission check nobody can see.
    expect(
      rewriteTarget(middleware(req('facility.nationalhealthportal.com', '/worker/patients'))),
    ).toBeNull();
  });
});
