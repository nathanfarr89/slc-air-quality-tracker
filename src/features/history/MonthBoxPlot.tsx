import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { ChartCard } from '../../components/ChartCard';
import { ChartTable } from '../../components/ChartTable';
import { boxStats, groupByMonth, type DailyPoint } from '../../lib/derive';
import { round1 } from '../../lib/format';
import { useChartColors } from '../../theme/useChartColors';
import { baseLayout, Plot, plotConfig } from './plotly';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
/** EPA 24-hour PM2.5 standard (µg/m³). */
const STANDARD = 35;

export function MonthBoxPlot({ daily }: { daily: DailyPoint[] }) {
  const colors = useChartColors();
  const months = useMemo(
    () => [...groupByMonth(daily).entries()].sort(([a], [b]) => a.localeCompare(b)),
    [daily],
  );

  const { data, layout } = useMemo(() => {
    const trace: Data = {
      type: 'box',
      x: months.flatMap(([k, v]) => v.map(() => label(k))),
      y: months.flatMap(([, v]) => v),
      boxpoints: 'outliers',
      marker: { color: colors.series[0], size: 4 },
      line: { color: colors.series[0] },
      fillcolor: `${colors.series[0]}55`,
      hovertemplate: '%{x}<br>%{y:.1f} µg/m³<extra></extra>',
      name: 'Daily average PM2.5',
      showlegend: false,
    };
    const base = baseLayout(colors);
    const l: Partial<Layout> = {
      ...base,
      height: 340,
      xaxis: {
        ...base.xaxis,
        type: 'category',
        categoryarray: months.map(([k]) => label(k)),
        fixedrange: false,
      },
      yaxis: { ...base.yaxis, title: { text: 'Daily PM2.5 (µg/m³)' }, rangemode: 'tozero' },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          y0: STANDARD,
          y1: STANDARD,
          line: { color: colors.aqi.usg, dash: 'dash', width: 2 },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          x: 0,
          y: STANDARD,
          yanchor: 'bottom',
          xanchor: 'left',
          xshift: 8,
          showarrow: false,
          text: `EPA 24-hour standard, ${STANDARD} µg/m³`,
          font: { color: colors.text, size: 11 },
        },
      ],
    };
    return { data: [trace], layout: l };
  }, [months, colors]);

  return (
    <ChartCard
      title="PM2.5 by month"
      description="Distribution of daily valley averages per month. Winter boxes sit higher and stretch upward: those are the inversion days."
      label="Box plot of daily average PM2.5 for each of the past twelve months. A data table follows."
      table={
        <ChartTable
          caption="Monthly distribution of daily average PM2.5"
          columns={['Month', 'Days', 'Min', 'Q1', 'Median', 'Q3', 'Max']}
          rows={months.map(([k, v]) => {
            const s = boxStats(v);
            return [
              label(k),
              s.n,
              round1(s.min),
              round1(s.q1),
              round1(s.median),
              round1(s.q3),
              round1(s.max),
            ];
          })}
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
