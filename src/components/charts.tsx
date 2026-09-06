/**
 * Charts for the Ministry dashboard.
 *
 * Hand-drawn SVG rather than a charting library, following Sparkline: the
 * whole file is smaller than the import would be, and a Ministry analyst on
 * a county office connection should not wait on 300kB of chart runtime to
 * see four bars.
 *
 * Three rules run through all of these, and they are what makes them fit a
 * government statistics context rather than a startup dashboard:
 *
 *   1. NO DECORATIVE COLOUR. Every hue means something — a suppressed cell,
 *      a spreading cluster, a stage in a funnel. A palette that varies for
 *      visual interest teaches an analyst to read meaning into hue that is
 *      not there.
 *
 *   2. THE NUMBER IS ALWAYS PRESENT. A bar is an aid to comparison, never
 *      the only way to read a value. Somebody quoting this in a briefing
 *      needs the figure, and somebody using a screen reader needs it at all.
 *
 *   3. SUPPRESSION IS VISIBLE. A cell hidden for disclosure control must
 *      look different from a cell that is genuinely zero. Conflating them is
 *      how "no cases" gets reported from a county that simply had too few to
 *      publish.
 */

/** Formats a count for a dashboard: 1,234 rather than 1234. */
function fmt(n: number): string {
  return n.toLocaleString('en-GB');
}

/* ------------------------------------------------------------------ cards */

/**
 * A headline figure.
 *
 * `trend` is the change against the previous period, as a percentage.
 * Deliberately optional: a trend against a period with incomplete reporting
 * is worse than no trend at all, so it appears only where the caller has
 * checked that both periods are comparable.
 */
