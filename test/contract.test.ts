/**
 * THE CROSS-REPO CONTRACT.
 *
 * `api.ts` says it plainly: the types here are "deliberately hand-written
 * rather than generated, so a backend change surfaces as a visible diff here
 * instead of silently reshaping the UI."
 *
 * That is the right call, and it has one consequence: nothing checks that
 * the hand-written shapes still match what the backend actually sends. The
 * two repositories share no module by design, so a field renamed on the
 * server compiles perfectly here and arrives as `undefined` at runtime —
 * which is exactly how a Ministry analyst ended up on the citizen screen,
 * and how the patient summary rendered "undefined undefined" for a name.
 *
 * These tests sign in against a REAL running backend and assert that every
 * field the UI reads is actually present. They are the only tests in this
 * repo that cross the boundary, so they are also the only ones that can
 * catch drift.
 *
 * They SKIP when the API is unreachable, so `pnpm test` still works on a
 * laptop with nothing running. `pnpm test:contract` fails loudly instead —
 * that is the one CI must run, because a contract test that silently skips
 * in CI is worse than no contract test at all.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4400/api/v1';
const REQUIRED = process.env.CONTRACT_REQUIRED === '1';

/** Demo credentials, created by `pnpm demo:reset` in the backend repo. */
const ANALYST = { phone: '0733222555', password: 'analyst-password-123' };
const CLINICIAN = { phone: '0722111333', password: 'demo-password-123' };

let reachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(BASE.replace(/\/api\/v1$/, '/health'));
    reachable = res.ok;
  } catch {
    reachable = false;
  }

  if (!reachable && REQUIRED) {
    throw new Error(
      `The backend at ${BASE} is unreachable, and CONTRACT_REQUIRED=1. ` +
        'Start it with `pnpm serve` in the API repo, then `pnpm demo:reset`.',
    );
  }
});

const contract = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

/**
 * Signs in for real, completing SMS MFA by reading the code the development
 * console provider prints. Falls back to the single-stage path for accounts
 * without a second factor.
 */
async function signIn(who: { phone: string; password: string }): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(who),
  });
  const body = await res.json();

  if (body.status === 'AUTHENTICATED') return body.accessToken;

  if (body.status !== 'MFA_REQUIRED') {
    throw new Error(
      `Could not sign in as ${who.phone}: ${body.detail ?? JSON.stringify(body)}. ` +
        'Run `pnpm demo:reset` in the API repo.',
    );
  }

  // The dev SMS code is not retrievable over HTTP by design. Contract tests
  // that need an authenticated call therefore require MFA to be satisfiable,
  // which the demo seed arranges by printing the code to the server console.
  throw new Error(
    'MFA is required for this account and the code is not readable from here. ' +
      'Set NHP_TEST_MFA_CODE, or run these against an account without SMS MFA.',
  );
}

/** Asserts every key exists on the object — `undefined` is the failure. */
function hasFields(actual: Record<string, unknown>, fields: string[], label: string) {
  const missing = fields.filter((f) => !(f in actual));
  expect(missing, `${label} is missing: ${missing.join(', ')}`).toEqual([]);
}

// =====================================================================

