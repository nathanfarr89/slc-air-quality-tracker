import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { AQI_CATEGORIES, getAqiCategory } from '../../api';
import { ChartCard } from '../../components/ChartCard';
import { ChartTable } from '../../components/ChartTable';
import type { DailyPoint } from '../../lib/derive';
import { celsiusToF, round1 } from '../../lib/format';
import { useChartColors } from '../../theme/useChartColors';
import { baseLayout, Plot, plotConfig } from './plotly';

/** Plotly marker symbols mirroring the AQI shape cue. */
const SYMBOL = {
  circle: 'circle',
  square: 'square',
  diamond: 'diamond',
  triangle: 'triangle-up',
  pentagon: 'pentagon',
  octagon: 'octagon',
} as const;
const COLD_F = 35;

export function TempScatter({ daily }: { daily: DailyPoint[] }) {
  const colors = useChartColors();
  const points = useMemo(
    () =>
      daily.flatMap((d) =>
        d.temp === undefined ? [] : [{ date: d.date, pm25: d.pm25, tempF: celsiusToF(d.temp) }],
      ),
    [daily],
  );

  const { data, layout } = useMemo(() => {
    const traces: Data[] = AQI_CATEGORIES.flatMap((c) => {
      const pts = points.filter((p) => getAqiCategory(p.pm25).key === c.key);
      if (!pts.length) return [];
      return [
        {
          type: 'scatter',
          mode: 'markers',
          // Shorter in the legend so entries don't collide; the hover still shows the full name.
          name: c.key === 'usg' ? 'Sensitive groups' : c.label,
          x: pts.map((p) => p.tempF),
          y: pts.map((p) => p.pm25),
          text: pts.map((p) => p.date),
          marker: {
            symbol: SYMBOL[c.shape],
            color: colors.aqi[c.key],
            size: 9,
            line: { color: colors.text, width: 1 },
          },
          hovertemplate: '%{text}<br>%{x:.0f} °F · %{y:.1f} µg/m³<extra>' + c.label + '</extra>',
        } satisfies Data,
      ];
    });
    const xs = points.map((p) => p.tempF);
    const ymax = Math.max(60, ...points.map((p) => p.pm25)) * 1.05;
    const base = baseLayout(colors);
    const l: Partial<Layout> = {
      ...base,
      height: 380,
      xaxis: { ...base.xaxis, title: { text: 'Daily mean temperature (°F)' } },
      yaxis: { ...base.yaxis, title: { text: 'Daily PM2.5 (µg/m³)' }, rangemode: 'tozero' },
      shapes: [
        {
          type: 'rect',
          xref: 'x',
          yref: 'y',
          x0: Math.min(...xs) - 2,
          x1: COLD_F,
          y0: 35.5,
          y1: ymax,
          fillcolor: colors.brand,
          opacity: 0.12,
          line: { width: 0 },
          layer: 'below',
        },
      ],
      annotations: [
        {
          xref: 'x',
          yref: 'y',
          x: Math.min(...xs),
          y: ymax,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          text: `Cold and polluted (≤ ${COLD_F} °F, ≥ 35.5 µg/m³)`,
          font: { color: colors.text, size: 11 },
        },
      ],
    };
    return { data: traces, layout: l };
  }, [points, colors]);

  return (
    <ChartCard
      title="PM2.5 vs. temperature"
      description="One point per day. Inversion days cluster in the shaded corner: cold, still air trapping pollution. Zoom by dragging."
      label="Scatter plot of daily average PM2.5 against daily mean temperature in degrees Fahrenheit, colored and shaped by AQI category. A data table follows."
      table={
        <ChartTable
          caption="Daily PM2.5 and temperature"
          columns={['Date', 'Temp (°F)', 'PM2.5 (µg/m³)', 'Category']}
          rows={points.map((p) => [
            p.date,
            Math.round(p.tempF),
            round1(p.pm25),
            getAqiCategory(p.pm25).label,
          ])}
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
