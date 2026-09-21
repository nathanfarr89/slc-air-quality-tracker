import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { AQI_CATEGORIES, getAqiCategory } from '../../api';
import { ChartCard } from '../../components/ChartCard';
import { ChartTable } from '../../components/ChartTable';
import { calendarGrid, type DailyPoint } from '../../lib/derive';
import { round1 } from '../../lib/format';
import { useChartColors } from '../../theme/useChartColors';
import { baseLayout, Plot, plotConfig } from './plotly';

/** Bands shown on the heatmap; anything above the last one takes its color. */
const BANDS = AQI_CATEGORIES.slice(0, 4);
const ZMAX = BANDS[3]!.pmMax + 0.1;

export function CalendarHeatmap({ daily }: { daily: DailyPoint[] }) {
  const colors = useChartColors();

  const { data, layout } = useMemo(() => {
    const grid = calendarGrid(daily);
    const stops = BANDS.flatMap((c, i) => {
      const from = i === 0 ? 0 : c.pmMin / ZMAX;
      const to = i === BANDS.length - 1 ? 1 : BANDS[i + 1]!.pmMin / ZMAX;
      return [
        [from, colors.aqi[c.key]],
        [to, colors.aqi[c.key]],
      ] as [number, string][];
    });
    const text = grid.z.map((row, r) =>
      row.map((v, c) =>
        v === null
          ? ''
          : `${grid.dates[r]![c]}: ${v.toFixed(1)} µg/m³ · ${getAqiCategory(v).label}`,
      ),
    );
    const trace: Data = {
      type: 'heatmap',
      x: grid.weeks,
      y: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      z: grid.z,
      text: text as unknown as string[],
      hovertemplate: '%{text}<extra></extra>',
      hoverongaps: false,
      xgap: 2,
      ygap: 2,
      zmin: 0,
      zmax: ZMAX,
      colorscale: stops,
      colorbar: {
        thickness: 14,
        len: 0.95,
        tickvals: BANDS.map(
          (c, i) => (c.pmMin + (i === BANDS.length - 1 ? ZMAX : BANDS[i + 1]!.pmMin)) / 2,
        ),
        ticktext: BANDS.map((c) => c.label.replace('Unhealthy for Sensitive Groups', 'Sensitive')),
        tickfont: { color: colors.text },
        outlinewidth: 0,
      },
    };
    const base = baseLayout(colors);
    const l: Partial<Layout> = {
      ...base,
      height: 280,
      xaxis: { ...base.xaxis, type: 'date', tickformat: '%b', dtick: 'M1', showgrid: false },
      yaxis: { ...base.yaxis, autorange: 'reversed', showgrid: false, fixedrange: true },
    };
    return { data: [trace], layout: l };
  }, [daily, colors]);

  return (
    <ChartCard
      title="Daily average PM2.5, past year"
      description="Each square is one day (valley-wide average). Columns are weeks. Winter inversions show as runs of orange and red."
      label="Calendar heatmap of daily average PM2.5 for the past year. A data table follows."
      table={
        <ChartTable
          caption="Daily average PM2.5"
          columns={['Date', 'PM2.5 (µg/m³)', 'Category']}
          rows={daily.map((d) => [d.date, round1(d.pm25), getAqiCategory(d.pm25).label])}
        />
      }
    >
      <Plot
        data={data}
        layout={layout}
        config={plotConfig}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </ChartCard>
  );
}
