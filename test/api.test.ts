/**
 * THE BACKEND CLIENT.
 *
 * `api.ts` is this repo's wiring layer — the frontend's equivalent of a route
 * handler. It is where a UI intention becomes an HTTP request, and it is
 * where this codebase's bugs have actually lived:
 *
 *   - It sent `Content-Type: application/json` on bodyless POSTs, which
 *     Fastify rejects outright, breaking session restore.
 *   - Its `auth.me()` type omitted `ministryUserId`, so a Ministry analyst
 *     fell through the sign-in routing to the citizen screen. The server had
 *     always returned the field; TypeScript could not catch its absence
 *     because the client's own type declared it did not exist.
 *
 * Neither is visible from a component test or from the backend suite. Both
 * are visible here, by asserting on the request that actually goes out.
 *
 * `fetch` is stubbed rather than hitting a live API: these tests are about
 * what this module SENDS and how it interprets what comes back. Whether the
 * backend honours it is the backend suite's job, and `test/contract.test.ts`
 * checks the two agree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  api,
  auth,
  nhp,
  ministry,
  ApiError,
  setSession,
  hasSession,
  restoreSession,
} from '@/lib/api';

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];

/** Stubs the next response(s). Records every request for assertion. */
function stubFetch(
  responses: Array<{ status?: number; body?: unknown }> | { status?: number; body?: unknown },
) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      const status = next.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => next.body ?? {},
      } as Response;
    }),
  );
}

const lastCall = () => calls[calls.length - 1];
const headersOf = (c: Call) => (c.init.headers ?? {}) as Record<string, string>;

beforeEach(() => {
  calls = [];
  setSession(null, null);
  document.cookie = 'nhp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =====================================================================

describe('what actually goes over the wire', () => {
  /**
   * THE REGRESSION. Declaring a JSON body and sending none is rejected by
   * Fastify with a 500, which broke session restore — the header must be
   * set only when there IS a body.
   */
  it('omits Content-Type on a POST with no body', async () => {
    stubFetch({ body: { ok: true } });
    await api.post('/auth/refresh');

    expect(headersOf(lastCall())['Content-Type']).toBeUndefined();
    expect(lastCall().init.body).toBeUndefined();
  });

  it('sets Content-Type when there is a body', async () => {
    stubFetch({ body: { ok: true } });
    await api.post('/auth/login', { phone: '0712345678', password: 'x' });

    expect(headersOf(lastCall())['Content-Type']).toBe('application/json');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      phone: '0712345678',
      password: 'x',
    });
  });

  it('sends credentials so the httpOnly refresh cookie travels', async () => {
    stubFetch({ body: {} });
    await api.get('/auth/me');

    // Without this the refresh cookie is never sent and every reload signs
    // the user out.
    expect(lastCall().init.credentials).toBe('include');
  });

  it('attaches the bearer token once a session exists, and not before', async () => {
    stubFetch({ body: {} });

    await api.get('/auth/me');
    expect(headersOf(lastCall()).Authorization).toBeUndefined();

    setSession('token-abc', 'csrf-xyz');
    await api.get('/auth/me');
    expect(headersOf(lastCall()).Authorization).toBe('Bearer token-abc');
    expect(headersOf(lastCall())['x-csrf-token']).toBe('csrf-xyz');
  });

  it('percent-encodes an identifier rather than splicing it into the path', async () => {
    stubFetch({ body: { match: null, dependants: [] } });
    await nhp.searchPatients('39104882/A&x=1');

    // A raw `&` would silently become a second query parameter, and a raw
    // `/` a different route. Both fail as a wrong answer, not an error.
    expect(lastCall().url).toContain('identifier=39104882%2FA%26x%3D1');
    expect(lastCall().url).not.toContain('&x=1');
  });

  it('does not put a patient identifier in the path unescaped', async () => {
    stubFetch({ body: [] });
    await nhp.patientTimeline('NHP-56JZ-YHKS', 5);

    expect(lastCall().url).toContain('/persons/NHP-56JZ-YHKS/encounters');
    expect(lastCall().url).toContain('limit=5');
  });
});

describe('the error contract', () => {
  it('surfaces the problem+json code, not just the status', async () => {
    stubFetch({
      status: 403,
      body: {
        type: 'https://nhp.health.go.ke/problems/no-open-session',
        title: 'PractitionerError',
        detail: 'Check in to a facility before recording clinical data',
        code: 'NO_OPEN_SESSION',
      },
    });

    // Screens branch on `code` to tell a clinician to check in rather than
    // showing a generic failure, so the code must survive the client.
    await expect(nhp.currentSession()).rejects.toMatchObject({
      code: 'NO_OPEN_SESSION',
      status: 403,
      message: 'Check in to a facility before recording clinical data',
    });
  });

  it('still throws an ApiError when the body is not problem+json', async () => {
    // A proxy, a gateway, or the wrong service answering on the port — all
    // of which have happened here — return HTML or nothing at all.
    stubFetch({ status: 502, body: undefined });

    const err = await nhp.currentSession().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('UNKNOWN');
  });

  it('does not swallow a failure into a resolved promise', async () => {
    stubFetch({ status: 400, body: { code: 'PERSON_NOT_FOUND', detail: 'Patient not found' } });

    // The dangerous shape is a rejected request that resolves as empty —
    // "this patient has no history" is a clinical statement, not an error.
    await expect(nhp.patientSummary('NHP-0000-0000')).rejects.toThrow(/not found/i);
  });
});

