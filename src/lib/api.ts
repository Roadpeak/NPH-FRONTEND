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
  status: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'MFA_ENROLMENT_REQUIRED';
  accessToken?: string;
  /** The refresh token is NOT here — it lives in an httpOnly cookie. */
  csrfToken?: string;
  mfaToken?: string;
  mfaMode?: 'SMS' | 'TOTP';
  /** Scoped to enrolment; not a session. */
  enrolToken?: string;
  /** Masked destination for an SMS factor, e.g. +2547***678. */
  sentTo?: string;
}

/** What every registration form collects about a person. */
export interface RegisterPersonInput {
  nationalId: string;
  phone: string;
  email?: string;
  givenName: string;
  middleName?: string;
  familyName: string;
  sexAtBirth: 'MALE' | 'FEMALE' | 'INTERSEX';
  /** ISO date, as the form's date input produces it. */
  dateOfBirth: string;
  countyId: string;
  subcountyId: string;
  password: string;
  /** Optional passport photo, as a base64 data URL. */
  photo?: string;
}

export interface CountyOption {
  id: string;
  code: string;
  name: string;
}

export interface SubcountyOption {
  id: string;
  name: string;
  kind: string;
}

/**
 * Registration.
 *
 * None of these return a session. The client signs in through the normal
 * path afterwards, so there is exactly one way to obtain a token — a second
 * path would be a second place for an authentication bug to live.
 */
export const register = {
  citizen: (input: RegisterPersonInput) =>
    api.post<{ nhpId: string; message: string }>('/auth/register/citizen', input),

  practitioner: (
    input: RegisterPersonInput & {
      cadre: string;
      licenceNumber: string;
      regulator?: string;
    },
  ) =>
    api.post<{
      nhpId: string;
      practitionerId: string;
      licenceNumber: string | null;
      /** What they sign in with as a clinician — their licence, NOT the phone. */
      clinicalLogin: string;
      verification: unknown;
      message: string;
      loginNote: string;
    }>('/auth/register/practitioner', input),

  facility: (input: {
    mflCode: string;
    name: string;
    kephLevel: number;
    ownership: string;
    countyId: string;
    subcountyId: string;
    locality?: string;
    latitude: number;
    longitude: number;
    /*
     * Ownership evidence. Reference numbers rather than uploaded scans: a
     * registrar checks these against the Business Registry, KRA and the
     * MOH register, which proves more than a document anyone could forge.
     * Required of a private, faith-based or NGO facility; meaningless for
     * a public one, which the Ministry itself stands behind.
     */
    businessRegNo?: string;
    kraPin?: string;
    practiceLicenceNo?: string;
    ownerNationalId?: string;
    ownerName?: string;
    /** Whoever registers a private facility becomes its administrator. */
    adminLicenceNumber?: string;
  }) =>
    api.post<{
      facilityId: string;
      mflCode: string;
      registrationStatus: string;
      firstAdminPractitionerId: string | null;
      message: string;
    }>('/facilities/register', input),
};

export interface FacilityProfile {
  id: string;
  mflCode: string | null;
  name: string;
  kephLevel: number;
  ownership: string;
  registrationStatus: string;
  locality: string;
  approvedAt: string | null;
  businessRegNo: string | null;
  kraPin: string | null;
  practiceLicenceNo: string | null;
  ownerName: string | null;
  countyName: string;
  subcountyName: string;
  isPublic: boolean;
  /** The ownership rule in a sentence, so the portal explains rather than refuses. */
  staffingRule: string;
}

export interface StaffRow {
  affiliationId: string;
  practitionerId: string;
  displayName: string;
  cadre: string;
  role: string;
  status: string;
  startedAt: string;
  grantedByKind: string;
  onDuty: boolean;
  licenceNumber: string | null;
  licenceStatus: string | null;
}

/**
 * A person waiting to be seen.
 *
 * Identity only. There is no allergy, diagnosis or medicine here and
 * there must never be: reception needs to know they have the right
 * person, and a waiting room is the least private place in the building.
 */
export interface QueueEntry {
  visitId: string;
  nhpId: string;
  displayName: string;
  ageYears: number | null;
  sex: string | null;
  photoDataUrl: string | null;
  arrivedAt: string;
  reasonForVisit: string | null;
  seenBy: string | null;
}

