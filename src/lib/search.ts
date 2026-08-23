/**
 * Local diagnosis and medication search.
 *
 * The wireframes set the target: typing `mal` returns falciparum malaria
 * first, in under 40ms, with no network call. That is what makes coded entry
 * FASTER than free text rather than merely possible — the picker finishes
 * the word for the clinician.
 *
 * This is step 1 of the resolution ladder. Steps 2–4 (full local ICD-11, the
 * WHO API, an uncoded note) live behind it, and none of them may block
 * typing.
 *
 * Ranking mirrors the backend exactly, including the tiebreak — the same
 * query must not return a different diagnosis depending on where it ran.
 */

export interface DiagnosisTerm {
  /** ICD-11 code */
  c: string;
  /** clinical title */
  t: string;
  /** plain English */
  p: string;
  /** plain Swahili */
  w: string;
  /** synonyms */
  s: string[];
  /** abbreviations */
  a: string[];
  /** sensitivity tier */
  r: 'TIER_1_EMERGENCY' | 'TIER_2_GENERAL' | 'TIER_3_RESTRICTED';
  /** notifiable */
  n: boolean;
}

export interface MedicationTerm {
  c: string;
  g: string;
  f: string;
  st: string;
  d: string;
  fr: string;
  du: string;
  r: string;
  ac: string;
  s: string[];
}

export interface Ranked<T> {
  term: T;
  score: number;
}

/**
 * Exact match beats prefix beats substring, shorter beats longer.
 *
 * Shorter-wins matters: typing `mal` should surface "malaria" ahead of a
 * long phrase that merely contains it.
 */
function scoreCandidates(query: string, candidates: string[]): number {
  const q = query.toLowerCase();
  let best = 0;
  for (const raw of candidates) {
    const c = raw.toLowerCase();
    if (c === q) return 1000;
    if (c.startsWith(q)) best = Math.max(best, 500 - c.length);
    else if (c.includes(q)) best = Math.max(best, 300 - c.length);
  }
  return best;
}

export function searchDiagnoses(
  index: DiagnosisTerm[],
  query: string,
  limit = 5,
): Ranked<DiagnosisTerm>[] {
  const q = query.trim().toLowerCase();
  // Two characters, because `TB` and `MI` are real queries.
  if (q.length < 2) return [];

  return index
    .map((term) => {
      let score = scoreCandidates(q, [term.t, ...term.s, ...term.a]);
      // Typing a code directly is a valid shortcut for clinicians who know
      // them, and builds familiarity for those who do not.
      if (term.c.toLowerCase().startsWith(q)) score = Math.max(score, 900);
      return { term, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      // Ties are common: "malaria" matches the specific and the unspecified
      // entry equally. Without a deterministic tiebreak the winner depends
      // on array order, so the same query returns different diagnoses on
      // different days.
      //
      // Prefer the SPECIFIC code — an unspecified diagnosis is the fallback
      // a clinician reaches for, not the one to nudge them toward, and
      // specific codes are what make the national analytics useful.
      const aUnspec = /unspecified/i.test(a.term.t);
      const bUnspec = /unspecified/i.test(b.term.t);
      if (aUnspec !== bUnspec) return aUnspec ? 1 : -1;

      return a.term.c.localeCompare(b.term.c);
    })
    .slice(0, limit);
}

export function searchMedications(
  index: MedicationTerm[],
  query: string,
  limit = 5,
): Ranked<MedicationTerm>[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  return index
    .map((term) => ({ term, score: scoreCandidates(q, [term.g, ...term.s]) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.term.c.localeCompare(b.term.c))
    .slice(0, limit);
}

/** Doses per day, for the standard Kenyan frequency codes. */
export const FREQUENCY_LABELS: Record<string, string> = {
  OD: 'once a day',
  BD: 'twice a day',
  TDS: 'three times a day',
  QDS: 'four times a day',
  PRN: 'as needed',
  STAT: 'immediately, once',
};

let diagnosisCache: DiagnosisTerm[] | null = null;
let medicationCache: MedicationTerm[] | null = null;

/**
 * Loads the index once and keeps it.
 *
 * Fetched rather than bundled so it can be cached by the service worker and
 * swapped without a redeploy — the seed list is expected to grow toward
 * ~2,000 codes as clinicians extend it.
 */
export async function loadDiagnosisIndex(): Promise<DiagnosisTerm[]> {
  if (diagnosisCache) return diagnosisCache;
  const res = await fetch('/data/diagnoses.json');
  diagnosisCache = (await res.json()) as DiagnosisTerm[];
  return diagnosisCache;
}

export async function loadMedicationIndex(): Promise<MedicationTerm[]> {
  if (medicationCache) return medicationCache;
  const res = await fetch('/data/medications.json');
  medicationCache = (await res.json()) as MedicationTerm[];
  return medicationCache;
}
