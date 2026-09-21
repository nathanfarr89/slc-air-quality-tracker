import { ApiError } from './errors';
import { createOpenMeteoProvider, toReadings } from './openMeteo';

const NOW = Date.parse('2026-01-20T12:30:00Z');

const block = (n: number) => ({
  time: Array.from({ length: n }, (_, i) =>
    new Date(NOW - (n - 1 - i) * 3_600_000).toISOString().slice(0, 16),
  ),
});

function fakeFetch(responder: (url: string) => unknown | Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const out = responder(url);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  }) as typeof fetch;
  return { impl, calls };
}

describe('toReadings', () => {
  it('joins temperature by time, drops nulls and future hours', () => {
    const air = {
      time: ['2026-01-20T10:00', '2026-01-20T11:00', '2026-01-20T23:00'],
      pm2_5: [12, null, 30],
    };
    const wx = { time: air.time, temperature_2m: [-2, -1, 0] };
    expect(toReadings(air, wx, NOW)).toEqual([{ t: '2026-01-20T10:00Z', pm25: 12, temp: -2 }]);
  });

  it('omits temp when weather is missing', () => {
    const air = { time: ['2026-01-20T10:00'], pm2_5: [8] };
    expect(toReadings(air, undefined, NOW)).toEqual([{ t: '2026-01-20T10:00Z', pm25: 8 }]);
  });
});

describe('open-meteo provider', () => {
  const respond = (url: string) => {
    const n = 3;
    const one = (i: number) =>
      url.includes('air-quality')
        ? { hourly: { ...block(n), pm2_5: [10 + i, 11 + i, 12 + i] } }
        : { hourly: { ...block(n), temperature_2m: [0, 1, 2] } };
    return [one(0), one(10)];
  };

  it('requests every station in one call and maps results in order', async () => {
    const { impl, calls } = fakeFetch(respond);
    const p = createOpenMeteoProvider(impl, () => NOW);
    const series = await p.getSeries('24h', ['slc-downtown', 'bountiful']);
    expect(series.map((s) => s.station.id)).toEqual(['slc-downtown', 'bountiful']);
    expect(series[1]!.readings[0]!.pm25).toBe(20);
    expect(series[0]!.readings[0]).toMatchObject({ pm25: 10, temp: 0 });
    expect(calls[0]).toContain('air-quality-api.open-meteo.com');
    expect(calls[0]).toContain('past_days=1');
  });

  it('still returns PM2.5 when the weather request fails', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('air-quality') ? respond(url) : new Response('nope', { status: 500 }),
    );
    const [s] = await createOpenMeteoProvider(impl, () => NOW).getSeries('24h', ['slc-downtown']);
    expect(s!.readings[0]).toEqual(expect.objectContaining({ pm25: 10 }));
    expect(s!.readings[0]!.temp).toBeUndefined();
  });

  it('throws ApiError when the air-quality request fails', async () => {
    const { impl } = fakeFetch(() => new Response('boom', { status: 503 }));
    await expect(createOpenMeteoProvider(impl, () => NOW).getSeries('7d')).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('uses the archive API with date bounds for history', async () => {
    const { impl, calls } = fakeFetch(respond);
    await createOpenMeteoProvider(impl, () => NOW).getHistory(365, ['slc-downtown', 'sandy']);
    expect(
      calls.some((c) => c.includes('archive-api') && c.includes('start_date=2025-01-20')),
    ).toBe(true);
  });
});
