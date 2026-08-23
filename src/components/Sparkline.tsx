/**
 * A trend line for a lab or vital series.
 *
 * From the wireframes: a single HbA1c of 8.4% is a number; six readings
 * trending upward is a clinical finding. This costs almost nothing and
 * changes what the clinician concludes.
 *
 * Hand-drawn SVG rather than a chart library — the whole component is
 * smaller than the import would be, and the encounter screens have a real
 * payload budget for a mid-range Android on 3G.
 */

interface SparklineProps {
  /** Oldest first, so the line reads left to right. */
  points: Array<{ value: number }>;
  /** Reference range, drawn as a faint band. */
  refLow?: number | null;
  refHigh?: number | null;
  /** Colours the final point. */
  status?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | null;
  width?: number;
  height?: number;
  label?: string;
}

export function Sparkline({
  points,
  refLow,
  refHigh,
  status,
  width = 96,
  height = 28,
  label,
}: SparklineProps) {
  if (points.length < 2) {
    return (
      <span className="text-micro text-ink-faint" aria-label="Not enough readings to trend">
        —
      </span>
    );
  }

  const values = points.map((p) => p.value);
  // Include the reference band in the scale, so an in-range series does not
  // fill the whole box and read as dramatic movement.
  const candidates = [...values, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;

  const pad = 2;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');

  const endColour =
    status === 'HIGH' || status === 'LOW' || status === 'CRITICAL'
      ? 'rgb(var(--red))'
      : 'rgb(var(--green))';

  const bandTop = refHigh != null ? y(refHigh) : null;
  const bandBottom = refLow != null ? y(refLow) : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        label
          ? `${label}: ${values.length} readings, latest ${values[values.length - 1]}`
          : `${values.length} readings`
      }
      className="overflow-visible"
    >
      {bandTop != null && bandBottom != null && (
        <rect
          x={0}
          y={Math.min(bandTop, bandBottom)}
          width={width}
          height={Math.abs(bandBottom - bandTop)}
          fill="rgb(var(--green))"
          opacity={0.08}
        />
      )}

      <path
        d={path}
        fill="none"
        stroke="rgb(var(--gov))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The endpoint is what the clinician actually reads. */}
      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1])}
        r={2.5}
        fill={endColour}
      />
    </svg>
  );
}
