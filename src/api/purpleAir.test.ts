import { ApiError, ProviderDisabledError } from './errors';
import { createProvider } from './index';
import {
  channelsAgree,
  chunkRanges,
  combineSensors,
  createPurpleAirProvider,
  epaCorrectedPm25,
  sensorFToAmbientC,
} from './purpleAir';

const NOW = Date.parse('2026-01-20T18:00:00Z');
const DAY = 86_400_000;

describe('EPA correction and QC', () => {
  it('applies the linear branch below 343 µg/m³', () => {
    // 0.52*20 - 0.086*40 + 5.75 = 12.71
    expect(epaCorrectedPm25(20, 40)).toBeCloseTo(12.71, 2);
  });
  it('applies the quadratic branch in heavy smoke', () => {
    expect(epaCorrectedPm25(400, 30)).toBeCloseTo(0.46 * 400 + 3.93e-4 * 400 * 400 + 2.97, 5);
  });
  it('never returns a negative concentration', () => {
    expect(epaCorrectedPm25(0, 100)).toBe(0);
  });
  it('accepts channels within 5 µg/m³ or 70%, rejects wide disagreement', () => {
    expect(channelsAgree(2, 6)).toBe(true); // 4 apart
    expect(channelsAgree(100, 130)).toBe(true); // 26% apart
    expect(channelsAgree(10, 80)).toBe(false);
  });
  it('removes the housing temperature bias and converts to °C', () => {
    expect(sensorFToAmbientC(40)).toBeCloseTo(0, 5); // 40 °F sensor → 32 °F ambient
  });
});

describe('helpers', () => {
  it('chunks a range without exceeding the span', () => {
    expect(chunkRanges(0, 25, 10)).toEqual([
      [0, 10],
      [10, 20],
      [20, 25],
    ]);
  });
  it('combines sensors by median PM2.5 and mean temperature', () => {
    const t = '2026-01-20T10:00:00.000Z';
    expect(
      combineSensors([
        [{ t, pm25: 10, temp: 0 }],
        [{ t, pm25: 20, temp: 2 }],
        [{ t: '2026-01-20T11:00:00.000Z', pm25: 5 }],
      ]),
    ).toEqual([
      { t, pm25: 15, temp: 1 },
      { t: '2026-01-20T11:00:00.000Z', pm25: 5 },
    ]);
  });
});

// Downtown SLC: sensors 1 (close) and 2 (a bit farther); sensor 3 has disagreeing channels; sensor 4 is far away (Provo).
const SENSOR_TABLE = {
  fields: ['sensor_index', 'latitude', 'longitude', 'humidity', 'pm2.5_cf_1_a', 'pm2.5_cf_1_b'],
  data: [
    [1, 40.761, -111.891, 30, 10, 11],
    [2, 40.79, -111.9, 30, 10, 12],
    [3, 40.762, -111.89, 30, 5, 90],
    [4, 40.23, -111.66, 30, 10, 10],
  ],
};

function historyTable(times: number[], pmA: number, pmB: number) {
  return {
    fields: ['time_stamp', 'pm2.5_cf_1_a', 'pm2.5_cf_1_b', 'humidity', 'temperature'],
    data: times.map((t) => [Math.floor(t / 1000), pmA, pmB, 40, 48]),
  };
}

function setup(historyRows: (url: URL) => unknown = () => historyTable([NOW - 3_600_000], 20, 20)) {
  const calls: { url: URL; key: string | null }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, key: new Headers(init?.headers).get('X-API-Key') });
    const body = url.pathname === '/v1/sensors' ? SENSOR_TABLE : historyRows(url);
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  return { provider: createPurpleAirProvider('key', impl, () => NOW), calls };
}