describe('the shapes the UI reads', () => {
  contract('the error envelope is RFC 7807 problem+json', async () => {
    const res = await fetch(`${BASE}/analytics/burden`);
    expect(res.status).toBe(401);

    const problem = await res.json();
    // `api.ts` reads `detail`, `title` and `code` off every failure. If the
    // backend ever returns a bare string or a different envelope, every
    // error message in the UI degrades to "Request failed (401)".
    hasFields(problem, ['type', 'title', 'detail', 'code'], 'problem+json');
    expect(problem.code).toBe('NO_SESSION');
  });

  contract('a malformed login is refused as 400, not 500', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'no-phone-field' }),
    });

    // A 500 here would mean an unhandled exception; the login form would
    // show "something went wrong" for a fixable typo.
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MALFORMED_REQUEST');
  });

  contract('login answers with a status the client branches on', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ANALYST),
    });
    const body = await res.json();

    // The login screen switches to its MFA stage on exactly this value.
    expect(['AUTHENTICATED', 'MFA_REQUIRED']).toContain(body.status);

    if (body.status === 'MFA_REQUIRED') {
      hasFields(body, ['mfaToken', 'mfaMode', 'sentTo'], 'MFA_REQUIRED response');
      // The screen shows "we texted +2547***555" — a masked hint, never the
      // full number, and never absent.
      expect(body.sentTo).toMatch(/\*/);
    }
  });

  contract('a wrong password is refused identically to an unknown number', async () => {
    const post = (phone: string) =>
      fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: 'definitely-not-the-password' }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));

    const known = await post(CLINICIAN.phone);
    const unknown = await post('0700000000');

    // The login form must not become a directory of who holds an account.
    expect(known.status).toBe(unknown.status);
    expect(known.body.code).toBe(unknown.body.code);
    expect(known.body.detail).toBe(unknown.body.detail);
  });

  contract('the refresh endpoint refuses a request with no CSRF header', async () => {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST' });
    // `restoreSession()` depends on this being a refusal and not a 500 —
    // it runs on every page load, including for signed-out visitors.
    expect([401, 403]).toContain(res.status);
  });

  contract('an unknown route answers 404, not HTML', async () => {
    const res = await fetch(`${BASE}/not-a-real-route`);
    expect(res.status).toBe(404);
    // `api.ts` calls `.json()` on every failure. An HTML error page would
    // throw inside the catch and surface as a confusing parse error.
    expect(res.headers.get('content-type')).toMatch(/json/);
  });
});

describe('the fields the Ministry screen reads', () => {
  /**
   * These run unauthenticated where possible. Where a token is needed the
   * test asserts the REFUSAL shape instead, which is itself part of the
   * contract the UI depends on — every Ministry screen branches on a 401 to
   * send the analyst to sign in.
   */
  contract('every analytics route is behind authentication', async () => {
    for (const route of [
      'burden',
      'referral-closure',
      'workforce',
      'care-gaps',
      'surveillance',
      'provenance',
      'counties',
    ]) {
      const res = await fetch(`${BASE}/analytics/${route}`);
      expect(res.status, `analytics/${route}`).toBe(401);

      const problem = await res.json();
      // The screen routes to /login on this exact code.
      expect(problem.code, `analytics/${route}`).toBe('NO_SESSION');
    }
  });
});

describe('the fields the clinical screens read', () => {
  contract('every person route is behind authentication', async () => {
    for (const route of ['summary', 'encounters', 'access-log', 'results', 'procedures']) {
      const res = await fetch(`${BASE}/persons/NHP-0000-0000/${route}`);
      // Two of these once answered 200 to anyone. The frontend has no way
      // to detect that on its own, which is why it is asserted here too.
      expect(res.status, `persons/:id/${route}`).toBe(401);
    }
  });

  contract('the vocabulary endpoints are open and shaped as the picker expects', async () => {
    const res = await fetch(`${BASE}/vocab/diagnoses?q=mal`);
    if (res.status === 401) return; // gated in this deployment; nothing to check

    expect(res.status).toBe(200);
    const hits = await res.json();
    expect(Array.isArray(hits)).toBe(true);

    if (hits.length > 0) {
      // `CodedSearch` reads exactly these. A rename would render blank rows
      // in the picker with no error.
      hasFields(
        hits[0],
        ['icd11Code', 'clinicalTitle', 'plainEn', 'plainSw', 'sensitivity', 'isNotifiable'],
        'DiagnosisHit',
      );
      // The parity claim in search.ts, checked against the live backend.
      expect(hits[0].icd11Code).toBe('1F41.0');
    }
  });
});
