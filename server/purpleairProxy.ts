/**
 * Server-side PurpleAir proxy (runs as a Vercel Function, see api/purpleair/[route].ts).
 *
 * It exists for two reasons:
 *  1. The API key must never reach the browser (every VITE_* value is public).
 *  2. PurpleAir bills API points per call. Responses are cached at the CDN, so all visitors share one
 *     upstream call per window.
 *
 * The endpoint is public, so it only forwards a narrow allowlist of requests and enforces the limits
 * the app itself respects; otherwise anyone could spend your points through it.
 */

export const PROXY_PREFIX = '/api/purpleair';
const UPSTREAM = 'https://api.purpleair.com/v1';
const DAY = 86_400_000;

/** Valley bounding box: sensor discovery may not ask for anything larger. Keep in sync with src/api/purpleAir.ts. */
const BBOX = { nwlng: -112.2, nwlat: 41.05, selng: -111.65, selat: 40.25 };
const BBOX_SLACK = 0.01;

const SENSOR_FIELDS = new Set([
  'name',
  'latitude',
  'longitude',
  'humidity',
  'pm2.5_cf_1_a',
  'pm2.5_cf_1_b',
]);
const HISTORY_FIELDS = new Set(['pm2.5_cf_1_a', 'pm2.5_cf_1_b', 'humidity', 'temperature']);
const SENSORS_PARAMS = new Set(['fields', 'location_type', 'max_age', ...Object.keys(BBOX)]);
const HISTORY_PARAMS = new Set([
  'sensor_index',
  'fields',
  'start_timestamp',
  'end_timestamp',
  'average',
]);
/** Longest window per averaging period (PurpleAir's own limits are 14 days hourly, 1 year daily). */
const MAX_SPAN_MS: Record<string, number> = { '60': 14 * DAY, '1440': 200 * DAY };

/** CDN cache: 5 min fresh, then serve stale while revalidating for 10 more. */
const CACHE_OK = 'public, s-maxage=300, stale-while-revalidate=600';

export interface ProxyOptions {
  /** PurpleAir READ key (server-side env var). */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

const bad = (reason: string) => json(400, { error: reason });

function checkParams(params: URLSearchParams, allowed: Set<string>): string | undefined {
  for (const key of params.keys()) {
    if (!allowed.has(key)) return `Parameter not allowed: ${key}`;
  }
  return undefined;
}

function checkFields(value: string | null, allowed: Set<string>): string | undefined {
  if (!value) return 'fields is required';
  const bad = value.split(',').find((f) => !allowed.has(f));
  return bad ? `Field not allowed: ${bad}` : undefined;
}

const int = (v: string | null): number | undefined =>
  v !== null && /^\d{1,12}$/.test(v) ? Number(v) : undefined;
const float = (v: string | null): number | undefined =>
  v !== null && /^-?\d{1,3}(\.\d{1,6})?$/.test(v) ? Number(v) : undefined;

/** Validates the request and builds the upstream URL, or returns an error Response. */
export function buildUpstream(url: URL, now: number): { url: string } | { error: Response } {
  const path = url.pathname.startsWith(PROXY_PREFIX) ? url.pathname.slice(PROXY_PREFIX.length) : '';
  // Vercel's file-system route [route].ts injects its own 'route' parameter; it isn't part of the client's request.
  const q = new URLSearchParams(url.searchParams);
  q.delete('route');

  if (path === '/sensors') {
    const problem = checkParams(q, SENSORS_PARAMS) ?? checkFields(q.get('fields'), SENSOR_FIELDS);
    if (problem) return { error: bad(problem) };
    if (q.get('location_type') !== '0') return { error: bad('location_type must be 0 (outdoor)') };
    const maxAge = int(q.get('max_age'));
    if (!maxAge || maxAge > DAY / 1000) return { error: bad('max_age must be 1..86400 seconds') };
    const box = Object.fromEntries(Object.keys(BBOX).map((k) => [k, float(q.get(k))]));
    const ok =
      box.nwlng !== undefined &&
      box.nwlat !== undefined &&
      box.selng !== undefined &&
      box.selat !== undefined &&
      box.nwlng >= BBOX.nwlng - BBOX_SLACK &&
      box.selng <= BBOX.selng + BBOX_SLACK &&
      box.nwlat <= BBOX.nwlat + BBOX_SLACK &&
      box.selat >= BBOX.selat - BBOX_SLACK &&
      box.nwlng < box.selng &&
      box.selat < box.nwlat;
    if (!ok) return { error: bad('Bounding box must lie within the Salt Lake Valley area') };
    return { url: `${UPSTREAM}/sensors?${q}` };
  }

  // History is a single-segment route with the sensor as a parameter: the platform only routes one path segment
  // to this function, so the upstream shape /sensors/:id/history can't be exposed directly.
  if (path === '/history') {
    const problem = checkParams(q, HISTORY_PARAMS) ?? checkFields(q.get('fields'), HISTORY_FIELDS);
    if (problem) return { error: bad(problem) };
    const sensor = q.get('sensor_index') ?? '';
    if (!/^\d{1,9}$/.test(sensor))
      return { error: bad('sensor_index must be a numeric sensor id') };
    q.delete('sensor_index');
    const average = q.get('average') ?? '';
    const maxSpan = MAX_SPAN_MS[average];
    if (!maxSpan) return { error: bad('average must be 60 or 1440') };
    const start = int(q.get('start_timestamp'));
    const end = int(q.get('end_timestamp'));
    if (start === undefined || end === undefined || end <= start) {
      return { error: bad('start_timestamp and end_timestamp must be increasing integers') };
    }
    if ((end - start) * 1000 > maxSpan) return { error: bad('Requested window is too long') };
    if (end * 1000 > now + 3_600_000) return { error: bad('end_timestamp is in the future') };
    return { url: `${UPSTREAM}/sensors/${sensor}/history?${q}` };
  }

  return { error: json(404, { error: 'Unknown PurpleAir path' }) };
}

export async function handleProxy(request: Request, options: ProxyOptions): Promise<Response> {
  const { apiKey, fetchImpl = fetch, now = Date.now } = options;
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, { allow: 'GET' });
  if (!apiKey) return json(500, { error: 'PURPLEAIR_API_KEY is not configured on the server' });

  const upstream = buildUpstream(new URL(request.url), now());
  if ('error' in upstream) return upstream.error;

  let res: Response;
  try {
    res = await fetchImpl(upstream.url, { headers: { 'X-API-Key': apiKey } });
  } catch {
    return json(502, { error: 'Could not reach PurpleAir' });
  }

  if (res.ok) {
    return new Response(await res.text(), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': CACHE_OK },
    });
  }
  // The client maps these to actionable messages; everything else is a generic upstream failure.
  // Upstream error bodies are not forwarded (they can echo request details).
  const passthrough = [402, 403, 429];
  if (res.status === 401) return json(403, { error: 'PurpleAir rejected the API key' });
  return passthrough.includes(res.status)
    ? json(res.status, { error: `PurpleAir returned ${res.status}` })
    : json(502, { error: `PurpleAir returned ${res.status}` });
}