export const facility = {
  me: () => api.get<FacilityProfile>('/facility/me'),

  staff: (includeEnded = false) =>
    api.get<{ facilityName: string; isPublic: boolean; staff: StaffRow[] }>(
      `/facility/staff?includeEnded=${includeEnded}`,
    ),

  addStaff: (licenceNumber: string, role?: string) =>
    api.post<{
      affiliationId: string;
      practitionerId: string;
      displayName: string;
      cadre: string;
      licenceStatus: string;
    }>('/facility/staff', { licenceNumber, ...(role ? { role } : {}) }),

  removeStaff: (affiliationId: string) =>
    api.delete<{ ended: boolean }>(`/facility/staff/${affiliationId}`),

  queue: () => api.get<{ facilityName: string; queue: QueueEntry[] }>('/facility/queue'),

  registerArrival: (nhpId: string, statedReason?: string) =>
    api.post<{ arrivalId: string; alreadyWaiting: boolean; arrivedAt: string }>(
      '/facility/queue',
      { nhpId, ...(statedReason ? { statedReason } : {}) },
    ),

  closeArrival: (arrivalId: string, status: 'LEFT' | 'COMPLETED') =>
    api.patch<{ id: string; status: string }>(`/facility/queue/${arrivalId}`, { status }),
};

export interface AdminOverview {
  role: string | null;
  geoScope: string | null;
  /** null means "not your role" — render nothing, not a zero. */
  pendingFacilities: number | null;
  activeFacilities: number | null;
  practitioners: number | null;
  pendingBreakGlassReviews: number | null;
  licencesExpiringSoon: number | null;
}

export interface PendingFacility {
  id: string;
  mflCode: string;
  name: string;
  kephLevel: number;
  ownership: string;
  countyId: string;
  subcountyId: string;
  locality: string | null;
  createdAt: string;
}

export interface FacilityRow {
  id: string;
  mflCode: string;
  name: string;
  kephLevel: number;
  ownership: string;
  countyId: string;
  registrationStatus: string;
}

export interface ExpiringLicence {
  id: string;
  practitionerId: string;
  regulator: string;
  licenceNumber: string;
  expiresOn: string;
}

export interface PendingBreakGlass {
  id: string;
  personId: string;
  practitionerId: string;
  facilityId: string;
  justification: string;
  openedAt: string;
  reviewStatus: string;
  patientNotifiedAt: string | null;
}

/**
 * The administrative surface.
 *
 * Each call is gated server-side by Ministry role. This client mirrors that
 * only so the UI knows what not to bother rendering — the authorisation
 * itself is the server's, and a screen that hid a section would still be
 * refused if it called anyway.
 */
export interface PractitionerHit {
  practitionerId: string;
  name: string;
  cadre: string;
  status: string;
  licences: Array<{
    regulator: string;
    licenceNumber: string;
    status: string;
    expiresOn: string;
  }>;
  /** Where they already work — so the screen can prevent a duplicate. */
  affiliations: Array<{
    id: string;
    facilityId: string;
    facilityName: string;
    role: string;
  }>;
}

export interface FacilityHit {
  id: string;
  mflCode: string;
  name: string;
  kephLevel: number;
  /** Decides whether the Ministry may post here at all. */
  ownership: string;
  countyId: string;
}

export interface FacilityStats {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byKephLevel: Array<{ kephLevel: number; count: number }>;
  byOwnership: Array<{ ownership: string; count: number }>;
  byCounty: Array<{ countyId: string; count: number }>;
  /** Registered but invisible to care routing. */
  activeWithoutCapabilities: number;
}

