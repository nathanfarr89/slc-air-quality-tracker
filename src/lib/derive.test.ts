import type { StationSeries } from '../api';
import {
  boxStats,
  calendarGrid,
  quantile,
  dailyMeans,
  groupByMonth,
  latestReadings,
  valleyAverage,
  valleyMeanSeries,
  worstStation,
} from './derive';

const st = (id: string) => ({ id, name: id, lat: 0, lon: 0 });
const series: StationSeries[] = [
  {
    station: st('a'),
    readings: [
      { t: '2026-01-10T18:00:00Z', pm25: 10, temp: -4 },
      { t: '2026-01-10T19:00:00Z', pm25: 20, temp: -2 },
    ],
  },
  {
    station: st('b'),
    readings: [
      { t: '2026-01-10T18:00:00Z', pm25: 30 },
      { t: '2026-01-10T19:00:00Z', pm25: 40 },
    ],
  },
];

describe('derive', () => {
  it('finds the latest reading, average and worst station', () => {
    const now = latestReadings(series);
    expect(valleyAverage(now)).toBe(30);
    expect(worstStation(now)?.station.id).toBe('b');
    expect(valleyAverage([])).toBeUndefined();
  });

  it('averages across stations per timestamp', () => {
    expect(valleyMeanSeries(series).map((p) => p.pm25)).toEqual([20, 30]);
  });

  it('builds daily means in Mountain time, with optional temp', () => {
    expect(dailyMeans(series)).toEqual([{ date: '2026-01-10', pm25: 25, temp: -3 }]);
  });

  it('puts late-evening Mountain readings on the local day, not the UTC day', () => {
    const s: StationSeries[] = [
      { station: st('a'), readings: [{ t: '2026-01-11T03:00:00Z', pm25: 5 }] },
    ];
    expect(dailyMeans(s)[0]?.date).toBe('2026-01-10');
  });

  it('groups by month', () => {
    const m = groupByMonth([
      { date: '2026-01-01', pm25: 1 },
      { date: '2026-01-02', pm25: 3 },
      { date: '2026-02-01', pm25: 9 },
    ]);
    expect(m.get('2026-01')).toEqual([1, 3]);
    expect(m.get('2026-02')).toEqual([9]);
  });
});

describe('calendarGrid', () => {
  it('lays days out Monday-first in week columns', () => {
    // 2026-01-04 is a Sunday, 2026-01-05 a Monday.
    const g = calendarGrid([
      { date: '2026-01-04', pm25: 4 },
      { date: '2026-01-05', pm25: 5 },
      { date: '2026-01-12', pm25: 12 },
    ]);
    expect(g.weeks).toEqual(['2025-12-29', '2026-01-05', '2026-01-12']);
    expect(g.z[6]![0]).toBe(4); // Sunday of week 1
    expect(g.z[0]![1]).toBe(5); // Monday of week 2
    expect(g.z[0]![2]).toBe(12);
    expect(g.z[3]![1]).toBeNull();
    expect(calendarGrid([]).weeks).toEqual([]);
  });
});

describe('boxStats', () => {
  it('computes quartiles', () => {
    expect(boxStats([1, 2, 3, 4, 5])).toEqual({ n: 5, min: 1, q1: 2, median: 3, q3: 4, max: 5 });
    expect(quantile([1, 2], 0.5)).toBe(1.5);
  });
});
