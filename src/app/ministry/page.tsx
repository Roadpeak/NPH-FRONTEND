'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ministry,
  geo,
  hasSession,
  restoreSession,
  ApiError,
  type BurdenRow,
  type CountyRef,
  type Provenance,
} from '@/lib/api';

type SubcountyBurden = Awaited<ReturnType<typeof ministry.subcounty>>[number];
import { PORTALS } from '@/lib/portals';

/**
 * The Ministry dashboard.
 *
 * Every figure here comes from aggregate tables that never held a
 * person_id. There is deliberately no "view patients" affordance — not
 * greyed out, absent — because the data to populate it does not exist in
 * the tables this role can reach.
 *
 * Geography is rendered as a ranked county list rather than a choropleth:
 * NHP does not yet ship Kenya's boundary TopoJSON, and a decorative
 * approximation of a national map would be worse than an honest table. The
 * ranking answers the same question — where is the burden — without
 * implying a precision the data does not have.
 */

type Metric = 'BURDEN' | 'REFERRAL' | 'WORKFORCE' | 'SURVEILLANCE';

const METRIC_LABELS: Record<Metric, string> = {
  BURDEN: 'Disease burden',
  REFERRAL: 'Referral loop closure',
  WORKFORCE: 'Workforce',
  SURVEILLANCE: 'Surveillance',
};

/** Sequential navy ramp — single hue, colour-blind safe, never red-to-green. */
function rampFor(value: number, max: number): string {
  if (max <= 0) return 'bg-rule-soft';
  const ratio = value / max;
  if (ratio > 0.8) return 'bg-gov';
  if (ratio > 0.6) return 'bg-gov/75';
  if (ratio > 0.4) return 'bg-gov/55';
  if (ratio > 0.2) return 'bg-gov/35';
  return 'bg-gov/20';
}

