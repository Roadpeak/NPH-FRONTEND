'use client';

import { useEffect, useState } from 'react';
import { nhp, ApiError, type ClinicalBrief, type TriageAssist, type FacilityMatch } from '@/lib/api';
import { Icon } from './icons';

/**
 * Clinical decision support.
 *
 * Advisory, deterministic, and deliberately quiet. Three rules shape every
 * component here:
 *
 *   - Nothing suggests a diagnosis or a drug. These tools answer questions
 *     the clinician asked; the clinician decides.
 *   - Nothing is generated. The brief is assembled from rows somebody
 *     wrote, and it says so, so nobody mistakes it for a model's summary.
 *   - An empty result is never presented as a safety guarantee. "No
 *     recorded allergies" is not "no allergies", and the difference is the
 *     whole point of saying it out loud.
 */

/** The patient in a paragraph, assembled from the structured record. */
export function PatientBrief({ nhpId }: { nhpId: string }) {
  const [brief, setBrief] = useState<ClinicalBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    nhp
      .brief(nhpId)
      .then((b) => !cancelled && setBrief(b))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'unavailable'));
    return () => {
      cancelled = true;
    };
  }, [nhpId]);

  if (error) return null;
  if (!brief) return null;

  return (
    <section className="rounded-xl border border-gov/25 bg-gradient-to-br from-gov-soft via-surface to-surface px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gov-bright/12">
          <Icon name="record" size={12} className="text-gov-bright" />
        </span>
        <h3 className="font-mono text-label font-semibold uppercase tracking-wider text-gov-bright">
          At a glance
        </h3>
        <span className="ml-auto rounded-full border border-rule px-2 py-0.5 font-mono text-micro text-ink-faint">
          from record
        </span>
      </div>
      <p className="text-sm leading-relaxed text-ink">{brief.brief}</p>
      {/*
        Said plainly. A clinician should never have to wonder whether a
        sentence on this screen was written by a person or produced by a
        model — here it is neither: it is assembled from the record.
      */}
      <p className="mt-2 text-micro text-ink-faint">
        Assembled from this patient&rsquo;s record. Nothing here was generated.
      </p>
    </section>
  );
}

/**
 * Triage assist.
 *
 * Differs from the citizen-facing route in one deliberate way: it NAMES the
 * red-flag rules that matched but are inactive. A clinician is exactly the
 * person who can say whether RF001 should be signed off, and hiding it from
 * them is how a rule set stays unreviewed forever.
 */
export function TriageAssistPanel({ nhpId }: { nhpId: string }) {
  const [symptomText, setSymptomText] = useState('');
  const [result, setResult] = useState<TriageAssist | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const codes = symptomText
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
    if (!codes.length) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await nhp.triageAssist(nhpId, codes));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not evaluate these symptoms');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-rule bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gov-bright/12">
          <Icon name="diagnosis" size={12} className="text-gov-bright" />
        </span>
        <h3 className="font-mono text-label font-semibold uppercase tracking-wider text-gov-bright">
          Triage assist
        </h3>
        {/* The word that keeps this a tool rather than a verdict. */}
        <span className="ml-auto rounded-full border border-rule px-2 py-0.5 font-mono text-micro text-ink-faint">
          advisory
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={symptomText}
          onChange={(e) => setSymptomText(e.target.value)}
          placeholder="chest_pain, breathlessness"
          className="min-w-[14rem] flex-1 rounded border border-rule bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !symptomText.trim()}
          className="rounded border border-rule px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check rules'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2 text-sm">
          {/*
            The inactive red flags, named. This is the feedback loop that
            gets the rule set signed off — and the reason this panel exists
            at all rather than only the citizen one.
          */}
          {result.inactiveRulesMatched.length > 0 && (
            <p className="rounded border border-caution/40 bg-caution-soft px-3 py-2 text-caution">
              <span className="font-semibold">
                {result.inactiveRulesMatched.join(', ')} matched but{' '}
                {result.inactiveRulesMatched.length === 1 ? 'is' : 'are'} not active.
              </span>{' '}
              Awaiting clinical review. Use your own judgement.
            </p>
          )}

          {result.urgency && (
            <p className="text-ink">
              <span className="text-ink-faint">Urgency: </span>
              <span className="font-semibold">{result.urgency}</span>
            </p>
          )}

          {result.requiredCapabilities.length > 0 && (
            <p className="text-ink-soft">
              <span className="text-ink-faint">Indicated: </span>
              {result.requiredCapabilities.join(', ')} · minimum KEPH level{' '}
              {result.minKephLevel}
            </p>
          )}

          {result.historyFactors.length > 0 && (
            <p className="text-ink-soft">
              <span className="text-ink-faint">From their record: </span>
              {result.historyFactors.map((f) => f.label).join(', ')}
            </p>
          )}

          <p className="text-micro text-ink-faint">{result.disclaimer}</p>
        </div>
      )}
    </section>
  );
}

/**
 * Where can this patient be sent?
 *
 * Shown at disposition, because that is when the question is actually
 * asked. The facility the clinician is standing in is excluded by the
 * server — referring somebody to the building they are already in is not a
 * referral.
 */
export function DestinationFinder() {
  const [capabilities, setCapabilities] = useState('');
  const [destinations, setDestinations] = useState<FacilityMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    const codes = capabilities
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (!codes.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await nhp.destinations(codes);
      setDestinations(r.destinations);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not find destinations');
      setDestinations(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-rule bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gov-bright/12">
          <Icon name="facility" size={12} className="text-gov-bright" />
        </span>
        <h3 className="font-mono text-label font-semibold uppercase tracking-wider text-gov-bright">
          Where can they be sent
        </h3>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={capabilities}
          onChange={(e) => setCapabilities(e.target.value)}
          placeholder="SURGERY_GENERAL, BLOOD_BANK"
          className="min-w-[14rem] flex-1 rounded border border-rule bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={find}
          disabled={busy || !capabilities.trim()}
          className="rounded border border-rule px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt disabled:opacity-50"
        >
          {busy ? 'Finding…' : 'Find'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}

      {destinations && (
        <ul className="mt-3 divide-y divide-rule rounded border border-rule">
          {destinations.length === 0 ? (
            <li className="px-3 py-4 text-sm text-ink-soft">
              No facility nearby holds all of those. Widen the requirement or
              refer to the county referral hospital.
            </li>
          ) : (
            destinations.map((d, i) => (
              <li
                key={d.id}
                className="flex animate-step-in flex-wrap items-baseline gap-x-3 px-3 py-2"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="flex-1 text-sm text-ink">
                  {d.name}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-gov-bright/12 px-1.5 py-0.5 font-mono text-micro font-semibold uppercase tracking-wide text-gov-bright">
                      nearest
                    </span>
                  )}
                </span>
                <span className="text-micro text-ink-faint">
                  Level {d.kephLevel}
                  {typeof d.distanceKm === 'number' && ` · ${d.distanceKm.toFixed(0)} km`}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}
