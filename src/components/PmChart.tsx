import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { AQI_CATEGORIES, type Reading } from '../api';
import { mtWallMs } from '../lib/format';
import { useColorMode } from '../theme/colorMode';
import { useChartColors } from '../theme/useChartColors';
import { baseApexOptions } from './apex';

export interface PmSeries {
  name: string;
  readings: Reading[];
}

interface Props {
  series: PmSeries[];
  height?: number | string;
  toolbar?: boolean;
  showLegend?: boolean;
}

/** PM2.5 line chart with AQI threshold guides. Used by the station drawer and the Trends view. */
export function PmChart({ series, height = 320, toolbar = false, showLegend = true }: Props) {
  const { mode } = useColorMode();
  const colors = useChartColors();

  const data = useMemo(
    () =>
      series.map((s) => ({
        name: s.name,
        data: s.readings.map((r) => ({ x: mtWallMs(Date.parse(r.t)), y: r.pm25 })),
      })),
    [series],
  );
  const max = Math.max(0, ...series.flatMap((s) => s.readings.map((r) => r.pm25)));

  const options = useMemo<ApexOptions>(() => {
    const base = baseApexOptions(colors, mode);
    return {
      ...base,
      chart: {
        ...base.chart,
        type: 'line',
        toolbar: { show: toolbar },
        zoom: { enabled: toolbar },
      },
      colors: colors.series,
      stroke: { width: 2, curve: 'smooth' },
      xaxis: {
        type: 'datetime',
        labels: { datetimeUTC: true },
        axisBorder: { color: colors.grid },
        axisTicks: { color: colors.grid },
        tooltip: { enabled: false },
      },
      yaxis: {
        min: 0,
        title: { text: 'PM2.5 (µg/m³)', style: { color: colors.muted, fontWeight: 400 } },
        labels: { formatter: (v) => v.toFixed(0) },
      },
      tooltip: {
        ...base.tooltip,
        x: { format: 'MMM d, h:mm TT' },
        y: { formatter: (v) => `${v.toFixed(1)} µg/m³` },
      },
      legend: {
        show: showLegend,
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: colors.text },
      },
      annotations: {
        yaxis: AQI_CATEGORIES.filter((c) => c.pmMin > 0 && c.pmMin < max * 1.05).map((c) => ({
          y: c.pmMin,
          borderColor: colors.aqi[c.key],
          strokeDashArray: 4,
          label: {
            text: `${c.label} ≥ ${c.pmMin}`,
            position: 'left',
            textAnchor: 'start',
            style: {
              color: colors.aqiText[c.key],
              background: colors.aqi[c.key],
              fontSize: '10px',
            },
          },
        })),
      },
    };
  }, [colors, mode, toolbar, showLegend, max]);

  return <Chart type="line" height={height} series={data} options={options} />;
}
