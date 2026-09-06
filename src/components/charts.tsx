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
  accentTone,
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
  /** A series colour for the accent, when the card carries no judgement. */
  accentTone?: SeriesTone;
}) {
  /*
   * A coloured rule down the left edge rather than a tinted border.
   *
   * Four identical navy-bordered cards in a row were indistinguishable at a
   * glance, so a reader had to read all four labels to find the one they
   * came for. The accent gives each card an identity while the surface
   * stays white — this is a statistics screen, not a set of alert boxes.
   */
  const accent =
    tone === 'critical'
      ? 'rgb(var(--red))'
      : tone === 'caution'
        ? 'rgb(var(--amber))'
        : tone === 'good'
          ? 'rgb(var(--green))'
          : accentTone
            ? toneVar(accentTone)
            : 'rgb(var(--gov))';

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
    <div
      className="rounded-lg border border-rule bg-surface px-4 py-3.5"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
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
  /** A series colour, when bars stand for different things. */
  tone?: SeriesTone;
}

/**
 * A colour for a chart series.
 *
 * `c1`..`c6` are categorical: they distinguish one thing from another and
 * carry no judgement. The semantic four stay available for the cases where
 * a bar really does mean good, bad or withheld.
 */
export type SeriesTone =
  | 'c1'
  | 'c2'
  | 'c3'
  | 'c4'
  | 'c5'
  | 'c6'
  | 'gov'
  | 'good'
  | 'caution'
  | 'critical'
  | 'faint';

export const SERIES: SeriesTone[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

/** The CSS variable behind a tone, for SVG fills. */
export function toneVar(t: SeriesTone = 'gov'): string {
  const map: Record<SeriesTone, string> = {
    c1: '--c1',
    c2: '--c2',
    c3: '--c3',
    c4: '--c4',
    c5: '--c5',
    c6: '--c6',
    gov: '--gov',
    good: '--green',
    caution: '--amber',
    critical: '--red',
    faint: '--rule',
  };
  return `rgb(var(${map[t]}))`;
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
                    className="block h-full rounded-sm"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: d.emphasis
                        ? 'rgb(var(--amber))'
                        : toneVar(d.tone ?? 'gov'),
                    }}
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

/* ------------------------------------------------------------ area chart */

/**
 * A filled trend, for a single series over a period.
 *
 * The fill is what separates this from TrendLine: it carries magnitude, so a
 * reader takes in "how much" as well as "which way" without reading the
 * axis. Still no curve smoothing — a smoothed line invents values between
 * points nobody measured, which in a national statistic is a fabrication.
 */
export function AreaChart({
  points,
  height = 120,
  unit,
  label,
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
  unit?: string;
  label?: string;
}) {
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-micro text-ink-faint">
        Not enough periods to show a trend.
      </p>
    );
  }

  const w = 300;
  const pad = 4;
  const values = points.map((p) => p.value);
  const hi = Math.max(...values, 1);
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - (v / hi) * (height - pad * 3);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${height - pad} L${x(0)},${height - pad} Z`;
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label ?? 'Trend'}: ${points
          .map((p) => `${p.label} ${p.value}`)
          .join(', ')}`}
      >
        <defs>
          <linearGradient id="nhp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--gov))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--gov))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Gridlines at quarter intervals. Faint: they orient the eye, they
            are not data. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={y(hi * f)}
            y2={y(hi * f)}
            stroke="rgb(var(--rule))"
            strokeWidth="0.5"
          />
        ))}

        <path d={area} fill="url(#nhp-area)" />
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--gov))"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={x(i)}
            cy={y(p.value)}
            r={p.value === peak.value ? 3.5 : 2}
            fill="rgb(var(--gov))"
          />
        ))}
      </svg>

      <figcaption className="mt-1 flex items-baseline justify-between font-mono text-micro text-ink-faint">
        <span>{points[0].label}</span>
        <span className="text-ink-soft">
          peak {peak.value.toLocaleString('en-GB')}
          {unit} · {peak.label}
        </span>
        <span>{points[points.length - 1].label}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ donut */

export interface Slice {
  label: string;
  value: number;
  tone?: SeriesTone;
}

/**
 * A donut, for a composition that genuinely sums to a whole.
 *
 * Restricted deliberately to few slices. A pie with nine wedges is a table
 * that has been made harder to read, and comparing similar angles is
 * something people are measurably bad at — so every slice is labelled with
 * its own figure and share beside the ring rather than inside it.
 */