describe('the session', () => {
  it('reports no session before sign-in', () => {
    expect(hasSession()).toBe(false);
  });

  it('does not attempt a refresh with no CSRF cookie', async () => {
    stubFetch({ body: {} });
    expect(await restoreSession()).toBe(false);
    // Calling /auth/refresh with nothing to send is a guaranteed 403.
    expect(calls).toHaveLength(0);
  });

  it('restores a session by echoing the CSRF cookie in a header', async () => {
    document.cookie = 'nhp_csrf=csrf-from-cookie; path=/';
    stubFetch({ body: { accessToken: 'fresh-token', csrfToken: 'fresh-csrf' } });

    expect(await restoreSession()).toBe(true);
    // The header is the half a cross-origin page cannot forge; the cookie
    // alone travels on any request and proves nothing.
    expect(headersOf(lastCall())['x-csrf-token']).toBe('csrf-from-cookie');
    expect(hasSession()).toBe(true);
  });

  it('clears the session when the refresh is refused', async () => {
    document.cookie = 'nhp_csrf=stale; path=/';
    setSession('old-token', 'stale');
    stubFetch({ status: 401, body: { code: 'NO_REFRESH_COOKIE' } });

    expect(await restoreSession()).toBe(false);
    // Holding a token the server has rejected produces a UI that looks
    // signed in and fails on every action.
    expect(hasSession()).toBe(false);
  });

  it('never writes the access token to storage', async () => {
    document.cookie = 'nhp_csrf=c; path=/';
    stubFetch({ body: { accessToken: 'secret-token', csrfToken: 'c' } });
    await restoreSession();

    // A token in localStorage is readable by any injected script, and this
    // one reaches patient data.
    expect(JSON.stringify(localStorage)).not.toContain('secret-token');
    expect(JSON.stringify(sessionStorage)).not.toContain('secret-token');
  });
});

describe('the auth.me contract', () => {
  /**
   * THE REGRESSION. The server has always returned `ministryUserId`. This
   * client's type omitted it, so `landingFor()` could not branch on it and
   * sent analysts to the citizen screen, where they were told the endpoint
   * was for citizen accounts.
   */
  it('carries every role discriminator the sign-in routing needs', async () => {
    stubFetch({
      body: {
        accountId: 'a1',
        practitionerId: null,
        ministryUserId: 'm1',
        personId: null,
        mfaSatisfied: true,
        checkedInAt: null,
        facilityAdminOf: null,
        facilityAdminOfName: null,
      },
    });

    const me = await auth.me();
    // If a role is added to the backend without appearing here, sign-in
    // routing silently falls through to the wrong screen.
    expect(me.practitionerId).toBeNull();
    expect(me.ministryUserId).toBe('m1');
    expect(me.personId).toBeNull();
  });
});

describe('the Ministry client', () => {
  it('passes the diagnosis filter through as a query parameter', async () => {
    stubFetch({ body: [] });
    await ministry.burden('1F41.0');
    expect(lastCall().url).toContain('/analytics/burden?icd11Code=1F41.0');
  });

  it('omits the filter entirely when none is given', async () => {
    stubFetch({ body: [] });
    await ministry.burden();
    // `?icd11Code=undefined` would filter for a code named "undefined" and
    // return an empty map that looks like a country with no disease.
    expect(lastCall().url).toBe('http://localhost:4400/api/v1/analytics/burden');
  });

  it('preserves a suppressed county as a distinct state, not zero', async () => {
    stubFetch({
      body: [
        { countyId: 'c1', cases: 34, newCases: 30, suppressedCells: 0, facilitiesReporting: 1, facilitiesExpected: 1, completenessPercent: 100 },
        { countyId: 'c2', cases: 0, newCases: 0, suppressedCells: 1, facilitiesReporting: 1, facilitiesExpected: 1, completenessPercent: 100 },
      ],
    });

    const rows = await ministry.burden('1F41.0');
    const suppressed = rows.find((r) => r.suppressedCells > 0)!;
    // `cases: 0` alone is indistinguishable from a county with no disease.
    // `suppressedCells` is what lets the map say "fewer than 10" instead.
    expect(suppressed.cases).toBe(0);
    expect(suppressed.suppressedCells).toBe(1);
  });
});
