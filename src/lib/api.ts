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
 * Development shortcut until auth lands: the API identifies the clinician
 * from a header. Any client can forge it, which is why the server refuses
 * to start in production without an explicit override.
 */
const DEMO_PRACTITIONER = process.env.NEXT_PUBLIC_DEMO_PRACTITIONER_ID;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers, ...rest } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(DEMO_PRACTITIONER ? { 'X-Practitioner-Id': DEMO_PRACTITIONER } : {}),
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