export function Donut({
  slices,
  size = 132,
  centreLabel,
  centreValue,
}: {
  slices: Slice[];
  size?: number;
  centreLabel?: string;
  centreValue?: string | number;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  if (total === 0) {
    return <p className="text-sm text-ink-faint">Nothing recorded in this period.</p>;
  }

  const stroke = size * 0.16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const colour = (t?: SeriesTone) => toneVar(t ?? 'gov');

  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={slices
          .map((s) => `${s.label} ${s.value}, ${Math.round((s.value / total) * 100)}%`)
          .join('; ')}
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s) => {
            const len = (s.value / total) * circumference;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colour(s.tone)}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        {centreValue !== undefined && (
          <>
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              className="fill-ink font-mono text-xl font-semibold"
              style={{ fontSize: size * 0.2 }}
            >
              {centreValue}
            </text>
            {centreLabel && (
              <text
                x="50%"
                y="63%"
                textAnchor="middle"
                className="fill-ink-faint font-mono"
                style={{ fontSize: size * 0.085 }}
              >
                {centreLabel}
              </text>
            )}
          </>
        )}
      </svg>

      {/* Figures beside the ring, not inside it. Judging angles is something
          people are bad at, and this is read to be quoted. */}
      {/* The label wraps rather than truncating. "First-ever episo…" tells
          a reader nothing, and these are the words that say what the ring
          is dividing. */}
      <ul className="min-w-[10rem] flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: colour(s.tone) }}
                />
                <span>{s.label}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {s.value.toLocaleString('en-GB')}
                <span className="ml-1.5 text-micro text-ink-faint">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ mini gauge */

/**
 * A completeness bar, for a percentage with a target.
 *
 * The target tick is the point: 78% means nothing without knowing whether
 * the expectation was 60 or 95.
 */
export function Gauge({
  value,
  target,
  label,
  caption,
}: {
  value: number;
  target?: number;
  label: string;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const met = target === undefined || pct >= target;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            met ? 'text-ink' : 'text-caution'
          }`}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-rule-soft">
        <div
          className={`h-full rounded-full ${met ? 'bg-gov' : 'bg-caution'}`}
          style={{ width: `${pct}%` }}
        />
        {target !== undefined && (
          <span
            className="absolute top-0 h-full w-px bg-ink/50"
            style={{ left: `${target}%` }}
            title={`Target ${target}%`}
          />
        )}
      </div>
      {caption && <p className="mt-1 text-micro text-ink-faint">{caption}</p>}
    </div>
  );
}

/* --------------------------------------------------------- grouped bars */

export interface GroupedRow {
  key: string;
  label: string;
  values: number[];
}

/**
 * Bars grouped by category — several measures side by side per row.
 *
 * The alternative is a stacked bar, and stacks are worse here: only the
 * bottom segment starts from a common baseline, so every other segment has
 * to be compared by eye across different offsets. Grouped bars all start at
 * zero, which is the comparison a reader is actually making.
 */
export function GroupedBarChart({
  rows,
  series,
  unit,
}: {
  rows: GroupedRow[];
  series: Array<{ label: string; tone: SeriesTone }>;
  unit?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing to show for this period.</p>;
  }
  const ceiling = Math.max(1, ...rows.flatMap((r) => r.values));

  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm">{r.label}</span>
              <span className="shrink-0 font-mono text-micro text-ink-faint">
                {r.values.map((v) => fmt(v)).join(' · ')}
                {unit}
              </span>
            </div>
            <div className="space-y-1">
              {r.values.map((v, i) => (
                <div
                  key={series[i]?.label ?? i}
                  className="h-2.5 overflow-hidden rounded-sm bg-rule-soft"
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${(v / ceiling) * 100}%`,
                      backgroundColor: toneVar(series[i]?.tone),
                    }}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-micro text-ink-faint">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ backgroundColor: toneVar(s.tone) }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------- multi-line chart */

export interface LineSeries {
  label: string;
  tone: SeriesTone;
  points: number[];
}

/**
 * Several series over the same periods.
 *
 * Straight segments, no smoothing: a curve drawn between two monthly figures
 * implies values for the weeks between that nobody measured. In a national
 * health statistic that is a fabrication, not a styling choice.
 *
 * Each line ends with a dot and its own label, so a reader never has to
 * match a colour back to a legend to know which line is which.
 */