export function StatCard({
  label,
  value,
  unit,
  caption,
  trend,
  trendGood,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  unit?: string;
  caption?: string;
  /** Percentage change on the previous period. */
  trend?: number | null;
  /** Whether a RISE is good. Deaths rising is not the same as coverage rising. */
  trendGood?: 'up' | 'down';
  tone?: 'default' | 'critical' | 'caution' | 'good';
}) {
  const toneRing =
    tone === 'critical'
      ? 'border-critical/30'
      : tone === 'caution'
        ? 'border-caution/40'
        : tone === 'good'
          ? 'border-good/30'
          : 'border-rule';

  const rising = typeof trend === 'number' && trend > 0;
  const flat = typeof trend === 'number' && Math.round(trend) === 0;
  // Whether this direction is welcome depends on the measure, which only the
  // caller knows. Absent that, a change is reported without a judgement.
  const trendTone = !trendGood
    ? 'text-ink-soft'
    : flat
      ? 'text-ink-faint'
      : (rising && trendGood === 'up') || (!rising && trendGood === 'down')
        ? 'text-good'
        : 'text-critical';

  return (
    <div className={`rounded-lg border bg-surface px-4 py-3.5 ${toneRing}`}>
      <p className="eyebrow mb-1.5">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums leading-none">
          {typeof value === 'number' ? fmt(value) : value}
        </span>
        {unit && <span className="text-sm text-ink-soft">{unit}</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {caption && <span className="text-micro text-ink-faint">{caption}</span>}
        {typeof trend === 'number' && (
          <span className={`font-mono text-micro font-semibold ${trendTone}`}>
            {/* An arrow AND a sign: hue alone is not a reading. */}
            {flat ? '±' : rising ? '▲' : '▼'} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- bars */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Suppressed for disclosure control — NOT the same as zero. */
  suppressed?: boolean;
  /** Draws this row in the caution palette. */
  emphasis?: boolean;
}

/**
 * A horizontal bar chart.
 *
 * Horizontal because the labels are county names: rotated text on a vertical
 * chart is unreadable at a glance, and forty-seven of them is a wall.
 *
 * Rows stay in the order given. Sorting is the caller's decision because it
 * carries meaning — by burden for a ranking, alphabetically for a lookup.
 */
export function BarChart({
  data,
  max,
  unit,
  onSelect,
  selectedKey,
}: {
  data: BarDatum[];
  /** Fixed scale, when several charts must be compared to each other. */
  max?: number;
  unit?: string;
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing to show for this period.</p>;
  }
  const ceiling = Math.max(1, max ?? Math.max(...data.map((d) => d.value)));

  return (
    <ul className="space-y-0.5">
      {data.map((d) => {
        const pct = d.suppressed ? 0 : (d.value / ceiling) * 100;
        const selected = selectedKey === d.key;
        const Row = onSelect ? 'button' : 'div';
        return (
          <li key={d.key}>
            <Row
              {...(onSelect
                ? {
                    onClick: () => onSelect(d.key),
                    type: 'button' as const,
                    'aria-pressed': selected,
                  }
                : {})}
              className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left ${
                onSelect ? 'hover:bg-surface-alt' : ''
              } ${selected ? 'bg-surface-alt' : ''}`}
            >
              <span className="w-32 shrink-0 truncate text-sm">{d.label}</span>

              <span className="relative h-5 flex-1 overflow-hidden rounded-sm bg-rule-soft">
                {d.suppressed ? (
                  /* Hatched, not empty. A suppressed cell and a true zero
                     look identical as a bare track, and reporting "no cases"
                     from a county that merely had too few to publish is the
                     failure this prevents. */
                  <span
                    className="block h-full w-full opacity-60"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgb(var(--rule)) 0 2px, transparent 2px 6px)',
                    }}
                  />
                ) : (
                  <span
                    className={`block h-full rounded-sm ${
                      d.emphasis ? 'bg-caution' : 'bg-gov'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </span>

              <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">
                {d.suppressed ? (
                  <span className="text-ink-faint" title="Suppressed — fewer than 10 cases">
                    ‹10
                  </span>
                ) : (
                  <>
                    {fmt(d.value)}
                    {unit && <span className="text-ink-faint">{unit}</span>}
                  </>
                )}
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- funnel */

export interface FunnelStage {
  label: string;
  value: number;
  /** What this stage means, for the caption under it. */
  detail?: string;
}

/**
 * A funnel, drawn as one.
 *
 * The referral figures were three percentage columns in a table, which is
 * exactly the presentation the note beneath them warned against: "40%
 * closure" alone hides whether patients never arrived or arrived and were
 * never reported on. Those are different problems with different fixes, and
 * a funnel is the shape that shows which one you have.
 *
 * Drop-off between stages is labelled explicitly rather than left to be
 * inferred from bar lengths.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0 || stages[0].value === 0) {
    return <p className="text-sm text-ink-faint">No referrals issued in this period.</p>;
  }
  const top = stages[0].value;

  return (
    <ol className="space-y-2">
      {stages.map((s, i) => {
        const pct = (s.value / top) * 100;
        const lost = i > 0 ? stages[i - 1].value - s.value : 0;
        return (
          <li key={s.label}>
            {i > 0 && lost > 0 && (
              /* The gap is the finding. A stage that loses 60% of the
                 previous one is where the intervention goes. */
              <p className="mb-1 pl-1 font-mono text-micro text-critical">
                ↓ {fmt(lost)} lost here
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm">{s.label}</span>
              <span className="relative h-7 flex-1 overflow-hidden rounded bg-rule-soft">
                <span
                  className="block h-full rounded bg-gov"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right">
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {fmt(s.value)}
                </span>
                <span className="ml-1.5 font-mono text-micro text-ink-faint">
                  {Math.round(pct)}%
                </span>
              </span>
            </div>
            {s.detail && (
              <p className="mt-0.5 pl-[8.75rem] text-micro text-ink-faint">{s.detail}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------- trend line */

/**
 * A period trend.
 *
 * Deliberately plain: no gradient fill, no curve smoothing. A smoothed line
 * invents values between points that were never measured, which in a
 * national health statistic is a fabrication rather than a style choice.
 */
export function TrendLine({
  points,
  height = 56,
  label,
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
  label?: string;
}) {
  if (points.length < 2) {
    return (
      <p className="text-micro text-ink-faint">
        Not enough periods to show a trend.
      </p>
    );
  }

  const w = 100;
  const values = points.map((p) => p.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => height - 4 - ((v - lo) / span) * (height - 12);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="h-14 w-full"
        role="img"
        aria-label={
          label
            ? `${label}: ${points.map((p) => `${p.label} ${p.value}`).join(', ')}`
            : undefined
        }
      >
        <path
          d={path}
          fill="none"
          stroke="rgb(var(--gov))"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={2.5} fill="rgb(var(--gov))" />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-micro text-ink-faint">
        <span>{points[0].label}</span>
        <span>{last.label}</span>
      </figcaption>
    </figure>
  );
}

/* --------------------------------------------------------------- legend */

/**
 * What the marks on a chart mean.
 *
 * Required wherever suppression appears. An analyst who does not know a
 * hatched bar is a hidden cell will read it as nothing happening.
 */
export function ChartLegend({
  items,
}: {
  items: Array<{ swatch: 'gov' | 'caution' | 'critical' | 'hatch'; label: string }>;
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-micro text-ink-faint">
          <span
            className={`inline-block h-2.5 w-4 rounded-sm ${
              it.swatch === 'gov'
                ? 'bg-gov'
                : it.swatch === 'caution'
                  ? 'bg-caution'
                  : it.swatch === 'critical'
                    ? 'bg-critical'
                    : 'border border-rule'
            }`}
            style={
              it.swatch === 'hatch'
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgb(var(--rule)) 0 2px, transparent 2px 6px)',
                  }
                : undefined
            }
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