describe('purpleair provider', () => {
  it('is disabled without a key and rejects', async () => {
    const pa = createPurpleAirProvider('');
    expect(pa.enabled).toBe(false);
    await expect(pa.getSeries('24h')).rejects.toBeInstanceOf(ProviderDisabledError);
  });

  it('is selected only when a key is set (and mock is off)', () => {
    expect(createProvider({ useMock: false, purpleAirKey: 'k' }).id).toBe('purpleair');
    expect(createProvider({ useMock: true, purpleAirKey: 'k' }).id).toBe('mock');
    expect(createProvider({ useMock: false }).id).toBe('open-meteo');
  });

  it('discovers only areas that have healthy nearby sensors, sending the key header', async () => {
    const { provider, calls } = setup();
    const stations = await provider.getStations();
    expect(stations.map((s) => s.id)).toEqual(['slc-downtown']);
    expect(calls[0]?.key).toBe('key');
    expect(calls[0]?.url.searchParams.get('location_type')).toBe('0');
  });

  it('discovers once per session', async () => {
    const { provider, calls } = setup();
    await provider.getStations();
    await provider.getSeries('24h');
    expect(calls.filter((c) => c.url.pathname === '/v1/sensors')).toHaveLength(1);
  });

  it('returns EPA-corrected readings combined across the area sensors', async () => {
    const { provider } = setup();
    const [s] = await provider.getSeries('24h');
    expect(s?.station.id).toBe('slc-downtown');
    // 0.52*20 - 0.086*40 + 5.75 = 12.71 → 12.7 (both sensors identical → same median)
    expect(s?.readings).toHaveLength(1);
    expect(s?.readings[0]?.pm25).toBeCloseTo(12.7, 1);
    // 48 °F sensor → 8 °F bias removed → 40 °F → 4.44 °C
    expect(s?.readings[0]?.temp).toBeCloseTo(4.44, 1);
  });

  it('drops history rows whose channels disagree', async () => {
    const { provider } = setup(() => historyTable([NOW - 3_600_000], 5, 90));
    const [s] = await provider.getSeries('24h');
    expect(s?.readings).toEqual([]);
  });

  it('splits 30-day hourly history into chunks under the API limit', async () => {
    const { provider, calls } = setup();
    await provider.getSeries('30d');
    const history = calls.filter((c) => c.url.pathname.endsWith('/history'));
    expect(history).toHaveLength(2 * 3); // 2 sensors × 3 ten-day chunks
    for (const c of history) {
      const span =
        Number(c.url.searchParams.get('end_timestamp')) -
        Number(c.url.searchParams.get('start_timestamp'));
      expect(span).toBeLessThanOrEqual(10 * 86_400);
      expect(c.url.searchParams.get('average')).toBe('60');
    }
  });

  it('uses daily averages for the year and stamps them at midday', async () => {
    const dayStart = Date.parse('2026-01-10T00:00:00Z');
    const { provider, calls } = setup(() => historyTable([dayStart], 20, 20));
    const [s] = await provider.getHistory(365);
    const history = calls.filter((c) => c.url.pathname.endsWith('/history'));
    expect(history.every((c) => c.url.searchParams.get('average') === '1440')).toBe(true);
    expect(history).toHaveLength(2 * 3); // 365 d in ≤180 d chunks, per sensor
    expect(s?.readings[0]?.t).toBe('2026-01-10T12:00:00.000Z');
    expect(NOW - dayStart).toBeLessThan(365 * DAY);
  });

  it('gives actionable errors for bad keys and exhausted points', async () => {
    const make = (status: number) =>
      createPurpleAirProvider(
        'k',
        (async () => new Response('{}', { status })) as typeof fetch,
        () => NOW,
      );
    await expect(make(403).getStations()).rejects.toThrow(/rejected the API key/);
    await expect(make(402).getStations()).rejects.toThrow(/points are exhausted/);
    await expect(make(500).getStations()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('purpleair sensors for the map', () => {
  it('returns healthy sensors with EPA-corrected PM2.5, skipping failing and missing-humidity ones', async () => {
    const table = {
      fields: [
        'sensor_index',
        'name',
        'latitude',
        'longitude',
        'humidity',
        'pm2.5_cf_1_a',
        'pm2.5_cf_1_b',
      ],
      data: [
        [1, 'Rose Park', 40.79, -111.93, 40, 20, 20], // ok → 0.52*20 - 0.086*40 + 5.75 = 12.7
        [2, null, 40.7, -111.9, 40, 5, 90], // channels disagree
        [3, 'No RH', 40.6, -111.9, null, 10, 10], // no humidity → cannot correct
      ],
    };
    const impl = (async () => new Response(JSON.stringify(table))) as typeof fetch;
    const pa = createPurpleAirProvider('key', impl, () => NOW);
    const sensors = await pa.getSensors!();
    expect(sensors).toHaveLength(1);
    expect(sensors[0]).toMatchObject({ id: 1, name: 'Rose Park', lat: 40.79, lon: -111.93 });
    expect(sensors[0]?.pm25).toBeCloseTo(12.7, 1);
  });

  it('shares one discovery call between stations and sensors, and refreshes after the TTL', async () => {
    let now = NOW;
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response(JSON.stringify(SENSOR_TABLE));
    }) as typeof fetch;
    const pa = createPurpleAirProvider('key', impl, () => now);
    await pa.getStations();
    await pa.getSensors!();
    expect(calls).toBe(1);
    now += 11 * 60_000;
    await pa.getSensors!();
    expect(calls).toBe(2);
  });
});

describe('purpleair via the server proxy', () => {
  const PROXY = '/api/purpleair';
  function proxied() {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'https://site.test');
      calls.push({ url, init });
      return new Response(
        JSON.stringify(
          url.pathname.endsWith('/sensors')
            ? SENSOR_TABLE
            : historyTable([NOW - 3_600_000], 20, 20),
        ),
      );
    }) as typeof fetch;
    return { pa: createPurpleAirProvider(undefined, impl, () => NOW, PROXY), calls };
  }

  it('is enabled without any key, calls the proxy path, and sends no key header', async () => {
    const { pa, calls } = proxied();
    expect(pa.enabled).toBe(true);
    await pa.getStations();
    expect(calls[0]?.url.pathname).toBe('/api/purpleair/sensors');
    expect(calls[0]?.init).toBeUndefined();
  });

  it('is what createProvider selects when a proxy URL is set, even if a direct key exists too', () => {
    expect(createProvider({ useMock: false, purpleAirProxyUrl: PROXY, purpleAirKey: 'k' }).id).toBe(
      'purpleair',
    );
    expect(createProvider({ useMock: true, purpleAirProxyUrl: PROXY }).id).toBe('mock');
  });

  it('explains a rejected proxy request', async () => {
    const pa = createPurpleAirProvider(
      undefined,
      (async () => new Response('{}', { status: 403 })) as typeof fetch,
      () => NOW,
      PROXY,
    );
    await expect(pa.getStations()).rejects.toThrow(/PURPLEAIR_API_KEY on the server/);
  });

  it('rounds history windows to 10-minute buckets so all visitors share cached responses', async () => {
    const urlsAt = async (t: number) => {
      const calls: string[] = [];
      const impl = (async (input: RequestInfo | URL) => {
        const u = String(input);
        calls.push(u);
        return new Response(
          JSON.stringify(u.includes('/history') ? historyTable([t], 20, 20) : SENSOR_TABLE),
        );
      }) as typeof fetch;
      await createPurpleAirProvider(undefined, impl, () => t, PROXY).getSeries('24h');
      return calls.filter((c) => c.includes('/history')).sort();
    };
    const a = await urlsAt(Date.parse('2026-01-20T18:01:10Z'));
    const b = await urlsAt(Date.parse('2026-01-20T18:09:59Z'));
    const c = await urlsAt(Date.parse('2026-01-20T18:10:01Z'));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
