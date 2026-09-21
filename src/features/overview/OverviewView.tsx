import { useMemo, useRef, useState } from 'react';
import { Grid, Heading, VStack } from '@chakra-ui/react';
import { isStale, latestTimestamp } from '../../api';
import { DataState } from '../../components/DataState';
import { latestReadings } from '../../lib/derive';
import { useSensors, useTimeSeries } from '../../hooks/queries';
import { KpiCards } from './KpiCards';
import { MapSection } from './MapSection';
import { StationDrawer } from './StationDrawer';
import { StationTable } from './StationTable';

export default function OverviewView() {
  const query = useTimeSeries('24h');
  const sensors = useSensors();
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
  );
}