export interface WorkforceStats {
  total: number;
  byCadre: Array<{ cadre: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byCounty: Array<{ countyId: string; count: number }>;
  withActiveLicence: number;
  withActiveAffiliation: number;
  /** Registered but unable to treat anyone. */
  unaffiliated: number;
}

export interface PractitionerRow {
  practitionerId: string;
  cadre: string;
  status: string;
  countyId: string;
  registeredAt: string;
  licence: { regulator: string; licenceNumber: string; status: string; expiresOn: string } | null;
  facilities: string[];
}

export interface CitizenStats {
  total: number;
  registeredThisMonth: number;
  byCounty: Array<{ countyId: string; count: number }>;
  byMaturity: Array<{ maturity: string; count: number }>;
  byVerification: Array<{ state: string; count: number }>;
  bySex: Array<{ sex: string; count: number }>;
  notAlive: number;
}

export interface CitizenLookupResult {
  match: {
    id: string;
    displayNumber: string;
    givenName: string;
    familyName: string;
    dateOfBirth: string;
    maturity: string;
    sexAtBirth: string;
    verificationState: string;
  } | null;
}

export const admin = {
  overview: () => api.get<AdminOverview>('/admin/overview'),

  facilityStats: () => api.get<FacilityStats>('/admin/facilities/stats'),
  workforceStats: () => api.get<WorkforceStats>('/admin/practitioners/stats'),
  citizenStats: () => api.get<CitizenStats>('/admin/citizens/stats'),

  practitioners: (params?: { cadre?: string; skip?: number }) => {
    const q = new URLSearchParams();
    if (params?.cadre) q.set('cadre', params.cadre);
    if (params?.skip) q.set('skip', String(params.skip));
    const query = q.toString();
    return api.get<{ total: number; rows: PractitionerRow[] }>(
      `/admin/practitioners${query ? `?${query}` : ''}`,
    );
  },

  /**
   * ONE citizen, by exact identifier. There is no listing endpoint, and
   * every successful lookup is written to that citizen's own access log.
   */
  lookupCitizen: (identifier: string) =>
    api.get<CitizenLookupResult>(
      `/admin/citizens/lookup?identifier=${encodeURIComponent(identifier)}`,
    ),

  searchPractitioners: (q: string) =>
    api.get<PractitionerHit[]>(`/admin/practitioners/search?q=${encodeURIComponent(q)}`),

  searchFacilities: (q: string) =>
    api.get<FacilityHit[]>(`/admin/facilities/search?q=${encodeURIComponent(q)}`),

  pendingFacilities: () => api.get<PendingFacility[]>('/admin/facilities/pending'),

  facilities: (params?: { status?: string; countyId?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.countyId) q.set('countyId', params.countyId);
    const query = q.toString();
    return api.get<FacilityRow[]>(`/admin/facilities${query ? `?${query}` : ''}`);
  },

  approveFacility: (facilityId: string) =>
    api.post<{ id: string; registrationStatus: string }>(
      `/admin/facilities/${facilityId}/approve`,
    ),

  postStaff: (body: { practitionerId: string; facilityId: string; role?: string }) =>
    api.post<{ id: string; status: string }>('/admin/postings', body),

  endPosting: (affiliationId: string) =>
    api.post<{ id: string; status: string }>(`/admin/postings/${affiliationId}/end`),

  expiringLicences: (days = 30) =>
    api.get<ExpiringLicence[]>(`/admin/licences/expiring?days=${days}`),

  pendingBreakGlass: () => api.get<PendingBreakGlass[]>('/admin/break-glass/pending'),

  reviewBreakGlass: (breakGlassId: string, outcome: string, note?: string) =>
    api.post<{ id: string; reviewStatus: string }>(
      `/admin/break-glass/${breakGlassId}/review`,
      { outcome, note },
    ),

  breakGlassRates: () =>
    api.get<Array<{ facilityId: string; events: number; encounters: number; ratePercent: number }>>(
      '/admin/break-glass/rates',
    ),

  anomalies: () =>
    api.get<Array<{ actorId: string; attempts: number; denials: number; denialRate: number }>>(
      '/admin/anomalies',
    ),
};

/** Open reference data — a registration form needs these before sign-in. */
export interface CitizenProfile {
  contact: { phone: string | null; email: string | null };
  photo: string | null;
  mfaMode: string;
  /** Read-only. Shown so an error can be seen and reported. */
  identity: {
    displayNumber: string;
    givenName: string;
    middleName: string | null;
    familyName: string;
    dateOfBirth: string;
    sexAtBirth: string;
    bloodGroup: string | null;
    nationalIdMasked: string | null;
    verificationState: string;
  };
  countyId: string;
  subcountyId: string;
}

export interface FamilyMember {
  guardianshipId: string;
  relationship: string;
  isPrimary: boolean;
  evidence: string;
  child: {
    displayNumber: string;
    givenName: string;
    familyName: string;
    dateOfBirth: string;
    ageYears: number;
    sexAtBirth: string;
    maturity: string;
    /** Whether a facility can find this child yet. */
    verified: boolean;
    verificationState: string;
    photo: string | null;
  };
}

/** A person's passport photograph, behind the same auth as their record. */
export const photo = {
  ofPatient: (nhpId: string) =>
    api.get<{ photo: string | null }>(`/persons/${nhpId}/photo`),
  mine: () => api.get<{ photo: string | null }>('/persons/me/photo'),
  setMine: (dataUrl: string) =>
    api.post<{ updated: boolean }>('/persons/me/photo', { photo: dataUrl }),
};

export const geo = {
  counties: () => api.get<CountyOption[]>('/geo/counties'),
  subcounties: (countyId: string) =>
    api.get<SubcountyOption[]>(`/geo/counties/${countyId}/subcounties`),
};

export const auth = {
  login: (phone: string, password: string) =>
    api.post<LoginResult>('/auth/login', { phone, password }),

  completeMfa: (mfaToken: string, code: string) =>
    api.post<LoginResult>('/auth/mfa', { mfaToken, code }),

  resendMfaCode: (mfaToken: string) =>
    api.post<{ sentTo: string; expiresInMinutes: number }>('/auth/mfa/resend', {
      mfaToken,
    }),

  me: () =>
    api.get<{
      accountId: string;
      /** Who this clinician is, for the attribution line. */
      displayName: string | null;
      cadre: string | null;
      licenceNumber: string | null;
      practitionerId: string | null;
      // The server has always returned this; omitting it here meant a
      // Ministry analyst fell through the sign-in routing to the citizen
      // screen and was met with "this endpoint is for citizen accounts".
      ministryUserId: string | null;
      /** Which Ministry sections this account may open. */
      ministryRole: string | null;
      geoScope: string | null;
      scopeCountyId: string | null;
      personId: string | null;
      mfaSatisfied: boolean;
      checkedInAt: string | null;
      /**
       * The facility this practitioner administers, if any. A facility
       * admin IS a practitioner, so without this the sign-in routing
       * cannot tell them from a treating clinician.
       */
      facilityAdminOf: string | null;
      facilityAdminOfName: string | null;
    }>('/auth/me'),

  logout: () => api.post<{ revoked: number }>('/auth/logout'),

  /**
   * Enrolling a second factor.
   *
   * `enrolToken` is present when the account cannot sign in yet because it
   * has none — it is scoped to enrolment only and is NOT a session. When
   * the caller already has a session, omit it.
   */
  enrolTotp: (label: string, enrolToken?: string) =>
    api.post<{ secret: string; uri: string }>('/auth/mfa/enrol', { label, enrolToken }),

  confirmTotp: (code: string, enrolToken?: string) =>
    api.post<{ confirmed: boolean }>('/auth/mfa/confirm', { code, enrolToken }),

  enrolSms: (enrolToken?: string) =>
    api.post<{ sentTo: string; expiresInMinutes: number }>('/auth/mfa/sms/enrol', {
      enrolToken,
    }),

  confirmSms: (code: string, enrolToken?: string) =>
    api.post<{ confirmed: boolean }>('/auth/mfa/sms/confirm', { code, enrolToken }),
};

export interface TimelineEncounter {
  id: string;
  kind: string;
  startedAt: string;
  chiefComplaint: string;
  disposition: string | null;
  facilityName: string;
  facilityKephLevel: number | null;
  recordedByName: string;
  recordedByCadre: string | null;
  licenceNumber: string;
  conditions: Array<{ icd11Code: string; icd11Title: string; clinicalStatus: string }>;
  medications: Array<{
    genericName: string;
    doseAmount: string;
    doseUnit: string;
    frequency: string;
  }>;
}

export interface KeyResult {
  code: string;
  label: string;
  category: string;
  unit: string | null;
  latest: {
    value: number | string | null;
    observedAt: string;
    abnormalFlag: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | null;
  };
  refLow: number | null;
  refHigh: number | null;
  series: Array<{ value: number; observedAt: string }>;
}

export interface ProcedureRecord {
  code: string;
  title: string;
  performedOn: string;
  datePrecision: string;
  externalFacilityName: string | null;
  performedAtFacilityId: string | null;
  indication: string;
  outcome: string | null;
  complications: string | null;
  isSelfReported: boolean;
}

export interface CitizenSummaryPayload {
  name: string;
  displayNumber: string;
  age: number;
  rightNow: Array<{
    kind: 'MEDICATION' | 'CHRONIC' | 'ALLERGY';
    title: string;
    detail: string;
    tone: 'good' | 'caution' | 'critical';
  }>;
  dailyMedicines: Array<{ name: string; forWhat: string | null; regimen: string }>;
  pendingClinicianContact: boolean;
  ui: Record<string, string>;
}

export interface CitizenVisit {
  encounterId: string;
  when: string;
  facilityName: string;
  whatHappened: string;
  clinicalTitle: string | null;
  icd11Code: string | null;
  treatedBy: string;
  medicines: Array<{ name: string; plain: string | null; regimen: string }>;
  withheld: boolean;
}

export interface AccessEntry {
  occurredAt: string;
  facilityId: string | null;
  actorId: string;
  actorKind: string;
  action: string;
  isEmergencyAccess: boolean;
  reasonPlain: string;
  outcome: string;
}

export const citizen = {
  summary: (lang: 'en' | 'sw' = 'en') =>
    api.get<CitizenSummaryPayload>(`/persons/me/summary?lang=${lang}`),

  visits: (lang: 'en' | 'sw' = 'en') =>
    api.get<CitizenVisit[]>(`/persons/me/visits?lang=${lang}`),

  accessLog: () => api.get<AccessEntry[]>('/persons/me/access-log'),

  profile: () => api.get<CitizenProfile>('/persons/me/profile'),

  updateProfile: (patch: { phone?: string; email?: string }) =>
    api.patch<{ updated: string[] }>('/persons/me/profile', patch),

  family: () => api.get<FamilyMember[]>('/persons/me/family'),

  addChild: (child: {
    givenName: string;
    middleName?: string;
    familyName: string;
    sexAtBirth: string;
    dateOfBirth: string;
    relationship: string;
    birthCertNumber?: string;
    photo?: string;
  }) =>
    api.post<{ displayNumber: string; verified: boolean; message: string }>(
      '/persons/me/family',
      child,
    ),

  dispute: (encounterId: string, note: string) =>
    api.post<unknown>('/persons/me/disputes', { encounterId, note }),
};

export interface BurdenRow {
  countyId: string;
  cases: number;
  newCases: number;
  suppressedCells: number;
  facilitiesReporting: number;
  facilitiesExpected: number;
  completenessPercent: number;
}

export interface CountyRef {
  id: string;
  code: string;
  name: string;
}

export interface Provenance {
  periodFrom: string;
  periodTo: string;
  facilitiesReporting: number;
  facilitiesRegistered: number;
  completenessPercent: number;
  lastRollupDate: string | null;
  suppressionThreshold: number;
  denominatorNote: string;
  suppressionNote: string;
}

export const ministry = {
  counties: () => api.get<CountyRef[]>('/analytics/counties'),

  burden: (icd11Code?: string) =>
    api.get<BurdenRow[]>(
      `/analytics/burden${icd11Code ? `?icd11Code=${icd11Code}` : ''}`,
    ),

  subcounty: (countyId: string, icd11Code?: string) =>
    api.get<Array<{ subcountyId: string; cases: number; suppressed: number }>>(
      `/analytics/burden/${countyId}${icd11Code ? `?icd11Code=${icd11Code}` : ''}`,
    ),

  referralClosure: () =>
    api.get<
      Array<{
        countyId: string;
        issued: number;
        arrived: number;
        completed: number;
        declined: number;
        arrivalRatePercent: number;
        closureRatePercent: number;
      }>
    >('/analytics/referral-closure'),

  workforce: () =>
    api.get<Array<{ countyId: string; activeClinicians: number }>>(
      '/analytics/workforce',
    ),

  careGaps: () =>
    api.get<Array<{ icd11Code: string; lostToFollowUp: number }>>('/analytics/care-gaps'),

  surveillance: () =>
    api.get<
      Array<{
        icd11Code: string;
        title: string;
        countyId: string;
        cases: number;
        facilitiesInvolved: number;
      }>
    >('/analytics/surveillance'),

  provenance: () => api.get<Provenance>('/analytics/provenance'),
};

export const nhp = {
  searchPatients: (identifier: string) =>
    api.get<{ match: PersonSummary | null; dependants: PersonSummary[] }>(
      `/persons/search?identifier=${encodeURIComponent(identifier)}`,
    ),

  patientSummary: (nhpId: string) => api.get<PatientSummary>(`/persons/${nhpId}/summary`),

  patientTimeline: (nhpId: string, limit = 20) =>
    api.get<TimelineEncounter[]>(`/persons/${nhpId}/encounters?limit=${limit}`),

  keyResults: (nhpId: string) => api.get<KeyResult[]>(`/persons/${nhpId}/results`),

  procedures: (nhpId: string) =>
    api.get<ProcedureRecord[]>(`/persons/${nhpId}/procedures`),

  currentSession: () => api.get<CheckInSession | null>('/check-ins/current'),

  /** The facilities this clinician is posted to, and may check in at. */
  myFacilities: () =>
    api.get<
      Array<{
        affiliationId: string;
        role: string;
        facilityId: string;
        name: string;
        mflCode: string | null;
        kephLevel: number;
        countyId: string;
      }>
    >('/check-ins/facilities'),

  checkIn: (facilityId: string) =>
    api.post<{ id: string; facilityId: string; expiresAt: string; licenceNumber: string }>(
      '/check-ins',
      { facilityId },
    ),

  checkOut: () => api.post<{ ended: boolean }>('/check-ins/end'),

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
