'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

/**
 * Smart care matching — the visible reasoning.
 *
 * This component exists to make a deterministic engine LEGIBLE, not to make
 * it look cleverer than it is. Every step names something the engine
 * genuinely did: it matched numbered rules written by clinicians, it read
 * the person's own record, it filtered facilities by declared capability.
 *
 * Three rules hold it honest:
 *
 *   - No step is invented. Each line corresponds to real work, and the
 *     counts come from the server's answer, not from a script.
 *   - It never implies a diagnosis. The words are "matched", "checked",
 *     "found" — never "diagnosed", "suspects", or "thinks".
 *   - The motion is short and stops. A screen that keeps shimmering while
 *     somebody waits with a sick child is theatre, and the whole point of
 *     this system is that it can be audited rather than believed.
 *
 * All animation here is switched off wholesale by the reduced-motion block
 * in globals.css.
 */

export interface MatchStep {
  /** What the engine did, in the citizen's language. */
  label: string;
  /** Filled in once the answer is known — "2 rules", "6 facilities". */
  detail?: string;
}

/**
 * The steps, revealed one at a time while the request is in flight.
 *
 * The reveal is cosmetic — the server answers in one call — so it is capped
 * short. Somebody waiting to find out where to take a sick child should not
 * be made to watch a progress theatre.
 */
export function MatchingSteps({
  steps,
  done,
  title = 'Smart care matching',
}: {
  steps: MatchStep[];
  /** True once the answer has arrived; every step then reads as complete. */
  done: boolean;
  title?: string;
}) {
  const [revealed, setRevealed] = useState(1);

  useEffect(() => {
    if (done) {
      setRevealed(steps.length);
      return;
    }
    if (revealed >= steps.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 420);
    return () => clearTimeout(t);
  }, [revealed, steps.length, done]);

  const active = done ? steps.length : revealed;

  return (
    <section
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border border-gov/25 bg-gradient-to-br from-gov-soft via-surface to-surface px-4 py-3.5"
    >
      {/* The sheen runs only while work is in flight, and never on a result. */}
      {!done && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-sheen bg-[linear-gradient(100deg,transparent_38%,rgb(var(--gov-bright)/0.10)_50%,transparent_62%)] bg-[length:200%_100%]"
        />
      )}

      <div className="relative mb-2.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gov-bright/12">
          <Icon name="diagnosis" size={12} className="text-gov-bright" />
        </span>
        <h3 className="font-mono text-label font-semibold uppercase tracking-wider text-gov-bright">
          {title}
        </h3>
        {!done && (
          <span className="ml-auto font-mono text-micro text-ink-faint">working…</span>
        )}
      </div>

      <ol className="relative space-y-1.5">
        {steps.slice(0, active).map((s, i) => {
          const isLast = i === active - 1;
          const settled = done || !isLast;
          return (
            <li
              key={s.label}
              className="flex animate-step-in items-baseline gap-2.5 text-sm"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  settled ? 'bg-gov-bright' : 'animate-pulse-dot bg-gov-bright/70'
                }`}
              />
              <span className={settled ? 'text-ink' : 'text-ink-soft'}>
                {s.label}
                {s.detail && (
                  <span className="ml-1.5 font-mono text-micro text-ink-faint">
                    {s.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * How a recommendation was reached, kept on screen after the fact.
 *
 * The steps above vanish once the answer lands; this stays. It is the
 * difference between a system that felt clever for a moment and one a
 * person can actually interrogate — and interrogability is the whole
 * argument for routing on rules rather than on a model.
 */
export function MatchTrace({
  rulesFired,
  capabilities,
  scope,
  historyLabels,
  labels,
}: {
  rulesFired: string[];
  capabilities: string[];
  scope: string;
  historyLabels: string[];
  labels: {
    how: string;
    rules: string;
    needs: string;
    searched: string;
    record: string;
  };
}) {
  const scopeWord: Record<string, string> = {
    SUBCOUNTY: labels.searched,
    COUNTY: labels.searched,
    NATIONAL: labels.searched,
    NONE: labels.searched,
  };

  return (
    <details className="group rounded-lg border border-rule bg-surface-alt px-3.5 py-2.5">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-wide text-ink-faint hover:text-ink-soft">
        {labels.how}
        <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <dl className="mt-2.5 space-y-1.5 text-micro">
        {rulesFired.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-ink-faint">{labels.rules}</dt>
            <dd className="font-mono text-ink-soft">{rulesFired.join(', ')}</dd>
          </div>
        )}
        {capabilities.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-ink-faint">{labels.needs}</dt>
            <dd className="text-ink-soft">
              {capabilities.map((c) => c.replace(/_/g, ' ').toLowerCase()).join(', ')}
            </dd>
          </div>
        )}
        {historyLabels.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-ink-faint">{labels.record}</dt>
            <dd className="text-ink-soft">{historyLabels.join(', ')}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink-faint">{scopeWord[scope] ?? labels.searched}</dt>
          <dd className="text-ink-soft">{scope.toLowerCase().replace(/_/g, ' ')}</dd>
        </div>
      </dl>
    </details>
  );
}
