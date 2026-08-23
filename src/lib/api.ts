/**
 * The backend client.
 *
 * This is the ONLY coupling between the frontend and NHP-BACKEND. No shared
 * modules, no imported types from across the repo boundary — just HTTP
 * against the /api/v1 surface. If the contract ever needs sharing properly,
 * it becomes a published package rather than a cross-repo import.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4400/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The machine-readable code the backend returns, e.g. NO_OPEN_SESSION. */
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Replayed offline writes need a stable key. See the sync design. */
  idempotencyKey?: string;
}

/**
 * The access token for this session.
 *
 * Held in memory, not localStorage: a token in localStorage is readable by
 * any script that gets injected into the page, and this one reaches patient
 * data. The refresh token is what survives a reload, and it should live in
 * an httpOnly cookie once the API sets one.
 */
let accessToken: string | null = null;
let csrfToken: string | null = null;

export function setSession(token: string | null, csrf?: string | null) {
  accessToken = token;
  if (csrf !== undefined) csrfToken = csrf;
}

/** Kept for callers that only have the access token. */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function hasSession(): boolean {
  return accessToken !== null;
}

/**
 * Restores a session from the httpOnly refresh cookie.
 *
 * The cookie is unreadable to this code — we simply ask the API to rotate
 * it. If the browser holds a valid one, we get a fresh access token back;
 * if not, the call fails and the caller sends the user to sign in.
 *
 * The CSRF token is read from a deliberately readable cookie and echoed in
 * a header, which is the half a cross-origin page cannot forge.
 */
export async function restoreSession(): Promise<boolean> {
  const csrf = document.cookie
    .split('; ')
    .find((c) => c.startsWith('nhp_csrf='))
    ?.split('=')[1];

  if (!csrf) return false;

  try {
    const result = await api.post<{ accessToken: string; csrfToken: string }>(
      '/auth/refresh',
      undefined,
      { headers: { 'x-csrf-token': csrf } },
    );
    setSession(result.accessToken, result.csrfToken);
    return true;
  } catch (err) {
    // A failed restore is normal (no cookie, expired, revoked), but a
    // silent catch hides real bugs — so it is visible in development.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[nhp] session restore failed:', err);
    }
    setSession(null, null);
    return false;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers, ...rest } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      // Only when there IS a body: declaring JSON and sending nothing is
      // rejected outright by Fastify, which cost an hour to find once.
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });

  if (!response.ok) {
    // RFC 7807 problem+json, per the API spec. Fall back gracefully if the
    // backend is unreachable and something else answered.
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(
      problem.detail ?? problem.title ?? `Request failed (${response.status})`,
      response.status,
      problem.code ?? 'UNKNOWN',
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

// ------------------------------------------------------------------ types
// Mirrors of the backend's response shapes. Deliberately hand-written
// rather than generated, so a backend change surfaces as a visible diff
// here instead of silently reshaping the UI.

export type Tier = 'TIER_1_EMERGENCY' | 'TIER_2_GENERAL' | 'TIER_3_RESTRICTED';

export interface DiagnosisHit {
  icd11Code: string;
  clinicalTitle: string;
  plainEn: string;
  plainSw: string;
  sensitivity: Tier;
  isNotifiable: boolean;
  score: number;
}

export interface PersonSummary {
  id: string;
  displayNumber: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  age: number;
  maturity: 'DEPENDANT' | 'PENDING_PROMOTION' | 'ADULT';
  sexAtBirth: 'MALE' | 'FEMALE' | 'INTERSEX';
  verificationState: string;
}

export interface Allergy {
  substanceLabel: string;
  allergyClass: string | null;
  reaction: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'ANAPHYLAXIS';
  recordedAt: string;
}

export interface CurrentMedication {
  genericName: string;
  doseAmount: string;
  doseUnit: string;
  frequency: string;
}

export interface ChronicCondition {
  icd11Code: string;
  icd11Title: string;
  onsetDate: string | null;
}

/** Everything the clinician banner needs, in one payload. */
export interface PatientSummary {
  person: PersonSummary & { bloodGroup: string | null; lifeStatus: string };
  allergies: Allergy[];
  medications: CurrentMedication[];
  chronicConditions: ChronicCondition[];
  restrictedRecordsExist: boolean;
  withheldCategories: string[];
}

export interface CheckInSession {
  id: string;
  facilityId: string;
  facilityName: string;
  startedAt: string;
  expiresAt: string;
  minutesRemaining: number;
  expiringSoon: boolean;
}

export type PrescribingVerdict = 'ALLOW' | 'WARN' | 'BLOCK';

export interface PrescribingCheck {
  verdict: PrescribingVerdict;
  reasons: string[];
  alternatives: Array<{ kemlCode: string; genericName: string; adultDose: string }>;
}

// ---------------------------------------------------------------- endpoints

export interface LoginResult {
  status: 'AUTHENTICATED' | 'MFA_REQUIRED';
  accessToken?: string;
  /** The refresh token is NOT here — it lives in an httpOnly cookie. */
  csrfToken?: string;
  mfaToken?: string;
  mfaMode?: 'SMS' | 'TOTP';
}

export const auth = {
  login: (phone: string, password: string) =>
    api.post<LoginResult>('/auth/login', { phone, password }),

  completeMfa: (mfaToken: string, code: string) =>
    api.post<LoginResult>('/auth/mfa', { mfaToken, code }),

  me: () =>
    api.get<{
      accountId: string;
      practitionerId: string | null;
      personId: string | null;
      mfaSatisfied: boolean;
      checkedInAt: string | null;
    }>('/auth/me'),

  logout: () => api.post<{ revoked: number }>('/auth/logout'),
};

export const nhp = {
  searchPatients: (identifier: string) =>
    api.get<{ match: PersonSummary | null; dependants: PersonSummary[] }>(
      `/persons/search?identifier=${encodeURIComponent(identifier)}`,
    ),

  patientSummary: (nhpId: string) => api.get<PatientSummary>(`/persons/${nhpId}/summary`),

  currentSession: () => api.get<CheckInSession | null>('/check-ins/current'),

  searchDiagnoses: (query: string) =>
    api.get<DiagnosisHit[]>(`/vocab/diagnoses?q=${encodeURIComponent(query)}`),

  searchMedications: (query: string) =>
    api.get<Array<{ kemlCode: string; genericName: string; strength: string }>>(
      `/vocab/medications?q=${encodeURIComponent(query)}`,
    ),

  checkPrescribing: (body: { personId: string; kemlCode: string }) =>
    api.post<PrescribingCheck>('/clinical/prescribing-check', body),

  openEncounter: (body: { personId: string; kind: string; chiefComplaint: string }) =>
    api.post<{ id: string }>('/encounters', body),

  recordDiagnosis: (encounterId: string, body: { icd11Code: string }) =>
    api.post<{ id: string; icd11Title: string }>(
      `/encounters/${encounterId}/conditions`,
      body,
    ),
};
