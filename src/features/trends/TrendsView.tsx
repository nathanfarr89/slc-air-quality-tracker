import { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Fieldset,
  HStack,
  SegmentGroup,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react';
import { isStale, latestTimestamp, type SeriesRange } from '../../api';
import { ChartCard } from '../../components/ChartCard';
import { ChartTable } from '../../components/ChartTable';
import { DataState } from '../../components/DataState';
import { PmChart } from '../../components/PmChart';
import { useAccumulatedSeries } from '../../hooks/useAccumulatedSeries';
import { LIVE_POLL_MS, useStations, useTimeSeries } from '../../hooks/queries';
import { formatMtDateTime, formatMtTime } from '../../lib/format';

const RANGES: SeriesRange[] = ['24h', '7d', '30d'];
const RANGE_LABEL: Record<SeriesRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};

export default function TrendsView() {
  const [range, setRange] = useState<SeriesRange>('7d');
  const stations = useStations().data ?? [];
  // null = every available station (whatever the source provides) until the user picks a subset.
  const [selected, setSelected] = useState<string[] | null>(null);
  const ids = selected ?? stations.map((s) => s.id);
  const [live, setLive] = useState(false);

  const query = useTimeSeries(range, selected ?? undefined, live);
  const { series, appended } = useAccumulatedSeries(query.data, live, `${range}|${ids.join()}`);

  const toggle = (id: string, on: boolean) =>
    setSelected(stations.map((s) => s.id).filter((x) => (x === id ? on : ids.includes(x))));

  const chartSeries = useMemo(
    () => (series ?? []).map((s) => ({ name: s.station.name, readings: s.readings })),
    [series],
  );
  const latest = useMemo(
    () => Math.max(0, ...chartSeries.map((s) => latestTimestamp(s.readings) ?? 0)) || undefined,
    [chartSeries],
  );

  // Wide table: one row per timestamp, one column per station.
  const table = useMemo(() => {
    const times = [...new Set(chartSeries.flatMap((s) => s.readings.map((r) => r.t)))].sort();
    const lookup = chartSeries.map((s) => new Map(s.readings.map((r) => [r.t, r.pm25])));
    return times.map((t) => [
      formatMtDateTime(Date.parse(t)),
      ...lookup.map((m) => m.get(t) ?? '—'),
    ]);
  }, [chartSeries]);

  return (
    <Stack gap="4">
      <Stack
        direction={{ base: 'column', lg: 'row' }}
        gap="5"
        align={{ lg: 'flex-end' }}
        wrap="wrap"
      >
        <Box>
          <Text id="trend-range-label" fontSize="sm" fontWeight="medium" mb="1">
            Time range
          </Text>
          <SegmentGroup.Root
            ids={{ label: 'trend-range-label' }}
            value={range}
            onValueChange={(e) => e.value && setRange(e.value as SeriesRange)}
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={RANGES.map((r) => ({ value: r, label: r }))} />
          </SegmentGroup.Root>
        </Box>

        <Fieldset.Root w="auto">
          <Fieldset.Legend fontSize="sm" mb="1">
            Stations (at least one)
          </Fieldset.Legend>
          <HStack gap="4" wrap="wrap">
            {stations.map((s) => (
              <Checkbox.Root
                key={s.id}
                checked={ids.includes(s.id)}
                disabled={ids.length === 1 && ids.includes(s.id)}
                onCheckedChange={(e) => toggle(s.id, e.checked === true)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>{s.name}</Checkbox.Label>
              </Checkbox.Root>
            ))}
          </HStack>
        </Fieldset.Root>

        <Switch.Root checked={live} onCheckedChange={(e) => setLive(e.checked)}>
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label>Live</Switch.Label>
        </Switch.Root>
      </Stack>

      <Text fontSize="sm" color="fg.muted" aria-live="polite" minH="1.4em">
        {live
          ? `Live: polling every ${LIVE_POLL_MS / 1000}s. ${query.dataUpdatedAt ? `Last checked ${formatMtTime(query.dataUpdatedAt)}` : ''} · ${appended} new point${appended === 1 ? '' : 's'} since you turned it on.`
          : 'Times shown in Mountain Time.'}
      </Text>

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={chartSeries.every((s) => s.readings.length === 0)}
        latest={latest}
        isStale={isStale(latest)}
        onRetry={() => void query.refetch()}
        minH="380px"
      >
        <ChartCard
          title={`PM2.5, ${RANGE_LABEL[range]}`}
          description="Hourly PM2.5 per station. Dashed lines mark the start of each AQI category."
          label={`Line chart of PM2.5 for ${chartSeries.map((s) => s.name).join(', ')} over the ${RANGE_LABEL[range]}. A data table follows.`}
          table={
            <ChartTable
              caption={`PM2.5 by station, ${RANGE_LABEL[range]}`}
              columns={['Time (MT)', ...chartSeries.map((s) => `${s.name} (µg/m³)`)]}
              rows={table}
            />
          }
        >
          <Box>
            <PmChart series={chartSeries} height={380} toolbar />
          </Box>
        </ChartCard>
      </DataState>
    </Stack>
  );
}