export default function MinistryPage() {
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>('BURDEN');
  const [counties, setCounties] = useState<CountyRef[]>([]);
  const [burden, setBurden] = useState<BurdenRow[]>([]);
  const [closure, setClosure] = useState<
    Awaited<ReturnType<typeof ministry.referralClosure>>
  >([]);
  const [workforce, setWorkforce] = useState<
    Awaited<ReturnType<typeof ministry.workforce>>
  >([]);
  const [surveillance, setSurveillance] = useState<
    Awaited<ReturnType<typeof ministry.surveillance>>
  >([]);
  const [gaps, setGaps] = useState<Awaited<ReturnType<typeof ministry.careGaps>>>([]);
  const [prov, setProv] = useState<Provenance | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The subcounty drill, one county at a time.
   *
   * Deliberately not prefetched for all 47. A county breakdown is a
   * separate suppression decision — cells that survived at county level can
   * vanish at subcounty level — so it is fetched when asked for and cached
   * under the county it belongs to, never merged into the national numbers.
   */
  const [openCounty, setOpenCounty] = useState<string | null>(null);
  const [drill, setDrill] = useState<Record<string, SubcountyBurden[]>>({});
  const [drillNames, setDrillNames] = useState<Record<string, string>>({});
  const [drillBusy, setDrillBusy] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  async function toggleCounty(countyId: string) {
    if (openCounty === countyId) {
      setOpenCounty(null);
      return;
    }
    setOpenCounty(countyId);
    setDrillError(null);
    if (drill[countyId]) return;

    setDrillBusy(true);
    try {
      // The names come from the published administrative list, not from the
      // aggregate — an area with every cell suppressed still has a name, and
      // omitting it would silently shorten the list.
      const [rows, names] = await Promise.all([
        ministry.subcounty(countyId, '1F41.0'),
        geo.subcounties(countyId),
      ]);
      setDrill((d) => ({ ...d, [countyId]: rows }));
      setDrillNames((n) => {
        const next = { ...n };
        for (const s of names) next[s.id] = s.name;
        return next;
      });
    } catch (err) {
      setDrillError(
        err instanceof ApiError
          ? `${err.message} (${err.code})`
          : 'Could not load the subcounty breakdown',
      );
    } finally {
      setDrillBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.ministry.signInPath);
          return;
        }
        const [c, b, r, w, s, g, p] = await Promise.all([
          ministry.counties(),
          ministry.burden('1F41.0'),
          ministry.referralClosure(),
          ministry.workforce(),
          ministry.surveillance(),
          ministry.careGaps(),
          ministry.provenance(),
        ]);
        if (cancelled) return;
        setCounties(c);
        setBurden(b);
        setClosure(r);
        setWorkforce(w);
        setSurveillance(s);
        setGaps(g);
        setProv(p);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === 'NO_SESSION' || err.code === 'MFA_REQUIRED')) {
          router.replace(`${PORTALS.ministry.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Could not load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const nameOf = (id: string) => counties.find((c) => c.id === id)?.name ?? 'Unknown';
  const maxCases = Math.max(1, ...burden.map((b) => b.cases));
  const totalCases = burden.reduce((s, b) => s + b.cases, 0);
  const suppressedCounties = burden.filter((b) => b.cases === 0 && b.suppressedCells > 0);

  /**
   * Outbreak ranking.
   *
   * A notifiable condition seen at several facilities in one county is a
   * different thing from the same count inside a single facility: the first
   * suggests transmission in the community, the second may be one household
   * or one referral chain. Facility spread therefore sorts above raw count.
   */
  const spreading = surveillance.filter((s) => s.facilitiesInvolved > 1);
  const ranked = [...surveillance].sort(
    (a, b) => b.facilitiesInvolved - a.facilitiesInvolved || b.cases - a.cases,
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold">National Health Portal · Ministry</h1>
            <p className="font-mono text-micro text-ink-faint">
              Analyst · National scope
            </p>
          </div>
          {/* The role is stated, because what this screen CANNOT do is the
              point: aggregates only, no path to an individual record. */}
          <div className="flex items-center gap-3">
            <Link href="/ministry/admin" className="text-sm font-semibold text-gov underline">
              Administration
            </Link>
            <span className="chip chip-good">DE-IDENTIFIED AGGREGATES</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error && (
          <p className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical">
            {error}
          </p>
        )}

        <nav className="mb-6 flex flex-wrap gap-1.5">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded px-3 py-1.5 text-sm ${
                metric === m
                  ? 'bg-gov font-semibold text-surface'
                  : 'border border-rule text-ink-soft hover:bg-surface'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </nav>

        {metric === 'BURDEN' && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                <p className="eyebrow mb-1">Confirmed cases</p>
                <p className="text-2xl font-semibold tabular">{totalCases.toLocaleString()}</p>
                <p className="text-micro text-ink-faint">Malaria · last 30 days</p>
              </div>
              <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                <p className="eyebrow mb-1">Counties reporting</p>
                <p className="text-2xl font-semibold tabular">{burden.length}</p>
                <p className="text-micro text-ink-faint">of {counties.length}</p>
              </div>
              <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                <p className="eyebrow mb-1">Data completeness</p>
                <p className="text-2xl font-semibold tabular">
                  {prov?.completenessPercent ?? 0}%
                </p>
                {/* A rise in cases and a rise in REPORTING are
                    indistinguishable without this. */}
                <p className="text-micro text-ink-faint">
                  {prov?.facilitiesReporting ?? 0} of {prov?.facilitiesRegistered ?? 0}{' '}
                  facilities
                </p>
              </div>
            </div>

            <h2 className="eyebrow mb-2">Cases by county · malaria</h2>
            <p className="mb-2 text-micro text-ink-faint">
              Select a county for its subcounty breakdown.
            </p>
            <ul className="mb-4 space-y-1">
              {burden
                .filter((b) => b.cases > 0)
                .map((b) => {
                  const open = openCounty === b.countyId;
                  const rows = drill[b.countyId];
                  return (
                    <li key={b.countyId}>
                      <button
                        type="button"
                        onClick={() => toggleCounty(b.countyId)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-gov"
                      >
                        <span aria-hidden className="w-3 shrink-0 font-mono text-micro text-ink-faint">
                          {open ? '▾' : '▸'}
                        </span>
                        <span className="w-28 shrink-0 truncate text-sm">{nameOf(b.countyId)}</span>
                        <span className="h-4 flex-1 overflow-hidden rounded-sm bg-rule-soft">
                          <span
                            className={`block h-full ${rampFor(b.cases, maxCases)}`}
                            style={{ width: `${(b.cases / maxCases) * 100}%` }}
                          />
                        </span>
                        <span className="w-12 shrink-0 text-right font-mono text-sm tabular">
                          {b.cases}
                        </span>
                      </button>

                      {open && (
                        <div className="ml-4 mt-1 border-l-2 border-rule pl-3">
                          {drillBusy && !rows && (
                            <p className="py-1.5 text-micro text-ink-faint">Loading…</p>
                          )}
                          {drillError && !rows && (
                            <p className="py-1.5 text-micro text-critical">{drillError}</p>
                          )}
                          {rows && rows.length === 0 && (
                            <p className="py-1.5 text-micro text-ink-faint">
                              No subcounty rows for this period.
                            </p>
                          )}
                          {rows && rows.length > 0 && (
                            <ul className="space-y-1 py-1">
                              {rows.map((s) => (
                                <li key={s.subcountyId} className="flex items-center gap-3">
                                  <span className="w-24 shrink-0 truncate text-micro text-ink-soft">
                                    {drillNames[s.subcountyId] ?? 'Unknown area'}
                                  </span>
                                  {s.cases > 0 ? (
                                    <>
                                      <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-rule-soft">
                                        <span
                                          className={`block h-full ${rampFor(s.cases, Math.max(1, ...rows.map((r) => r.cases)))}`}
                                          style={{
                                            width: `${(s.cases / Math.max(1, ...rows.map((r) => r.cases))) * 100}%`,
                                          }}
                                        />
                                      </span>
                                      <span className="w-12 shrink-0 text-right font-mono text-micro tabular">
                                        {s.cases}
                                      </span>
                                    </>
                                  ) : (
                                    /* Suppressed, and said so in words. A hatched
                                       bar with a zero beside it is read as "no
                                       disease here" by everyone who is not the
                                       person who built the screen. */
                                    <>
                                      <span className="h-2.5 flex-1 rounded-sm border border-dashed border-rule bg-transparent" />
                                      <span className="w-12 shrink-0 text-right font-mono text-micro text-ink-faint">
                                        —
                                      </span>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {rows && rows.some((s) => s.cases === 0) && (
                            <p className="pb-1 text-micro text-ink-faint">
                              — fewer than {prov?.suppressionThreshold ?? 10} cases, withheld
                              to protect identity. Subcounty totals do not sum to the county
                              figure.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>

            {suppressedCounties.length > 0 && (
              /* Never render a suppressed cell as zero, and never leave it
                 blank — both read as "no disease here". */
              <div className="mb-4 rounded-md border border-rule bg-surface-alt px-3 py-2.5">
                <p className="text-sm">
                  <span className="mr-2 inline-block h-3 w-6 rounded-sm border border-rule bg-rule-soft align-middle" />
                  {suppressedCounties.length}{' '}
                  {suppressedCounties.length === 1 ? 'county' : 'counties'} suppressed —
                  fewer than {prov?.suppressionThreshold ?? 10} cases
                </p>
                <p className="text-micro text-ink-faint">
                  {suppressedCounties.map((b) => nameOf(b.countyId)).join(' · ')}
                </p>
              </div>
            )}

            {gaps.length > 0 && (
              <>
                <h2 className="eyebrow mb-2 mt-6">Care gaps · lost to follow-up</h2>
                <ul className="space-y-1.5">
                  {gaps.map((g) => (
                    <li
                      key={g.icd11Code}
                      className="flex items-center justify-between rounded border border-caution/40 bg-caution-soft px-3 py-2"
                    >
                      <span className="font-mono text-sm">{g.icd11Code}</span>
                      <span className="font-mono text-sm font-semibold tabular text-caution">
                        {g.lostToFollowUp.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {metric === 'REFERRAL' && (
          <>
            {/* The pitch number: producing it at all requires linking a
                referral issued at one facility to an arrival at another and
                an outcome returned to the first. Aggregate reporting cannot
                do it; a longitudinal record can. */}
            <h2 className="eyebrow mb-2">Referral loop closure by county</h2>
            {closure.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No referrals issued in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="pb-2 text-left font-mono text-label uppercase tracking-wider text-ink-faint">
                        County
                      </th>
                      <th className="pb-2 text-right font-mono text-label uppercase tracking-wider text-ink-faint">
                        Issued
                      </th>
                      <th className="pb-2 text-right font-mono text-label uppercase tracking-wider text-ink-faint">
                        Arrived
                      </th>
                      <th className="pb-2 text-right font-mono text-label uppercase tracking-wider text-ink-faint">
                        Closed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {closure.map((r) => (
                      <tr key={r.countyId} className="border-t border-rule-soft">
                        <td className="py-2">{nameOf(r.countyId)}</td>
                        <td className="py-2 text-right tabular">{r.issued}</td>
                        <td className="py-2 text-right tabular">
                          {r.arrivalRatePercent}%
                        </td>
                        <td className="py-2 text-right font-semibold tabular">
                          {r.closureRatePercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 max-w-prose text-micro text-ink-faint">
              A funnel, not a single figure: &ldquo;40% closure&rdquo; alone hides
              whether patients never arrived or arrived and were never reported
              on — completely different problems with different fixes.
            </p>
          </>
        )}

        {metric === 'WORKFORCE' && (
          <>
            <h2 className="eyebrow mb-2">Active clinicians by county</h2>
            {workforce.length === 0 ? (
              <p className="text-sm text-ink-faint">No check-ins in this period.</p>
            ) : (
              <ul className="space-y-1">
                {workforce.map((w) => (
                  <li key={w.countyId} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm">
                      {nameOf(w.countyId)}
                    </span>
                    <span className="h-4 flex-1 overflow-hidden rounded-sm bg-rule-soft">
                      <span
                        className={`block h-full ${rampFor(
                          w.activeClinicians,
                          Math.max(1, ...workforce.map((x) => x.activeClinicians)),
                        )}`}
                        style={{
                          width: `${
                            (w.activeClinicians /
                              Math.max(1, ...workforce.map((x) => x.activeClinicians))) *
                            100
                          }%`,
                        }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-sm tabular">
                      {w.activeClinicians}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 max-w-prose text-micro text-ink-faint">
              Derived from actual check-ins — who is working, not who is on an
              establishment list.
            </p>
          </>
        )}

        {metric === 'SURVEILLANCE' && (
          <>
            <h2 className="eyebrow mb-2">Notifiable disease signals</h2>
            {surveillance.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No notifiable conditions recorded in this period.
              </p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                    <p className="eyebrow mb-1">Signals</p>
                    <p className="text-2xl font-semibold tabular">{surveillance.length}</p>
                    <p className="text-micro text-ink-faint">disease · county clusters</p>
                  </div>
                  <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                    <p className="eyebrow mb-1">Spreading</p>
                    <p className="text-2xl font-semibold tabular text-critical">
                      {spreading.length}
                    </p>
                    {/* Multi-facility is the signal that separates an outbreak
                        from one family walking into one clinic. */}
                    <p className="text-micro text-ink-faint">seen at 2+ facilities</p>
                  </div>
                  <div className="rounded-lg border border-rule bg-surface px-4 py-3">
                    <p className="eyebrow mb-1">Counties affected</p>
                    <p className="text-2xl font-semibold tabular">
                      {new Set(surveillance.map((s) => s.countyId)).size}
                    </p>
                    <p className="text-micro text-ink-faint">of {counties.length}</p>
                  </div>
                </div>

                {/* Ordered by concern, not alphabetically. A cluster across
                    several facilities outranks a larger count inside one,
                    because transmission is the thing worth acting on. */}
                <ul className="space-y-1.5">
                  {ranked.map((s, i) => {
                    const spread = s.facilitiesInvolved > 1;
                    return (
                      <li
                        key={`${s.icd11Code}-${s.countyId}-${i}`}
                        className={`rounded border px-3 py-2.5 ${
                          spread
                            ? 'border-critical/30 bg-critical-soft'
                            : 'border-caution/40 bg-caution-soft'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p
                            className={`text-sm font-semibold ${
                              spread ? 'text-critical' : 'text-ink'
                            }`}
                          >
                            {s.title}
                          </p>
                          <span
                            className={`chip ${spread ? 'chip-critical' : 'chip-caution'}`}
                          >
                            {spread ? 'MULTI-FACILITY' : 'SINGLE FACILITY'}
                          </span>
                        </div>
                        <p className="text-micro text-ink-soft">
                          {nameOf(s.countyId)} · {s.cases}{' '}
                          {s.cases === 1 ? 'case' : 'cases'} · {s.facilitiesInvolved}{' '}
                          {s.facilitiesInvolved === 1 ? 'facility' : 'facilities'} ·{' '}
                          <span className="font-mono">{s.icd11Code}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="mt-3 max-w-prose text-micro text-ink-faint">
              Raised automatically when a reportable condition is recorded.
              Manual notifiable-disease reporting is under-complied with
              everywhere, which is why this cannot depend on a clinician
              remembering.
            </p>
          </>
        )}
      </main>

      {/* Provenance. A national figure with no denominator, period or
          completeness rate is one someone will misquote in a press
          conference. */}
      <footer className="border-t border-rule bg-surface-alt">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <p className="eyebrow mb-1.5">Data provenance</p>
          {prov ? (
            <div className="space-y-0.5 text-micro text-ink-soft">
              <p>
                Aggregated from {prov.facilitiesReporting} of{' '}
                {prov.facilitiesRegistered} registered facilities ·{' '}
                {new Date(prov.periodFrom).toLocaleDateString('en-GB')} to{' '}
                {new Date(prov.periodTo).toLocaleDateString('en-GB')}
              </p>
              <p>{prov.suppressionNote}</p>
              <p className="text-ink-faint">{prov.denominatorNote}</p>
            </div>
          ) : (
            <p className="text-micro text-ink-faint">Loading…</p>
          )}
        </div>
      </footer>
    </div>
  );
}
