import type { Reading } from './types';

/** Open-Meteo updates hourly; anything older than this is shown as stale. */
export const STALE_AFTER_MS = 3 * 3_600_000;

export function latestTimestamp(readings: Reading[]): number | undefined {
  const last = readings[readings.length - 1];
  return last ? Date.parse(last.t) : undefined;
}

export function isStale(latest: number | undefined, now = Date.now()): boolean {
  return latest !== undefined && now - latest > STALE_AFTER_MS;
}
