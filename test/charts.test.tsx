/**
 * THE MINISTRY CHARTS.
 *
 * These render national health statistics that get quoted in briefings, so
 * three properties matter more than how they look:
 *
 *   1. A suppressed cell never reads as zero. Reporting "no cases" from a
 *      county that merely had too few to publish is the failure disclosure
 *      control exists to prevent, and a bare empty bar does exactly that.
 *
 *   2. The number is always present. A bar is an aid to comparison, never
 *      the only way to read a value — somebody quoting this needs the
 *      figure, and a screen reader needs it at all.
 *
 *   3. The funnel shows WHERE the loss happens. "40% closure" alone hides
 *      whether patients never arrived or arrived and were never reported
 *      on, which are different problems with different fixes.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StatCard,
  BarChart,
  Funnel,
  Donut,
  Gauge,
  AreaChart,
  GroupedBarChart,
  LineChart,
} from '@/components/charts';

describe('the stat card', () => {
  it('shows the figure, and groups digits so it can be read aloud', () => {
    render(<StatCard label="Confirmed cases" value={12345} caption="Malaria" />);
    expect(screen.getByText('12,345')).toBeInTheDocument();
  });

  it('marks a direction as well as a colour', () => {
    // Hue alone is not a reading: a colour-blind analyst, a greyscale
    // print-out and a bad clinic monitor all lose it.
    render(<StatCard label="Cases" value={40} trend={12} trendGood="down" />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
    expect(screen.getByText(/12%/)).toBeInTheDocument();
  });
});

describe('the bar chart', () => {
  const DATA = [
    { key: 'a', label: 'Kisumu', value: 34 },
    { key: 'b', label: 'Nairobi', value: 0, suppressed: true },
  ];

  it('prints every value beside its bar', () => {
    render(<BarChart data={DATA} />);
    expect(screen.getByText('34')).toBeInTheDocument();
  });

  it('DOES NOT RENDER A SUPPRESSED CELL AS ZERO', () => {
    render(<BarChart data={DATA} />);
    // The sharpest requirement here. A suppressed county must be visibly
    // withheld, not indistinguishable from one that had no cases.
    expect(screen.getByText('‹10')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('says so when there is nothing to show', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText(/nothing to show/i)).toBeInTheDocument();
  });
});

describe('the referral funnel', () => {
  const STAGES = [
    { label: 'Issued', value: 100 },
    { label: 'Arrived', value: 40 },
    { label: 'Closed', value: 30 },
  ];

  it('names where the loss happens, at each stage', () => {
    render(<Funnel stages={STAGES} />);
    // 60 lost between issued and arrived, 10 between arrived and closed.
    // Those are different problems, and the whole point of a funnel is
    // that a reader can tell which one they have.
    expect(screen.getByText(/60 lost here/)).toBeInTheDocument();
    expect(screen.getByText(/10 lost here/)).toBeInTheDocument();
  });

  it('shows each stage as a share of the first', () => {
    render(<Funnel stages={STAGES} />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('does not divide by zero when nothing was issued', () => {
    render(<Funnel stages={[{ label: 'Issued', value: 0 }]} />);
    expect(screen.getByText(/no referrals issued/i)).toBeInTheDocument();
  });
});

describe('the donut', () => {
  it('labels every slice with its own figure and share', () => {
    // Comparing angles is something people are measurably bad at, and these
    // numbers get quoted — so the figure sits beside the ring, not in it.
    render(
      <Donut
        slices={[
          { label: 'First-ever episode', value: 75 },
          { label: 'Seen before', value: 25, tone: 'faint' },
        ]}
      />,
    );
    expect(screen.getByText('First-ever episode')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('does not divide by zero on an empty period', () => {
    render(<Donut slices={[{ label: 'Nothing', value: 0 }]} />);
    expect(screen.getByText(/nothing recorded/i)).toBeInTheDocument();
  });
});

describe('the gauge', () => {
  it('shows the percentage and warns when it is under target', () => {
    // 78% means nothing without knowing the expectation was 80.
    const { container } = render(
      <Gauge label="Kisumu" value={78} target={80} caption="3 of 4 facilities" />,
    );
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(container.querySelector('.bg-caution')).toBeTruthy();
  });

  it('does not warn when the target is met', () => {
    const { container } = render(<Gauge label="Siaya" value={92} target={80} />);
    expect(container.querySelector('.bg-caution')).toBeNull();
  });
});

describe('the area chart', () => {
  const SERIES = [
    { label: 'Jul', value: 40 },
    { label: 'Aug', value: 90 },
    { label: 'Sep', value: 60 },
  ];

  it('names the peak, so the shape does not have to be measured', () => {
    render(<AreaChart points={SERIES} label="Cases" />);
    expect(screen.getByText(/peak 90/)).toBeInTheDocument();
  });

  it('says so rather than drawing a line through one point', () => {
    render(<AreaChart points={[{ label: 'Sep', value: 3 }]} />);
    expect(screen.getByText(/not enough periods/i)).toBeInTheDocument();
  });
});

describe('grouped bars', () => {
  const ROWS = [
    { key: 'a', label: 'Kisumu', values: [100, 40, 30] },
    { key: 'b', label: 'Siaya', values: [50, 45, 44] },
  ];
  const SERIES_DEF = [
    { label: 'Issued', tone: 'c1' as const },
    { label: 'Arrived', tone: 'c2' as const },
    { label: 'Closed', tone: 'c4' as const },
  ];

  it('prints every figure in the group, not just the largest', () => {
    render(<GroupedBarChart rows={ROWS} series={SERIES_DEF} />);
    // All three measures per row, so the comparison does not depend on
    // judging bar lengths against each other.
    expect(screen.getByText('100 · 40 · 30')).toBeInTheDocument();
    expect(screen.getByText('50 · 45 · 44')).toBeInTheDocument();
  });

  it('names each series', () => {
    render(<GroupedBarChart rows={ROWS} series={SERIES_DEF} />);
    expect(screen.getByText('Issued')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});

describe('the line chart', () => {
  const PERIODS = ['Jul', 'Aug', 'Sep'];
  const LINES = [
    { label: 'Malaria', tone: 'c1' as const, points: [40, 90, 60] },
    { label: 'Cholera', tone: 'c3' as const, points: [5, 8, 30] },
  ];

  it('labels each line with its latest value', () => {
    render(<LineChart periods={PERIODS} series={LINES} />);
    // A reader should never have to match a hue back to a legend to know
    // which line is which.
    expect(screen.getByText('Malaria')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('Cholera')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('refuses to draw a trend through a single period', () => {
    render(<LineChart periods={['Sep']} series={LINES} />);
    expect(screen.getByText(/not enough periods/i)).toBeInTheDocument();
  });
});
