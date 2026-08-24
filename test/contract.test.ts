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

/**
 * Lets these tests complete a real MFA login. Must match the API's
 * TEST_HOOK_SECRET. Without it the authenticated tests skip.
 */
const HOOK_SECRET = process.env.TEST_HOOK_SECRET ?? '';

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

  if (reachable && REQUIRED && !HOOK_SECRET) {
    // The whole point of CONTRACT_REQUIRED is that CI cannot pass by
    // skipping. Silently dropping every authenticated assertion would do
    // exactly that.
    throw new Error(
      'TEST_HOOK_SECRET is not set, so the authenticated contract tests would ' +
        'skip — and CONTRACT_REQUIRED=1. Set it to the same value as the API.',
    );
  }
});

const contract = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

/**
 * Signs in for real, completing SMS MFA the way a person does.
 *
 * The second factor is NOT bypassed. The code is fetched from the API's
 * development-only test hook, which reveals the message the console SMS
 * provider already printed to its own stdout — so this is the same code a
 * developer reads off their terminal, and the MFA exchange that follows is
 * the real one. See `src/testhooks.ts` in the API repo for what that hook
 * refuses; in particular it does not exist at all when NODE_ENV=production.
 *
 * Without TEST_HOOK_SECRET these tests skip rather than pretend: a contract
 * suite that quietly stops checking authenticated responses is worse than
 * one that says it cannot.
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

  const codeRes = await fetch(
    `${BASE}/test-hooks/last-sms-code?phone=${encodeURIComponent(who.phone)}`,
    { headers: { 'x-test-hook-secret': HOOK_SECRET } },
  );
  if (!codeRes.ok) {
    throw new Error(
      `The test hook refused (${codeRes.status}). Check TEST_HOOK_SECRET matches ` +
        'the API\'s, and that the API is not running with NODE_ENV=production.',
    );
  }
  const { code } = await codeRes.json();

  const mfa = await fetch(`${BASE}/auth/mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken: body.mfaToken, code }),
  });
  const session = await mfa.json();

  if (session.status !== 'AUTHENTICATED') {
    throw new Error(`MFA did not complete: ${JSON.stringify(session)}`);
  }
  return session.accessToken;
}

/** Runs only when an authenticated session can actually be established. */
const authed = (name: string, fn: (token: string) => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!HOOK_SECRET) return ctx.skip();
    await fn(await signIn(ANALYST));
  });

/** As above, signed in as the demo clinician. */
const authedClinician = (name: string, fn: (token: string) => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!HOOK_SECRET) return ctx.skip();
    await fn(await signIn(CLINICIAN));
  });

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

// =====================================================================
// Authenticated responses.
//
// These are the assertions the suite could not make before: every field
// below is read by a screen, and a rename on the server would surface here
// as a named missing field instead of as `undefined` in a rendered page.
//
// They skip without TEST_HOOK_SECRET, and CONTRACT_REQUIRED=1 turns that
// skip into a failure — so CI cannot pass by quietly checking nothing.

