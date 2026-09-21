import { useMemo, type ReactNode } from 'react';
import { ApexChart as Chart } from '../../components/LazyChart';
import type { ApexOptions } from 'apexcharts';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import { getAqiCategory, pm25ToAqi, type StationSeries } from '../../api';
import { AqiBadge } from '../../components/AqiGlyph';
import { ChartTable } from '../../components/ChartTable';
import { baseApexOptions } from '../../components/apex';
import { latestReadings, valleyAverage, valleyMeanSeries, worstStation } from '../../lib/derive';
import { formatMtDateTime, mtWallMs, round1 } from '../../lib/format';
import { useColorMode } from '../../theme/colorMode';
import { useChartColors } from '../../theme/useChartColors';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      as="section"
      aria-label={title}
      bg="bg.panel"
      borderWidth="1px"
      rounded="lg"
      p="4"
      minW="0"
    >
      <Heading
        as="h2"
        size="xs"
        color="fg.muted"
        textTransform="uppercase"
        letterSpacing="wider"
        mb="2"
      >
        {title}
      </Heading>
      {children}
    </Box>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <Text fontSize="3xl" fontWeight="bold" lineHeight="1.1">
    {children}
  </Text>
);

function Sparkline({ points }: { points: { t: string; pm25: number }[] }) {
  const { mode } = useColorMode();
  const colors = useChartColors();
  const options = useMemo<ApexOptions>(() => {
    const base = baseApexOptions(colors, mode);
    return {
      ...base,
      chart: { ...base.chart, type: 'area', sparkline: { enabled: true } },
      stroke: { width: 2, curve: 'smooth' },
      colors: [colors.brand],
      fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
      xaxis: { type: 'datetime' },
      yaxis: { min: 0 },
      tooltip: {
        ...base.tooltip,
        x: { format: 'MMM d, h:mm TT' },
        y: { formatter: (v) => `${v.toFixed(1)} µg/m³` },
      },
    };
  }, [colors, mode]);
  const data = useMemo(
    () => [
      {
        name: 'Valley mean PM2.5',
        data: points.map((p) => ({ x: mtWallMs(Date.parse(p.t)), y: round1(p.pm25) })),
      },
    ],
    [points],
  );
  return <Chart type="area" height={64} series={data} options={options} />;
}

function AqiGauge({ pm25 }: { pm25: number }) {
  const { mode } = useColorMode();
  const colors = useChartColors();
  const aqi = pm25ToAqi(pm25);
  const category = getAqiCategory(pm25);
  const options = useMemo<ApexOptions>(() => {
    const base = baseApexOptions(colors, mode);
    return {
      ...base,
      chart: { ...base.chart, type: 'radialBar' },
      plotOptions: {
        radialBar: {
          startAngle: -120,
          endAngle: 120,
          hollow: { size: '60%' },
          track: { background: colors.grid },
          dataLabels: {
            name: { show: false },
            value: {
              show: true,
              offsetY: 10,
              color: colors.text,
              fontSize: '30px',
              fontWeight: 700,
              formatter: () => String(aqi),
            },
          },
        },
      },
      fill: { colors: [colors.aqi[category.key]] },
      stroke: { lineCap: 'round' },
      labels: [category.label],
    };
  }, [colors, mode, aqi, category]);
  return (
    <>
      <Chart
        type="radialBar"
        height={170}
        series={[Math.min(100, (aqi / 300) * 100)]}
        options={options}
      />
      {/* Outside the chart: long category names ("Unhealthy for Sensitive Groups") overflow the arc. */}
      <Text textAlign="center" fontWeight="medium">
        {category.label}
      </Text>
    </>
  );
}

export function KpiCards({ series }: { series: StationSeries[] }) {
  const now = useMemo(() => latestReadings(series), [series]);
  const avg = valleyAverage(now);
  const worst = worstStation(now);
  const trend = useMemo(() => valleyMeanSeries(series), [series]);
  if (avg === undefined || !worst) return null;

  const first = trend[0]?.pm25 ?? avg;
  const delta = avg - first;

  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
      <Card title="Valley average PM2.5">
        <Big>
          {round1(avg)}{' '}
          <Text as="span" fontSize="sm" fontWeight="normal" color="fg.muted">
            µg/m³
          </Text>
        </Big>
        <Box mt="2">
          <AqiBadge pm25={avg} />
        </Box>
      </Card>

      <Card title="Worst station right now">
        <Big>{round1(worst.reading.pm25)}</Big>
        <Text fontWeight="medium">{worst.station.name}</Text>
        <Box mt="1">
          <AqiBadge pm25={worst.reading.pm25} showAqi={false} />
        </Box>
        <Text fontSize="xs" color="fg.muted" mt="1">
          as of {formatMtDateTime(Date.parse(worst.reading.t))}
        </Text>
      </Card>

      <Card title="24-hour valley trend">
        <Box
          role="img"
          aria-label={`Valley average PM2.5 over the last 24 hours, from ${round1(first)} to ${round1(avg)} micrograms per cubic meter.`}
        >
          <Sparkline points={trend} />
        </Box>
        <Text fontSize="sm" color="fg.muted">
          {delta === 0
            ? 'Unchanged'
            : `${delta > 0 ? '▲ Up' : '▼ Down'} ${round1(Math.abs(delta))} µg/m³`}{' '}
          vs. 24 h ago
        </Text>
        <ChartTable
          caption="Valley average PM2.5, last 24 hours"
          columns={['Time (MT)', 'PM2.5 (µg/m³)']}
          rows={trend.map((p) => [formatMtDateTime(Date.parse(p.t)), round1(p.pm25)])}
        />
      </Card>

      <Card title="Current AQI (valley)">
        <Box
          role="img"
          aria-label={`Air Quality Index ${pm25ToAqi(avg)}, ${getAqiCategory(avg).label}.`}
        >
          <AqiGauge pm25={avg} />
        </Box>
      </Card>
    </SimpleGrid>
  );
}
