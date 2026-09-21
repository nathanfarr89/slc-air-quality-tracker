import type { Reading, Station, StationSeries } from '../api';
import { mtDateKey } from './format';

export interface StationNow {
  station: Station;
  reading: Reading;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function latestReadings(series: StationSeries[]): StationNow[] {
  return series.flatMap((s) => {
    const reading = s.readings.at(-1);
    return reading ? [{ station: s.station, reading }] : [];
  });
}

export const valleyAverage = (now: StationNow[]): number | undefined =>
  now.length ? mean(now.map((n) => n.reading.pm25)) : undefined;

export const worstStation = (now: StationNow[]): StationNow | undefined =>
  now.reduce<StationNow | undefined>(
    (worst, n) => (!worst || n.reading.pm25 > worst.reading.pm25 ? n : worst),
    undefined,
  );

/** Valley-wide mean PM2.5 per timestamp (hourly), oldest first. */
export function valleyMeanSeries(series: StationSeries[]): { t: string; pm25: number }[] {
  const byTime = new Map<string, number[]>();
  for (const s of series)
    for (const r of s.readings) byTime.set(r.t, [...(byTime.get(r.t) ?? []), r.pm25]);
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, pm25: mean(v) }));
}

export interface DailyPoint {
  /** `YYYY-MM-DD`, Mountain time. */
  date: string;
  pm25: number;
  /** Mean temperature, °C. */
  temp?: number;
}

/** Valley-wide daily means (all stations, all hours in that Mountain-time day). */
export function dailyMeans(series: StationSeries[]): DailyPoint[] {
  const days = new Map<string, { pm: number[]; temp: number[] }>();
  for (const s of series) {
    for (const r of s.readings) {
      const key = mtDateKey(Date.parse(r.t));
      const day = days.get(key) ?? { pm: [], temp: [] };
      day.pm.push(r.pm25);
      if (r.temp !== undefined) day.temp.push(r.temp);
      days.set(key, day);
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) =>
      d.temp.length ? { date, pm25: mean(d.pm), temp: mean(d.temp) } : { date, pm25: mean(d.pm) },
    );
}

/** Group daily means by `YYYY-MM`. */
export function groupByMonth(daily: DailyPoint[]): Map<string, number[]> {
  const months = new Map<string, number[]>();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), d.pm25]);
  }
  return months;
}

const DAY = 86_400_000;
const utcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const mondayOf = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;

export interface CalendarGrid {
  /** Monday of each week column, `YYYY-MM-DD`. */
  weeks: string[];
  /** `z[weekday][week]`, weekday 0 = Monday. `null` where there is no data. */
  z: (number | null)[][];
  dates: string[][];
}

/** Lay daily values out GitHub-style: weeks across, weekdays down. */
export function calendarGrid(daily: DailyPoint[]): CalendarGrid {
  const first = daily[0];
  const last = daily.at(-1);
  if (!first || !last) return { weeks: [], z: [], dates: [] };
  const start = mondayOf(utcMs(first.date));
  const nWeeks = Math.round((mondayOf(utcMs(last.date)) - start) / (7 * DAY)) + 1;
  const z = Array.from({ length: 7 }, () => Array<number | null>(nWeeks).fill(null));
  const dates = Array.from({ length: 7 }, () => Array<string>(nWeeks).fill(''));
  for (const d of daily) {
    const ms = utcMs(d.date);
    const row = (new Date(ms).getUTCDay() + 6) % 7;
    const col = Math.round((mondayOf(ms) - start) / (7 * DAY));
    z[row]![col] = d.pm25;
    dates[row]![col] = d.date;
  }
  const weeks = Array.from({ length: nWeeks }, (_, i) =>
    new Date(start + i * 7 * DAY).toISOString().slice(0, 10),
  );
  return { weeks, z, dates };
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function boxStats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0]!,
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1]!,
  };
}
