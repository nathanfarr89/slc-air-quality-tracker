import { useQuery } from '@tanstack/react-query';
import { provider, type SeriesRange } from '../api';

const MINUTE = 60_000;
const floor = provider.minPollMs ?? 0;
export const LIVE_POLL_MS = Math.max(30_000, floor);
const BACKGROUND_POLL_MS = Math.max(5 * MINUTE, floor);

export function useStations() {
  return useQuery({
    queryKey: ['stations', provider.id],
    queryFn: () => provider.getStations(),
    staleTime: Infinity,
  });
}

/** Hourly series per station. `live` polls fast; otherwise a slow background refresh keeps the dashboard fresh. */
export function useTimeSeries(range: SeriesRange, stationIds?: string[], live = false) {
  return useQuery({
    queryKey: ['series', provider.id, range, stationIds ?? 'all'],
    queryFn: () => provider.getSeries(range, stationIds),
    staleTime: MINUTE,
    refetchInterval: live ? LIVE_POLL_MS : BACKGROUND_POLL_MS,
  });
}

export function useHistory(days = 365) {
  return useQuery({
    queryKey: ['history', provider.id, days],
    queryFn: () => provider.getHistory(days),
    staleTime: 60 * MINUTE,
  });
}

/** Individual sensors for the map layers. Disabled (never fetches) for sources without them, e.g. Open-Meteo. */
export const sensorsSupported = typeof provider.getSensors === 'function';

export function useSensors() {
  return useQuery({
    queryKey: ['sensors', provider.id],
    queryFn: () => provider.getSensors?.() ?? Promise.resolve([]),
    enabled: sensorsSupported,
    staleTime: 10 * MINUTE,
    refetchInterval: BACKGROUND_POLL_MS * 2,
  });
}
