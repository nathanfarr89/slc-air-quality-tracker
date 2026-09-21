import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid, Heading, Text, VStack } from '@chakra-ui/react';
import { isStale, latestTimestamp } from '../../api';
import { DataState } from '../../components/DataState';
import { latestReadings } from '../../lib/derive';
import { useSensors, useTimeSeries } from '../../hooks/queries';
import { KpiCards } from './KpiCards';
import { preloadMap } from './mapChunk';
import { MapSection } from './MapSection';
import { StationDrawer } from './StationDrawer';
import { StationTable } from './StationTable';

export default function OverviewView() {
  const query = useTimeSeries('24h');
  const sensors = useSensors();
  useEffect(preloadMap, []);
  const [selectedId, setSelectedId] = useState<string>();
  const trigger = useRef<HTMLElement | null>(null);
  const select = (id: string, el: HTMLElement) => {
    trigger.current = el;
    setSelectedId(id);
  };

  const series = useMemo(() => query.data ?? [], [query.data]);
  const now = useMemo(() => latestReadings(series), [series]);
  const latest = useMemo(
    () => Math.max(0, ...series.map((s) => latestTimestamp(s.readings) ?? 0)) || undefined,
    [series],
  );

  return (
    <VStack align="stretch" gap="4">
      {/* Static, so the page has real content from first paint instead of only a skeleton while data loads. */}
      <Text maxW="3xl" color="fg.muted">
        Fine-particle pollution (PM2.5) across the Salt Lake Valley, from current readings to the
        past year. In winter, temperature inversions trap cold air and pollution in the valley for
        days: watch the orange and red areas build, then clear when a storm mixes the air out.
      </Text>
      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={now.length === 0}
        latest={latest}
        isStale={isStale(latest)}
        onRetry={() => void query.refetch()}
        minH="480px"
      >
        <VStack align="stretch" gap="4">
          <Grid
            templateColumns={{ base: 'minmax(0,1fr)', xl: 'minmax(0,3fr) minmax(0,2fr)' }}
            gap="4"
            alignItems="start"
          >
            <MapSection
              stations={now}
              sensors={sensors.data}
              sensorsFailed={sensors.isError}
              selectedId={selectedId}
              onSelect={select}
            />
            <KpiCards series={series} />
          </Grid>
          <Heading as="h2" size="md">
            Stations
          </Heading>
          <StationTable stations={now} onSelect={select} />
        </VStack>
        <StationDrawer
          series={series.find((s) => s.station.id === selectedId)}
          onClose={() => setSelectedId(undefined)}
          returnFocusTo={() => trigger.current}
        />
      </DataState>
    </VStack>
  );
}
