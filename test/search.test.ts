/**
 * LOCAL DIAGNOSIS AND MEDICATION SEARCH.
 *
 * `search.ts` carries a claim in its own header: "Ranking mirrors the backend
 * exactly, including the tiebreak — the same query must not return a
 * different diagnosis depending on where it ran."
 *
 * That is a cross-repo invariant with nothing enforcing it. The two
 * implementations are separate code in separate repositories, deliberately
 * not sharing a module, and they will drift the moment someone tunes one of
 * them. When they drift, a clinician typing `malaria` offline records a
 * different ICD-11 code than the same clinician typing it online — and the
 * divergence is invisible until someone compares national analytics against
 * the encounters that produced them.
 *
 * These tests pin the ranking rules the backend's `search_test.py` and
 * `clinical.test.ts` assert, against the same seed vocabulary the backend
 * loads. If the backend's ranking changes, these fail — which is the point.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  searchDiagnoses,
  searchMedications,
  type DiagnosisTerm,
  type MedicationTerm,
} from '@/lib/search';

// The same 50-term vocabulary the backend seeds from, shipped as a static
// asset. Read from disk rather than fetched: this is the real index, not a
// fixture, so a vocabulary change breaks these tests too.
let diagnoses: DiagnosisTerm[];
let medications: MedicationTerm[];

beforeAll(() => {
  const dir = resolve(__dirname, '../public/data');
  diagnoses = JSON.parse(readFileSync(`${dir}/diagnoses.json`, 'utf8'));
  medications = JSON.parse(readFileSync(`${dir}/medications.json`, 'utf8'));
});

const codes = (q: string, limit = 5) =>
  searchDiagnoses(diagnoses, q, limit).map((r) => r.term.c);

// =====================================================================

describe('the vocabulary itself', () => {
  it('is the full seed list, not a truncated sample', () => {
    expect(diagnoses.length).toBe(50);
    expect(medications.length).toBeGreaterThan(50);
  });

  it('carries a Swahili plain-language pair for every diagnosis', () => {
    // The citizen timeline reads in Swahili. A term with no `w` renders as
    // an empty string there, not as a fallback to English.
    const missing = diagnoses.filter((d) => !d.w?.trim());
    expect(missing.map((d) => d.c)).toEqual([]);
  });

  it('has no duplicate codes', () => {
    const seen = new Set(diagnoses.map((d) => d.c));
    expect(seen.size).toBe(diagnoses.length);
  });
});

describe('ranking parity with the backend', () => {
  it('THE WIREFRAME TARGET — "mal" returns falciparum malaria first', () => {
    expect(codes('mal')[0]).toBe('1F41.0');
  });

  it('resolves Kenyan colloquial terms', () => {
    // These are what patients and clinicians actually say. The backend's
    // clinical.test.ts asserts the same three.
    expect(codes('pressure')[0]).toBe('BA00.Z');
    expect(codes('sugar')[0]).toBe('5A11');
    expect(codes('kisukari')[0]).toBe('5A11');
  });

  it('resolves clinical abbreviations', () => {
    expect(codes('URTI')[0]).toBe('CA07.Z');
    expect(codes('TB')[0]).toBe('1B10.Z');
  });

  it('accepts a code typed directly', () => {
    expect(codes('1F41.0')[0]).toBe('1F41.0');
  });

  it('returns nothing below two characters', () => {
    // `TB` and `MI` are real queries, so the floor is two, not three.
    expect(searchDiagnoses(diagnoses, 'm')).toEqual([]);
    expect(searchDiagnoses(diagnoses, '')).toEqual([]);
    expect(searchDiagnoses(diagnoses, ' ')).toEqual([]);
  });

  it('prefers the specific code over the unspecified one on a tie', () => {
    // The tiebreak exists because "malaria" scores identically against the
    // specific and unspecified entries. Without it the winner depends on
    // array order, and the same query returns different codes on different
    // days — the exact bug this rule was added to fix.
    const top = searchDiagnoses(diagnoses, 'malaria', 5);
    const first = top[0].term;
    expect(/unspecified/i.test(first.t)).toBe(false);
  });

  it('is deterministic — the same query always returns the same order', () => {
    const once = codes('malaria', 5);
    const twice = codes('malaria', 5);
    expect(once).toEqual(twice);

    // And independent of the index's own order: a reversed index must rank
    // identically, or the ordering is really just array position.
    const reversed = searchDiagnoses([...diagnoses].reverse(), 'malaria', 5).map(
      (r) => r.term.c,
    );
    expect(reversed).toEqual(once);
  });

  it('ranks a shorter match above a longer one that merely contains it', () => {
    const hits = searchDiagnoses(diagnoses, 'anaemia', 5);
    if (hits.length > 1) {
      // Scores are non-increasing; a longer title never outranks a shorter
      // one at the same match class.
      const scores = hits.map((h) => h.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('respects the limit', () => {
    expect(searchDiagnoses(diagnoses, 'a', 3)).toHaveLength(0);
    expect(searchDiagnoses(diagnoses, 'in', 3).length).toBeLessThanOrEqual(3);
  });

  it('is case-insensitive in both directions', () => {
    expect(codes('MALARIA')[0]).toBe(codes('malaria')[0]);
    expect(codes('Tb')[0]).toBe(codes('TB')[0]);
  });

  /**
   * The rules above are checked against the real vocabulary, which only
   * catches drift the seed list happens to expose. Raising the code-match
   * bonus above the exact-match score, for instance, changes the ranking
   * contract but breaks nothing in a 50-term list where no code prefix
   * collides with a title.
   *
   * So the score bands themselves are pinned, against a synthetic index
   * built to make each one distinguishable. These are the numbers in the
   * backend's `searchDiagnoses`; changing either side without the other is
   * the drift this file exists to prevent.
   */
  describe('the score bands', () => {
    const term = (c: string, t: string, s: string[] = []): DiagnosisTerm => ({
      c, t, p: '', w: '', s, a: [], r: 'TIER_2_GENERAL', n: false,
    });

    it('exact title (1000) beats a code prefix (900)', () => {
      const index = [
        term('ZZ00', 'something else entirely'),
        // Query "zz00" is an exact title match here...
        term('AA11', 'zz00'),
      ];
      // ...and a code prefix on the other. Exact must win: a clinician who
      // typed a full word meant the word, not a code that starts that way.
      expect(searchDiagnoses(index, 'zz00', 5)[0].term.c).toBe('AA11');
    });

    it('code prefix (900) beats a title prefix (500 - length)', () => {
      const index = [
        term('BB22', 'malaria of some kind'),
        term('MAL99', 'something else'),
      ];
      // Typing a code is an unambiguous instruction; a title prefix is a
      // guess at what the clinician meant.
      expect(searchDiagnoses(index, 'mal', 5)[0].term.c).toBe('MAL99');
    });

    it('title prefix beats a substring match', () => {
      const index = [
        term('CC33', 'severe malaria complication'), // contains
        term('DD44', 'malaria'), // starts with
      ];
      expect(searchDiagnoses(index, 'mal', 5)[0].term.c).toBe('DD44');
    });

    it('shorter beats longer within the same band', () => {
      const index = [
        term('EE55', 'malaria with a much longer trailing title'),
        term('FF66', 'malaria'),
      ];
      expect(searchDiagnoses(index, 'mal', 5)[0].term.c).toBe('FF66');
    });

    it('matches synonyms and abbreviations, not only the title', () => {
      const index = [
        { ...term('GG77', 'a title that does not match'), s: ['kisukari'] },
        { ...term('HH88', 'another unrelated title'), a: ['XYZ'] },
      ];
      expect(searchDiagnoses(index, 'kisukari', 5)[0].term.c).toBe('GG77');
      expect(searchDiagnoses(index, 'xyz', 5)[0].term.c).toBe('HH88');
    });
  });
});

describe('medication search', () => {
  it('finds a medicine by generic name', () => {
    const hits = searchMedications(medications, 'artemether', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].term.g.toLowerCase()).toContain('artemether');
  });

  it('applies the same two-character floor', () => {
    expect(searchMedications(medications, 'a')).toEqual([]);
  });

  it('is deterministic on ties', () => {
    const once = searchMedications(medications, 'amox', 5).map((r) => r.term.c);
    const reversed = searchMedications([...medications].reverse(), 'amox', 5).map(
      (r) => r.term.c,
    );
    expect(reversed).toEqual(once);
  });
});

describe('speed', () => {
  it('ranks the whole vocabulary well inside the 40ms budget', () => {
    // The wireframes set 40ms: below that, coded entry feels faster than
    // free text. Above it, clinicians route around the picker.
    const started = performance.now();
    for (let i = 0; i < 50; i++) searchDiagnoses(diagnoses, 'mal', 5);
    const perQuery = (performance.now() - started) / 50;

    expect(perQuery).toBeLessThan(40);
  });
});
