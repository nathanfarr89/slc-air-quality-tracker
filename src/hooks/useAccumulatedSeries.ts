import { useState } from 'react';
import type { Reading, StationSeries } from '../api';

interface State {
  src?: StationSeries[];
  enabled: boolean;
  key: string;
  series?: StationSeries[];
  baseline: number;
}

/** Points per line: every station shares a timeline, so the first series is representative. */
const count = (s?: StationSeries[]) => s?.[0]?.readings.length ?? 0;

function merge(
  prev: State,
  src: StationSeries[] | undefined,
  enabled: boolean,
  key: string,
): State {
  if (!src || !enabled) return { src, enabled, key, series: src, baseline: 0 };
  // Only accumulate within one selection; a new range/station set starts fresh.
  const known = prev.enabled && prev.key === key ? prev.series : undefined;
  const series = src.map((s) => {
    const seen = new Map<string, Reading>(
      known?.find((k) => k.station.id === s.station.id)?.readings.map((r) => [r.t, r]),
    );
    for (const r of s.readings) seen.set(r.t, r);
    return { ...s, readings: [...seen.values()].sort((a, b) => a.t.localeCompare(b.t)) };
  });
  return { src, enabled, key, series, baseline: known ? prev.baseline : count(series) };
}

/**
 * Each poll replaces the query data, which can drop an earlier in-progress point.
 * While `enabled`, remember every point seen so new ones append to the chart instead of
 * replacing it. `key` identifies the selection (range + stations). Returns the merged
 * series and how many points were appended since live mode started.
 */
export function useAccumulatedSeries(
  data: StationSeries[] | undefined,
  enabled: boolean,
  key: string,
) {
  const [state, setState] = useState<State>(() =>
    merge({ enabled: false, key, baseline: 0 }, data, enabled, key),
  );
  // Derive-during-render: recompute only when the inputs actually changed.
  if (state.src !== data || state.enabled !== enabled || state.key !== key) {
    setState(merge(state, data, enabled, key));
  }
  return { series: state.series, appended: enabled ? count(state.series) - state.baseline : 0 };
}