export function LineChart({
  periods,
  series,
  height = 160,
  unit,
}: {
  periods: string[];
  series: LineSeries[];
  height?: number;
  unit?: string;
}) {
  if (periods.length < 2 || series.length === 0) {
    return (
      <p className="py-8 text-center text-micro text-ink-faint">
        Not enough periods to show a trend.
      </p>
    );
  }

  const w = 320;
  const padL = 4;
  const padR = 4;
  const hi = Math.max(1, ...series.flatMap((s) => s.points));
  const x = (i: number) => padL + (i / (periods.length - 1)) * (w - padL - padR);
  const y = (v: number) => height - 18 - (v / hi) * (height - 30);

  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img"
        aria-label={series
          .map((s) => `${s.label}: ${s.points.join(', ')}`)
          .join('; ')}
      >
        {/* Quarter gridlines, faint. They orient the eye; they are not data. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y(hi * f)}
              y2={y(hi * f)}
              stroke="rgb(var(--rule))"
              strokeWidth="0.5"
            />
            <text
              x={padL}
              y={y(hi * f) - 2}
              className="fill-ink-faint font-mono"
              style={{ fontSize: 6 }}
            >
              {Math.round(hi * f)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const d = s.points
            .map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`)
            .join(' ');
          return (
            <g key={s.label}>
              <path
                d={d}
                fill="none"
                stroke={toneVar(s.tone)}
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {s.points.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={1.8} fill={toneVar(s.tone)} />
              ))}
            </g>
          );
        })}

        {/* Period labels along the foot. */}
        {periods.map((p, i) => (
          <text
            key={p}
            x={x(i)}
            y={height - 4}
            textAnchor={i === 0 ? 'start' : i === periods.length - 1 ? 'end' : 'middle'}
            className="fill-ink-faint font-mono"
            style={{ fontSize: 6.5 }}
          >
            {p}
          </text>
        ))}
      </svg>

      {/* Latest value per series, named. Reading a line chart should not
          require matching a hue back to a key. */}
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <li key={s.label} className="flex items-baseline gap-1.5 text-micro">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: toneVar(s.tone) }}
            />
            <span className="text-ink-soft">{s.label}</span>
            <span className="font-mono font-semibold tabular-nums">
              {fmt(s.points[s.points.length - 1])}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ----------------------------------------------------------- panel chrome */

/**
 * A titled panel.
 *
 * Title in bold dark sans, subtitle in grey underneath. The dashboard used
 * a mono uppercase eyebrow for every heading, which gave a card title, a
 * field label and a section marker exactly the same weight — so nothing on
 * the page looked more important than anything else, and a reader had no
 * entry point.
 */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  /** A control that belongs to this panel — a period switch, a filter. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-rule bg-surface p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A row of figures inside one panel.
 *
 * Four separate bordered cards for four related numbers made each look like
 * its own subject. These belong together — they describe one thing from
 * four angles — so they share a panel and read as a strip.
 */
export function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; tone?: SeriesTone }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label}>
          <dt className="mb-1 text-sm text-ink-faint">{m.label}</dt>
          <dd
            className="text-2xl font-semibold tabular-nums leading-none"
            style={m.tone ? { color: toneVar(m.tone) } : undefined}
          >
            {typeof m.value === 'number' ? fmt(m.value) : m.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A big figure with its label beneath it and a small trend beside it.
 *
 * The label goes UNDER the number. A dashboard is scanned for figures, and
 * putting a small grey caption above each one means the eye reads four
 * labels before it reaches the first value.
 */
export function BigStat({
  value,
  unit,
  label,
  trend,
  trendGood,
  chart,
}: {
  value: string | number;
  unit?: string;
  label: string;
  trend?: number | null;
  trendGood?: 'up' | 'down';
  /** A sparkline or mini chart, drawn beneath the figure. */
  chart?: React.ReactNode;
}) {
  const rising = typeof trend === 'number' && trend > 0;
  const flat = typeof trend === 'number' && Math.round(trend) === 0;
  const trendTone = !trendGood
    ? 'text-ink-faint'
    : flat
      ? 'text-ink-faint'
      : (rising && trendGood === 'up') || (!rising && trendGood === 'down')
        ? 'text-good'
        : 'text-critical';

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      <div className="px-5 pb-3 pt-4">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums leading-none text-ink">
            {typeof value === 'number' ? fmt(value) : value}
            {unit && <span className="text-2xl">{unit}</span>}
          </span>
          {typeof trend === 'number' && (
            <span className={`text-sm font-semibold ${trendTone}`}>
              {flat ? '±' : rising ? '↗' : '↘'} {Math.abs(Math.round(trend))}%
            </span>
          )}
        </p>
        <p className="mt-1.5 text-sm text-ink-faint">{label}</p>
      </div>
      {chart}
    </div>
  );
}

/**
 * A labelled progress row — a value, its share, and a bar.
 *
 * For a breakdown where the parts are read one at a time rather than
 * compared as a whole. A donut makes a reader judge angles; this does not.
 */
export function ProgressRow({
  label,
  value,
  total,
  tone = 'gov',
}: {
  label: string;
  value: number;
  total: number;
  tone?: SeriesTone;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-ink-soft">{label}</span>
        <span className="shrink-0 text-sm">
          <span className="font-semibold tabular-nums">{fmt(value)}</span>
          <span className="ml-1.5 text-ink-faint">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-rule-soft">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: toneVar(tone) }}
        />
      </div>
    </div>
  );
}

/** A period switch — Day / Week / Month, as a segmented control. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-rule">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-3 py-1.5 text-sm ${i > 0 ? 'border-l border-rule' : ''} ${
            value === o.value
              ? 'bg-surface-alt font-semibold text-ink'
              : 'text-ink-faint hover:bg-surface-alt'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
