import { handleProxy, PROXY_PREFIX } from './purpleairProxy';

const NOW = Date.parse('2026-01-20T18:00:00Z');
const SECRET = 'super-secret-read-key';
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const SENSORS_QS = new URLSearchParams({
  fields: 'name,latitude,longitude,humidity,pm2.5_cf_1_a,pm2.5_cf_1_b',
  location_type: '0',
  max_age: '3600',
  nwlng: '-112.2',
  nwlat: '41.05',
  selng: '-111.65',
  selat: '40.25',
});
const HISTORY_QS = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    start_timestamp: String(sec('2026-01-19T18:00:00Z')),
    end_timestamp: String(sec('2026-01-20T18:00:00Z')),
    average: '60',
    fields: 'pm2.5_cf_1_a,pm2.5_cf_1_b,humidity,temperature',
    ...over,
  });

function run(
  path: string,
  qs: URLSearchParams,
  opts: {
    method?: string;
    apiKey?: string | undefined;
    upstream?: () => Response | Promise<Response>;
  } = {},
) {
  const calls: { url: string; key: string | null }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), key: new Headers(init?.headers).get('X-API-Key') });
    return opts.upstream ? opts.upstream() : new Response('{"data":[]}');
  }) as typeof fetch;
  const request = new Request(`https://site.test${PROXY_PREFIX}${path}?${qs}`, {
    method: opts.method ?? 'GET',
  });
  const apiKey = 'apiKey' in opts ? opts.apiKey : SECRET;
  return handleProxy(request, { apiKey, fetchImpl, now: () => NOW }).then((res) => ({
    res,
    calls,
  }));
}

describe('purpleair proxy: forwarding', () => {
  it('forwards a valid sensors request with the server-side key and caches the response', async () => {
    const { res, calls } = await run('/sensors', SENSORS_QS);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.startsWith('https://api.purpleair.com/v1/sensors?')).toBe(true);
    expect(calls[0]?.key).toBe(SECRET);
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');
  });

  it('forwards a valid history request', async () => {
    const { res, calls } = await run('/sensors/12345/history', HISTORY_QS());
    expect(res.status).toBe(200);
    expect(calls[0]?.url).toContain('/v1/sensors/12345/history?');
  });

  it('never returns the key to the client', async () => {
    const { res } = await run('/sensors', SENSORS_QS);
    const all = JSON.stringify([...res.headers.entries()]) + (await res.text());
    expect(all).not.toContain(SECRET);
  });
});

describe('purpleair proxy: platform routing', () => {
  it('ignores the catch-all parameter Vercel injects, and does not forward it', async () => {
    const qs = new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), '...path': 'sensors' });
    const { res, calls } = await run('/sensors', qs);
    expect(res.status).toBe(200);
    expect(calls[0]?.url).not.toContain('path');
  });

  it('still rejects genuinely unknown parameters alongside it', async () => {
    const qs = new URLSearchParams({
      ...Object.fromEntries(SENSORS_QS),
      '...path': 'sensors',
      api_key: 'x',
    });
    const { res, calls } = await run('/sensors', qs);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('purpleair proxy: allowlist (protects the points budget)', () => {
  const rejected = async (path: string, qs: URLSearchParams, status = 400) => {
    const { res, calls } = await run(path, qs);
    expect(res.status).toBe(status);
    expect(calls).toHaveLength(0); // never reaches PurpleAir
    expect(res.headers.get('cache-control')).toBe('no-store');
  };

  it('rejects non-GET methods', async () => {
    const { res, calls } = await run('/sensors', SENSORS_QS, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown paths', () => rejected('/organization', new URLSearchParams(), 404));
  it('rejects path traversal-ish input', () =>
    rejected('/sensors/1/history/../keys', HISTORY_QS(), 404));
  it('rejects a non-numeric sensor id', () => rejected('/sensors/abc/history', HISTORY_QS(), 404));

  it('rejects unknown parameters, including a client-supplied api_key', async () => {
    await rejected(
      '/sensors',
      new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), api_key: 'x' }),
    );
    await rejected(
      '/sensors',
      new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), show_only: '1' }),
    );
  });

  it('rejects fields that are not on the allowlist', async () => {
    await rejected(
      '/sensors',
      new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), fields: 'name,pm10.0_atm' }),
    );
    await rejected('/sensors/1/history', HISTORY_QS({ fields: 'pm2.5_atm_a' }));
  });

  it('rejects a bounding box outside the valley', async () => {
    await rejected(
      '/sensors',
      new URLSearchParams({
        ...Object.fromEntries(SENSORS_QS),
        nwlng: '-125',
        selng: '-66',
        nwlat: '49',
        selat: '25',
      }),
    );
  });

  it('requires outdoor sensors and a sane max_age', async () => {
    await rejected(
      '/sensors',
      new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), location_type: '1' }),
    );
    await rejected(
      '/sensors',
      new URLSearchParams({ ...Object.fromEntries(SENSORS_QS), max_age: '99999999' }),
    );
  });

  it('rejects windows longer than the limit for the averaging period', async () => {
    await rejected(
      '/sensors/1/history',
      HISTORY_QS({ start_timestamp: String(sec('2025-12-01T00:00:00Z')) }),
    );
    await rejected('/sensors/1/history', HISTORY_QS({ average: '10' }));
  });

  it('rejects future or inverted windows', async () => {
    await rejected(
      '/sensors/1/history',
      HISTORY_QS({ end_timestamp: String(sec('2026-02-01T00:00:00Z')) }),
    );
    await rejected(
      '/sensors/1/history',
      HISTORY_QS({ start_timestamp: String(sec('2026-01-21T00:00:00Z')) }),
    );
  });
});

describe('purpleair proxy: failures', () => {
  it('reports a missing server key without calling PurpleAir', async () => {
    const { res, calls } = await run('/sensors', SENSORS_QS, { apiKey: undefined });
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it.each([
    [402, 402],
    [403, 403],
    [429, 429],
    [401, 403],
    [500, 502],
    [404, 502],
  ])('maps upstream %s to %s and never caches it', async (upstream, expected) => {
    const { res } = await run('/sensors', SENSORS_QS, {
      upstream: () => new Response('secret upstream details', { status: upstream }),
    });
    expect(res.status).toBe(expected);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toContain('secret upstream details');
  });

  it('returns 502 when PurpleAir is unreachable', async () => {
    const { res } = await run('/sensors', SENSORS_QS, {
      upstream: () => {
        throw new Error('network down');
      },
    });
    expect(res.status).toBe(502);
  });
});
