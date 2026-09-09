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
import {
  StatCard,
  BarChart,
  Funnel,
  ChartLegend,
  Donut,
  GroupedBarChart,
  LineChart,
  SERIES,
  Panel,
  MetricStrip,
  BigStat,
  ProgressRow,
} from '@/components/charts';

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
  const [trend, setTrend] = useState<
    Awaited<ReturnType<typeof ministry.burdenTrend>>
  >([]);
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
        /*
         * Each panel loads on its own terms.
         *
         * The Ministry roles are deliberately split — an ANALYST reads
         * aggregates and only SURVEILLANCE reads notifiable signals — so a
         * 403 on one panel is the system working, not an outage. Under
         * Promise.all that single refusal rejected the whole batch and
         * blanked six panels the analyst was entitled to read, which looks
         * exactly like a broken dashboard.
         *
         * A panel the role cannot reach stays empty; anything else still
         * throws, because a genuine failure must not be swallowed into a
         * silent zero on a screen where zero is a claim about disease.
         */
        const allowEmpty = <T,>(fallback: T) => (err: unknown) => {
          if (err instanceof ApiError && err.code === 'WRONG_MINISTRY_ROLE') return fallback;
          throw err;
        };

        const [c, t, b, r, w, s, g, p] = await Promise.all([
          ministry.counties(),
          ministry.burdenTrend().catch(allowEmpty([])),
          ministry.burden('1F41.0'),
          ministry.referralClosure().catch(allowEmpty([])),
          ministry.workforce().catch(allowEmpty([])),
          ministry.surveillance().catch(allowEmpty([])),
          ministry.careGaps().catch(allowEmpty([])),
          ministry.provenance(),
        ]);
        if (cancelled) return;
        setCounties(c);
        setTrend(t);
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

  /*
   * Kenya's forty-seven counties, as the denominator.
   *
   * `counties.length` counted every row in the table, which is fifty on a
   * database the test suite has run against — it leaves fixture counties
   * behind. "5 of 50" is wrong on a Ministry dashboard in a way somebody
   * would quote, so the denominator is the real administrative divisions:
   * codes 001 to 047.
   */
  const realCounties = counties.filter((c) => /^0(0[1-9]|[1-3]\d|4[0-7])$/.test(c.code));
  const countyTotal = realCounties.length || counties.length;
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
      {/*
        A top navigation bar, not a sidebar.

        The rail worked but ate 240px of a screen whose whole job is showing
        charts wide. Putting the views in the header returns that width to
        the content and matches how a reader scans a report: masthead,
        title, tabs, then the figures.
      */}
      {/* The blue band, as on the other portals and on health.go.ke. */}
      <header className="bg-gov-bright text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
          <span className="font-serif text-lg font-medium">Administration</span>
          <span className="hidden font-mono text-micro text-white/60 sm:inline">
            National Health Portal
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-white/70 md:inline">
              Analyst · National scope
            </span>
            <Link
              href="/ministry/admin"
              className="inline-flex min-h-11 items-center rounded-md border border-white/45 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Administration
            </Link>
            {/* Kept in its own green: this badge states what the portal
                CANNOT do, and a badge that reads as decoration is one
                nobody registers. */}
            <span className="chip chip-good">DE-IDENTIFIED AGGREGATES</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* The page header: what this screen is, and the period it covers. */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              National health statistics
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">
              De-identified aggregates. No path from this screen to an
              individual record.
            </p>
          </div>
          {prov && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="eyebrow mb-0.5">Period from</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {new Date(prov.periodFrom).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-0.5">Period to</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {new Date(prov.periodTo).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-0.5">Facilities reporting</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {prov.facilitiesReporting} of {prov.facilitiesRegistered}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Underlined tabs, the reference's navigation for switching views. */}
        <nav className="mb-5 flex flex-wrap items-center gap-x-1 border-b border-rule">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              aria-current={metric === m ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${
                metric === m
                  ? 'border-gov-bright font-semibold text-gov-bright'
                  : 'border-transparent text-ink-faint hover:text-ink-soft'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </nav>

        {error && (
          <p className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical">
            {error}
          </p>
        )}

        {metric === 'BURDEN' && (
          <>
            {/*
              Laid out as an analytics dashboard.

              Card titles are bold dark sans with a grey subtitle beneath;
              figures are large with their label UNDER them. The page used a
              mono uppercase eyebrow for every heading and put a small grey
              caption above every number, which gave a card title, a field
              label and a section marker identical weight — nothing looked
              more important than anything else, and the eye read four
              labels before reaching the first figure.
            */}
            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              {/*
                The reference's shape: the metrics and the chart they
                describe live in ONE panel, with the smaller figures stacked
                beside it. Separating a strip of numbers from the chart that
                explains them makes a reader work to connect the two.
              */}
              <Panel
                title="Malaria burden"
                subtitle="Confirmed cases across reporting counties"
                className="lg:col-span-2"
              >
                <MetricStrip
                  metrics={[
                    { label: 'Confirmed cases', value: totalCases, tone: 'c1' },
                    {
                      label: 'First-ever episodes',
                      value: burden.reduce((n, b) => n + b.newCases, 0),
                      tone: 'c2',
                    },
                    { label: 'Counties reporting', value: burden.length, tone: 'c4' },
                    {
                      label: 'Facilities returning',
                      value: prov?.facilitiesReporting ?? 0,
                      tone: 'c6',
                    },
                  ]}
                />

                <div className="mt-5">
                  <LineChart
                    periods={trend.map((t) =>
                      new Date(t.date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      }),
                    )}
                    series={[
                      {
                        label: 'All confirmed',
                        tone: 'c1',
                        points: trend.map((t) => t.cases),
                      },
                      {
                        label: 'First-ever episode',
                        tone: 'c3',
                        points: trend.map((t) => t.newCases),
                      },
                    ]}
                  />
                </div>
              </Panel>

              <div className="space-y-4">
                <BigStat
                  value={prov?.completenessPercent ?? 0}
                  unit="%"
                  label={`Data completeness · ${prov?.facilitiesReporting ?? 0} of ${prov?.facilitiesRegistered ?? 0} facilities`}
                />
                <Panel title="Coverage" subtitle="Counties this period reaches">
                  <div className="space-y-3.5">
                    <ProgressRow
                      label="Share of Kenya's counties"
                      value={burden.length}
                      total={countyTotal}
                      tone="c1"
                    />
                    <ProgressRow
                      label="Counties with cases suppressed"
                      value={suppressedCounties.length}
                      total={Math.max(1, burden.length)}
                      tone="caution"
                    />
                  </div>
                </Panel>
              </div>
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              <Panel
                title="New against repeat"
                subtitle="A county whose cases are almost all repeats has a treatment problem, not an outbreak"
              >
                <Donut
                  centreValue={totalCases.toLocaleString('en-GB')}
                  centreLabel="cases"
                  slices={[
                    {
                      label: 'First-ever episode',
                      value: burden.reduce((n, b) => n + b.newCases, 0),
                      tone: 'c1',
                    },
                    {
                      label: 'Seen before',
                      value: Math.max(
                        0,
                        totalCases - burden.reduce((n, b) => n + b.newCases, 0),
                      ),
                      tone: 'c2',
                    },
                  ]}
                />
              </Panel>

            </div>

            <Panel
              title="Cases by county"
              subtitle="Select a county for its subcounty breakdown"
            >
            <ul className="mb-4 space-y-1">
              {burden
                .filter((b) => b.cases > 0)
                .map((b, i) => {
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
                          {/* One colour per county, cycling. The ramp before
                              this shaded by VALUE, which meant the same
                              county changed colour as the period changed —
                              and a darker bar read as a worse one when it
                              only meant a bigger one. */}
                          <span
                            className="block h-full rounded-sm"
                            style={{
                              width: `${(b.cases / maxCases) * 100}%`,
                              backgroundColor: `rgb(var(--${SERIES[i % SERIES.length]}))`,
                            }}
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

            <ChartLegend
              // Only the mark that needs explaining. The heading above
              // already says the bars are confirmed cases, and a legend
              // that repeats it makes the one entry that carries new
              // information harder to find.
              items={[{ swatch: 'hatch', label: 'Withheld for disclosure control' }]}
            />
            </Panel>

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
            {closure.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No referrals issued in this period.
              </p>
            ) : (
              <>
                {(() => {
                  const issued = closure.reduce((n, r) => n + r.issued, 0);
                  const arrived = closure.reduce((n, r) => n + r.arrived, 0);
                  const completed = closure.reduce((n, r) => n + r.completed, 0);
                  return (
                    <>
                      <div className="mb-6 grid gap-3 sm:grid-cols-3">
                        <StatCard
                          label="Referrals issued"
                          value={issued}
                          caption="This period, nationally"
                        />
                        <StatCard
                          label="Patient arrived"
                          value={issued ? Math.round((arrived / issued) * 100) : 0}
                          unit="%"
                          caption={`${arrived.toLocaleString('en-GB')} of ${issued.toLocaleString('en-GB')}`}
                          tone={arrived / Math.max(1, issued) < 0.5 ? 'caution' : 'default'}
                        />
                        <StatCard
                          label="Loop closed"
                          value={issued ? Math.round((completed / issued) * 100) : 0}
                          unit="%"
                          caption="Outcome returned to the referrer"
                          tone={completed / Math.max(1, issued) < 0.5 ? 'critical' : 'good'}
                        />
                      </div>

                      <h2 className="eyebrow mb-3">The referral funnel</h2>
                      {/*
                        Drawn as a funnel because that is what it is. Three
                        percentage columns in a table were exactly the
                        presentation the note below warns against: they hide
                        WHERE the loss happens, and a patient who never
                        arrived is a different problem from one who arrived
                        and was never reported on.
                      */}
                      <Funnel
                        stages={[
                          {
                            label: 'Issued',
                            value: issued,
                            detail: 'A clinician referred the patient onward',
                          },
                          {
                            label: 'Arrived',
                            value: arrived,
                            detail: 'The receiving facility checked them in',
                          },
                          {
                            label: 'Closed',
                            value: completed,
                            detail: 'An outcome came back to whoever referred them',
                          },
                        ]}
                      />
                    </>
                  );
                })()}

                <section className="card card-body mt-6">
                  <h2 className="eyebrow mb-1">Where each county loses referrals</h2>
                  <p className="mb-4 text-micro text-ink-faint">
                    Three bars per county, all from the same baseline. A
                    stacked bar would put two of the three on shifted
                    offsets, and the comparison a reader wants is between
                    them.
                  </p>
                  <GroupedBarChart
                    rows={[...closure]
                      .sort((a, b) => a.closureRatePercent - b.closureRatePercent)
                      .map((r) => ({
                        key: r.countyId,
                        label: nameOf(r.countyId),
                        values: [r.issued, r.arrived, r.completed],
                      }))}
                    series={[
                      { label: 'Issued', tone: 'c1' },
                      { label: 'Arrived', tone: 'c2' },
                      { label: 'Closed', tone: 'c4' },
                    ]}
                  />
                </section>

                <section className="card card-body mt-4">
                  <h2 className="eyebrow mb-3">Closure rate by county</h2>
                  <BarChart
                    data={[...closure]
                      .sort((a, b) => a.closureRatePercent - b.closureRatePercent)
                      .map((r) => ({
                        key: r.countyId,
                        label: nameOf(r.countyId),
                        value: r.closureRatePercent,
                        // Worst first, and flagged: this list is read to find
                        // where to intervene, not to celebrate the top.
                        emphasis: r.closureRatePercent < 50,
                      }))}
                    max={100}
                    unit="%"
                  />
                  <ChartLegend
                    items={[{ swatch: 'caution', label: 'Below 50% — loop rarely closes' }]}
                  />
                </section>
              </>
            )}
            <p className="mt-4 max-w-prose text-micro text-ink-faint">
              A funnel, not a single figure: &ldquo;40% closure&rdquo; alone hides
              whether patients never arrived or arrived and were never reported
              on — completely different problems with different fixes.
            </p>
          </>
        )}

        {metric === 'WORKFORCE' && (
          <>
            {workforce.length === 0 ? (
              <p className="text-sm text-ink-faint">No check-ins in this period.</p>
            ) : (
              (() => {
                const total = workforce.reduce((n, w) => n + w.activeClinicians, 0);
                const covered = workforce.filter((w) => w.activeClinicians > 0).length;
                const empty = countyTotal - covered;
                return (
                  <>
                    <div className="mb-4 grid gap-4 lg:grid-cols-3">
                      <Panel
                        title="Clinical workforce"
                        subtitle="Derived from actual check-ins — who is working, not who is on an establishment list"
                        className="lg:col-span-2"
                      >
                        <MetricStrip
                          metrics={[
                            { label: 'Clinicians working', value: total, tone: 'c1' },
                            { label: 'Counties covered', value: covered, tone: 'c4' },
                            { label: 'Counties with nobody', value: empty, tone: 'critical' },
                            {
                              label: 'Average per county',
                              value: covered ? Math.round(total / covered) : 0,
                              tone: 'c6',
                            },
                          ]}
                        />
                        <div className="mt-5 border-t border-rule-soft pt-4">
                          <ProgressRow
                            label="Counties with at least one clinician working"
                            value={covered}
                            total={countyTotal}
                            tone="c4"
                          />
                        </div>
                      </Panel>

                      <BigStat
                        value={empty}
                        label={`Counties where nobody checked in · of ${countyTotal}`}
                      />
                    </div>

                    <Panel
                      title="Active clinicians by county"
                      subtitle="Counties with nobody working are flagged"
                    >
                      <BarChart
                        data={[...workforce]
                          .sort((a, b) => b.activeClinicians - a.activeClinicians)
                          .map((w, i) => ({
                            key: w.countyId,
                            label: nameOf(w.countyId),
                            value: w.activeClinicians,
                            tone: SERIES[i % SERIES.length],
                            emphasis: w.activeClinicians === 0,
                          }))}
                      />
                      <ChartLegend
                        items={[{ swatch: 'caution', label: 'Nobody working in this county' }]}
                      />
                    </Panel>
                  </>
                );
              })()
            )}
          </>
        )}

        {metric === 'SURVEILLANCE' && (
          <>
            {surveillance.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No notifiable conditions recorded in this period.
              </p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Signals"
                    value={surveillance.length}
                    caption="Disease · county clusters"
                  />
                  <StatCard
                    label="Spreading"
                    value={spreading.length}
                    caption="Seen at 2 or more facilities"
                    tone={spreading.length > 0 ? 'critical' : 'good'}
                  />
                  <StatCard
                    label="Counties affected"
                    value={new Set(surveillance.map((x) => x.countyId)).size}
                    caption={`of ${countyTotal}`}
                  />
                  <StatCard
                    label="Cases in signals"
                    value={surveillance.reduce((n, x) => n + x.cases, 0)}
                    caption="Across every cluster"
                  />
                </div>

                <div className="mb-5 grid gap-4 lg:grid-cols-3">
                  {/* Contained against spreading. The distinction that
                      decides whether anyone travels tonight, so it gets a
                      shape rather than a sentence. */}
                  <section className="card card-body">
                    <h2 className="eyebrow mb-3">Contained against spreading</h2>
                    <Donut
                      centreValue={surveillance.length}
                      centreLabel="signals"
                      slices={[
                        {
                          label: 'Multi-facility',
                          value: spreading.length,
                          tone: 'critical',
                        },
                        {
                          label: 'Single facility',
                          value: surveillance.length - spreading.length,
                          tone: 'caution',
                        },
                      ]}
                    />
                    <p className="mt-3 text-micro text-ink-faint">
                      One family walking into one clinic is not an outbreak.
                      Two facilities is transmission.
                    </p>
                  </section>

                  {/* Which counties carry the load. A ranked bar answers
                      "where do we send people" in one look. */}
                  <section className="card card-body lg:col-span-2">
                    <h2 className="eyebrow mb-3">Signal load by county</h2>
                    <BarChart
                      data={Object.entries(
                        surveillance.reduce<Record<string, number>>((acc, x) => {
                          acc[x.countyId] = (acc[x.countyId] ?? 0) + x.cases;
                          return acc;
                        }, {}),
                      )
                        .sort((a, b) => b[1] - a[1])
                        .map(([countyId, cases]) => ({
                          key: countyId,
                          label: nameOf(countyId),
                          value: cases,
                          emphasis: surveillance.some(
                            (x) => x.countyId === countyId && x.facilitiesInvolved > 1,
                          ),
                        }))}
                    />
                    <ChartLegend
                      items={[
                        { swatch: 'gov', label: 'Cases in notifiable clusters' },
                        { swatch: 'caution', label: 'County has a spreading cluster' },
                      ]}
                    />
                  </section>
                </div>

                <h2 className="eyebrow mb-2">Signals, most concerning first</h2>
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
          {/* Provenance. A national figure with no denominator, period or
              completeness rate is one someone will misquote in a press
              conference. It sits with the numbers rather than in a page
              footer, because it is a caveat on THEM. */}
          <div className="mt-8 rounded-lg border border-rule bg-surface-alt px-4 py-4">
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
      </main>
    </div>
  );
}
