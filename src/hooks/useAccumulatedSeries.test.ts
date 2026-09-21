import { renderHook } from '@testing-library/react';
import type { StationSeries } from '../api';
import { useAccumulatedSeries } from './useAccumulatedSeries';

const station = { id: 'a', name: 'A', lat: 0, lon: 0 };
const poll = (...ts: string[]): StationSeries[] => [
  { station, readings: ts.map((t) => ({ t: `2026-01-01T${t}:00Z`, pm25: 10 })) },
];

describe('useAccumulatedSeries', () => {
  it('passes data through untouched when not live', () => {
    const data = poll('10:00');
    const { result } = renderHook(() => useAccumulatedSeries(data, false, 'k'));
    expect(result.current.series).toBe(data);
    expect(result.current.appended).toBe(0);
  });

  it('keeps earlier in-progress points and counts appended ones while live', () => {
    const { result, rerender } = renderHook(({ d }) => useAccumulatedSeries(d, true, 'k'), {
      initialProps: { d: poll('10:00', '10:30') },
    });
    expect(result.current.appended).toBe(0);
    rerender({ d: poll('10:00', '10:31') }); // 10:30 dropped by the source, 10:31 new
    expect(result.current.series?.[0]?.readings.map((r) => r.t.slice(11, 16))).toEqual([
      '10:00',
      '10:30',
      '10:31',
    ]);
    expect(result.current.appended).toBe(1);
  });

  it('starts fresh when the selection changes', () => {
    const { result, rerender } = renderHook(({ d, k }) => useAccumulatedSeries(d, true, k), {
      initialProps: { d: poll('10:00', '10:30'), k: '7d' },
    });
    rerender({ d: poll('09:00'), k: '24h' });
    expect(result.current.series?.[0]?.readings).toHaveLength(1);
    expect(result.current.appended).toBe(0);
  });
});
