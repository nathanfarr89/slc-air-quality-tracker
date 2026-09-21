import { createMockProvider } from './mock';
import { createProvider } from './index';
import { ProviderDisabledError } from './errors';
import { createPurpleAirProvider } from './purpleAir';
import { isStale, latestTimestamp, STALE_AFTER_MS } from './freshness';

const NOW = Date.parse('2026-01-20T18:30:00Z');
const provider = createMockProvider({ now: () => NOW, latencyMs: 0 });

describe('mock provider', () => {
  it('returns the five valley stations', async () => {
    const stations = await provider.getStations();
    expect(stations.map((s) => s.id)).toContain('slc-downtown');
    expect(stations).toHaveLength(5);
  });

  it('returns hourly readings, oldest first, for the requested range', async () => {
    const [first] = await provider.getSeries('24h', ['slc-downtown']);
    expect(first?.readings.length).toBeGreaterThanOrEqual(24);
    const times = first!.readings.map((r) => Date.parse(r.t));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[times.length - 1]).toBeLessThanOrEqual(NOW);
  });

  it('filters by station id', async () => {
    const series = await provider.getSeries('24h', ['sandy', 'lehi']);
    expect(series.map((s) => s.station.id)).toEqual(['sandy', 'lehi']);
  });

  it('is deterministic for the same clock', async () => {
    expect(await provider.getSeries('7d')).toEqual(await provider.getSeries('7d'));
  });

  it('shapes an inversion: PM2.5 builds over days, then clears', async () => {
    const [s] = await provider.getHistory(30, ['slc-downtown']);
    const pm = s!.readings.map((r) => r.pm25);
    expect(Math.max(...pm)).toBeGreaterThan(35); // reaches USG territory
    expect(Math.min(...pm)).toBeLessThan(15); // and clean air in between
    // peak is followed by a sharp drop (clearing within ~a day)
    const peakAt = pm.indexOf(Math.max(...pm));
    const dayAfter = pm[Math.min(peakAt + 30, pm.length - 1)]!;
    expect(dayAfter).toBeLessThan(Math.max(...pm) * 0.6);
  });

  it('includes temperature for the scatter view', async () => {
    const [s] = await provider.getHistory(365, ['slc-downtown']);
    expect(s!.readings.length).toBeGreaterThan(8000);
    expect(s!.readings.every((r) => typeof r.temp === 'number')).toBe(true);
  });
});

describe('provider selection', () => {
  it('uses the mock when useMock is true', () => {
    expect(createProvider({ useMock: true }).id).toBe('mock');
  });
  it('uses Open-Meteo otherwise', () => {
    expect(createProvider({ useMock: false }).id).toBe('open-meteo');
  });
});

describe('PurpleAir stub', () => {
  it('is disabled without a key and rejects', async () => {
    const pa = createPurpleAirProvider('');
    expect(pa.enabled).toBe(false);
    await expect(pa.getStations()).rejects.toBeInstanceOf(ProviderDisabledError);
  });
  it('reports enabled when a key exists', () => {
    expect(createPurpleAirProvider('abc').enabled).toBe(true);
  });
});

describe('freshness', () => {
  it('flags data older than the threshold as stale', () => {
    expect(isStale(NOW - STALE_AFTER_MS - 1, NOW)).toBe(true);
    expect(isStale(NOW - 60_000, NOW)).toBe(false);
    expect(isStale(undefined, NOW)).toBe(false);
  });
  it('finds the latest timestamp', () => {
    expect(latestTimestamp([{ t: '2026-01-01T00:00:00Z', pm25: 1 }])).toBe(
      Date.parse('2026-01-01T00:00:00Z'),
    );
    expect(latestTimestamp([])).toBeUndefined();
  });
});

describe('mock sensors', () => {
  it('returns the requested number of deterministic sensors inside the valley', async () => {
    const p = createMockProvider({ now: () => NOW, latencyMs: 0, sensorCount: 50 });
    const a = await p.getSensors!();
    expect(a).toHaveLength(50);
    expect(a).toEqual(await p.getSensors!());
    expect(new Set(a.map((s) => s.id)).size).toBe(50);
    expect(a.every((s) => s.lat > 40.3 && s.lat < 41 && s.lon < -111.7 && s.lon > -112.1)).toBe(
      true,
    );
    expect(a.every((s) => s.pm25 >= 0.5)).toBe(true);
  });
});
