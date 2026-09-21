import { useMemo } from 'react';
import { Stack } from '@chakra-ui/react';
import { isStale, latestTimestamp } from '../../api';
import { DataState } from '../../components/DataState';
import { useHistory } from '../../hooks/queries';
import { dailyMeans } from '../../lib/derive';
import { CalendarHeatmap } from './CalendarHeatmap';
import { MonthBoxPlot } from './MonthBoxPlot';
import { TempScatter } from './TempScatter';

/** Lazy-loaded from App: this module (and Plotly) only downloads when the History tab opens. */
export default function HistoryView() {
  const query = useHistory(365);
  const daily = useMemo(() => dailyMeans(query.data ?? []), [query.data]);
  const latest = useMemo(
    () =>
      Math.max(0, ...(query.data ?? []).map((s) => latestTimestamp(s.readings) ?? 0)) || undefined,
    [query.data],
  );

  return (
    <DataState
      isLoading={query.isPending}
      error={query.error}
      isEmpty={daily.length === 0}
      latest={latest}
      isStale={isStale(latest)}
      onRetry={() => void query.refetch()}
      minH="600px"
    >
      <Stack gap="4">
        <CalendarHeatmap daily={daily} />
        <MonthBoxPlot daily={daily} />
        <TempScatter daily={daily} />
      </Stack>
    </DataState>
  );
}