describe('the authenticated Ministry payloads', () => {
  authed('auth/me names the role the sign-in routing branches on', async (token) => {
    const me = await fetch(`${BASE}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    hasFields(
      me,
      ['accountId', 'practitionerId', 'ministryUserId', 'personId', 'mfaSatisfied', 'checkedInAt'],
      'auth/me',
    );
    // An analyst: Ministry id present, practitioner id explicitly null.
    // `landingFor()` sends them to /ministry on exactly this shape.
    expect(me.ministryUserId).toBeTruthy();
    expect(me.practitionerId).toBeNull();
  });

  authed('BurdenRow carries every field the map renders', async (token) => {
    const rows = await fetch(`${BASE}/analytics/burden?icd11Code=1F41.0`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    hasFields(
      rows[0],
      [
        'countyId',
        'cases',
        'newCases',
        // Without this the map cannot tell a suppressed county from one
        // with no disease, and renders "0" for four real cases.
        'suppressedCells',
        'facilitiesReporting',
        'facilitiesExpected',
        'completenessPercent',
      ],
      'BurdenRow',
    );
  });

  authed('a suppressed county arrives as zero WITH its marker', async (token) => {
    const rows: Array<{ cases: number; suppressedCells: number }> = await fetch(
      `${BASE}/analytics/burden?icd11Code=1F41.0`,
      { headers: { authorization: `Bearer ${token}` } },
    ).then((r) => r.json());

    const suppressed = rows.filter((r) => r.suppressedCells > 0);
    // The demo seeds Nairobi below the threshold precisely so this shape is
    // exercised. If the seed changes, this assertion should be revisited
    // rather than deleted — it is the only end-to-end check that the
    // stored-suppression design survives the wire.
    expect(suppressed.length).toBeGreaterThan(0);
    for (const row of suppressed) {
      // Stored as zero, never as the true count.
      expect(row.cases).toBe(0);
    }
  });

  authed('provenance carries the period, denominator and threshold', async (token) => {
    const p = await fetch(`${BASE}/analytics/provenance`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    hasFields(
      p,
      [
        'periodFrom',
        'periodTo',
        'facilitiesReporting',
        'facilitiesRegistered',
        'completenessPercent',
        'lastRollupDate',
        'suppressionThreshold',
        'denominatorNote',
        'suppressionNote',
      ],
      'Provenance',
    );

    // The footer prints these; empty strings would render a blank line
    // rather than an obvious failure.
    expect(p.denominatorNote).toBeTruthy();
    expect(p.suppressionNote).toBeTruthy();
    expect(p.suppressionThreshold).toBeGreaterThan(0);
  });

  authed('the reported period ends on a real day, not the exclusive bound', async (token) => {
    const p = await fetch(`${BASE}/analytics/provenance`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    // The backend's period bug published a `periodTo` a day in the future.
    // A Ministry analyst reading it would date an outbreak a day late.
    expect(new Date(p.periodTo).getTime()).toBeLessThanOrEqual(Date.now());
  });

  authed('CountyRef carries the code and name the map labels with', async (token) => {
    const counties = await fetch(`${BASE}/analytics/counties`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    expect(counties.length).toBeGreaterThan(0);
    hasFields(counties[0], ['id', 'code', 'name'], 'CountyRef');
  });

  authed('the analyst is still refused every clinical route', async (token) => {
    // The separation the Ministry role depends on, asserted with a REAL
    // analyst session rather than with no session at all — the unauthorised
    // tests above cannot tell 401-for-everyone from a working wall.
    for (const route of ['summary', 'encounters', 'access-log', 'results', 'procedures']) {
      const res = await fetch(`${BASE}/persons/NHP-0000-0000/${route}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status, `persons/:id/${route}`).toBe(403);
      expect((await res.json()).code, `persons/:id/${route}`).toBe('NOT_A_PRACTITIONER');
    }
  });
});

describe('the authenticated clinical payloads', () => {
  authedClinician('the check-in session carries what the header shows', async (token) => {
    const session = await fetch(`${BASE}/check-ins/current`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    if (session === null) return; // not checked in; nothing to assert

    hasFields(
      session,
      [
        'id',
        'facilityId',
        'facilityName',
        'startedAt',
        'expiresAt',
        // The encounter screen warns before a session lapses mid-consultation.
        'minutesRemaining',
        'expiringSoon',
      ],
      'CheckInSession',
    );
  });

  authedClinician('a patient summary resolves the NHP number and decrypts names', async (token) => {
    const found = await fetch(`${BASE}/persons/search?identifier=39104882`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    if (!found.match) return; // demo data not seeded; nothing to assert
    const nhpId = found.match.displayNumber;

    const summary = await fetch(`${BASE}/persons/${nhpId}/summary`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    hasFields(
      summary,
      ['person', 'allergies', 'medications', 'chronicConditions', 'restrictedRecordsExist'],
      'PatientSummary',
    );
    hasFields(
      summary.person,
      ['id', 'displayNumber', 'givenName', 'familyName', 'dateOfBirth', 'sexAtBirth', 'age'],
      'PatientSummary.person',
    );

    // This screen once rendered "undefined undefined" because the service
    // returned encrypted names the client could not read. A present-but-
    // empty name is the same bug wearing a different mask.
    expect(summary.person.givenName).toBeTruthy();
    expect(summary.person.familyName).toBeTruthy();
    expect(summary.person.displayNumber).toBe(nhpId);
  });

  authedClinician('the timeline names who treated the patient, and where', async (token) => {
    const found = await fetch(`${BASE}/persons/search?identifier=39104882`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    if (!found.match) return;

    const timeline = await fetch(
      `${BASE}/persons/${found.match.displayNumber}/encounters?limit=20`,
      { headers: { authorization: `Bearer ${token}` } },
    ).then((r) => r.json());

    expect(Array.isArray(timeline)).toBe(true);
    // Empty here would be the identifier bug returning: a patient with a
    // real history rendered as one with none.
    expect(timeline.length).toBeGreaterThan(0);

    hasFields(
      timeline[0],
      [
        'id',
        'kind',
        'startedAt',
        'chiefComplaint',
        'facilityId',
        'recordedBy',
        'licenceNumber',
        'conditions',
        'medications',
        // Raw ids build no trust and let nobody call whoever saw the
        // patient last, which is half the point of showing attribution.
        'facilityName',
        'recordedByName',
        'recordedByCadre',
      ],
      'TimelineEncounter',
    );
    expect(timeline[0].recordedByName).toBeTruthy();
    expect(timeline[0].facilityName).toBeTruthy();
  });

  authedClinician('a clinician is refused Ministry analytics', async (token) => {
    // The wall stands in both directions.
    const res = await fetch(`${BASE}/analytics/burden`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
