import { ApiError, ProviderDisabledError } from './errors';
import { pickStations, STATIONS } from './stations';
import type {
  AirQualityProvider,
  Reading,
  Sensor,
  SeriesRange,
  Station,
  StationSeries,
} from './types';

const BASE = 'https://api.purpleair.com/v1';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGE_HOURS: Record<SeriesRange, number> = { '24h': 24, '7d': 168, '30d': 720 };

/** Valley bounding box used to discover sensors (covers Bountiful to Lehi). */
const BBOX = { nwlng: -112.2, nwlat: 41.05, selng: -111.65, selat: 40.25 };
/** Each fixed "station" is an area: its readings are the median of the nearest healthy outdoor sensors. */
export const SENSORS_PER_AREA = 2;
export const AREA_RADIUS_KM = 8;
/** Channel A/B agreement (EPA QC): within 5 µg/m³ or within 70% of their mean. */
const AB_MAX_ABS = 5;
const AB_MAX_REL = 0.7;
/** PurpleAir documents these per-request span limits: 1-hour averages 14 days, daily averages 1 year. Stay well inside. */
const HOURLY_CHUNK_MS = 10 * DAY;
const DAILY_CHUNK_MS = 180 * DAY;
const CONCURRENCY = 3;
const DISCOVERY_TTL_MS = 10 * 60_000;
/** History windows end on a 10-minute boundary (see series()). */
export const CACHE_BUCKET_MS = 10 * 60_000;

type Cell = number | string | null;
interface Table {
  fields: string[];
  data: Cell[][];
}
type Row = Record<string, Cell>;

export interface PurpleAirProvider extends AirQualityProvider {
  readonly enabled: boolean;
}

/**
 * EPA/Barkjohn (2021) US-wide correction for PurpleAir PM2.5 (CF=1 channel mean, sensor-reported RH).
 * The quadratic branch covers heavy smoke (> 343 µg/m³).
 */
export function epaCorrectedPm25(cf1: number, rh: number): number {
  const pm = cf1 < 343 ? 0.52 * cf1 - 0.086 * rh + 5.75 : 0.46 * cf1 + 3.93e-4 * cf1 * cf1 + 2.97;
  return Math.max(0, pm);
}

export function channelsAgree(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= AB_MAX_ABS || diff / ((a + b) / 2) <= AB_MAX_REL;
}

/** Sensor-housing temperature reads about 8 °F above ambient; returns ambient °C. */
export const sensorFToAmbientC = (f: number) => ((f - 8 - 32) * 5) / 9;

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function chunkRanges(start: number, end: number, span: number): [number, number][] {
  const out: [number, number][] = [];
  for (let s = start; s < end; s += span) out.push([s, Math.min(s + span, end)]);
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Merge several sensors' readings into one series: median PM2.5 and mean temperature per timestamp. */
export function combineSensors(perSensor: Reading[][]): Reading[] {
  const byTime = new Map<string, Reading[]>();
  for (const readings of perSensor) {
    for (const r of readings) byTime.set(r.t, [...(byTime.get(r.t) ?? []), r]);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, rs]) => {
      const temps = rs.flatMap((r) => (r.temp === undefined ? [] : [r.temp]));
      const pm25 = Math.round(median(rs.map((r) => r.pm25)) * 10) / 10;
      return temps.length
        ? { t, pm25, temp: temps.reduce((a, b) => a + b, 0) / temps.length }
        : { t, pm25 };
    });
}

function toRows({ fields, data }: Table): Row[] {
  return data.map((cells) => Object.fromEntries(fields.map((f, i) => [f, cells[i] ?? null])));
}

const num = (v: Cell | undefined): number | undefined => (typeof v === 'number' ? v : undefined);

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

type Fetch = typeof fetch;

export function createPurpleAirProvider(
  apiKey: string | undefined = import.meta.env.VITE_PURPLEAIR_API_KEY,
  fetchImpl: Fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
  /** Override to route through a server-side proxy that holds the key (see api/purpleair). */
  baseUrl: string = BASE,
): PurpleAirProvider {
  const proxied = baseUrl !== BASE;
  // Behind the proxy the browser never sees a key, so 'enabled' can't depend on one.
  const enabled = Boolean(apiKey) || proxied;

  async function get(path: string, params: Record<string, string | number>): Promise<Table> {
    const url = `${baseUrl}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    const res = await fetchImpl(
      url,
      proxied ? undefined : { headers: { 'X-API-Key': apiKey ?? '' } },
    );
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(
        proxied
          ? `The PurpleAir proxy was rejected (${res.status}). Check PURPLEAIR_API_KEY on the server.`
          : `PurpleAir rejected the API key (${res.status}). Use a READ key.`,
        res.status,
      );
    }
    if (res.status === 402) {
      throw new ApiError('PurpleAir API points are exhausted (402).', 402);
    }
    if (!res.ok) throw new ApiError(`PurpleAir request failed (${res.status})`, res.status);
    return (await res.json()) as Table;
  }

  // Sensor discovery is one metered call. Cache it (10 min) and clear on failure so it can retry.
  interface Discovery {
    areas: Map<string, number[]>;
    sensors: Sensor[];
    at: number;
  }
  let discovery: Promise<Discovery> | undefined;
  let discoveredAt = 0;
  function discover(): Promise<Discovery> {
    if (discovery && now() - discoveredAt > DISCOVERY_TTL_MS) discovery = undefined;
    if (!discovery) {
      discoveredAt = now();
      discovery = get('/sensors', {
        fields: 'name,latitude,longitude,humidity,pm2.5_cf_1_a,pm2.5_cf_1_b',
        location_type: 0, // outdoor only
        max_age: 3600, // reported in the last hour
        ...BBOX,
      })
        .then((table): Discovery => {
          const at = now();
          const healthy = toRows(table).flatMap((r) => {
            const [index, lat, lon, a, b, rh] = [
              num(r.sensor_index),
              num(r.latitude),
              num(r.longitude),
              num(r['pm2.5_cf_1_a']),
              num(r['pm2.5_cf_1_b']),
              num(r.humidity),
            ];
            const ok =
              index !== undefined &&
              lat !== undefined &&
              lon !== undefined &&
              a !== undefined &&
              b !== undefined &&
              channelsAgree(a, b);
            if (!ok) return [];
            const name = typeof r.name === 'string' && r.name ? r.name : `Sensor ${index}`;
            // The EPA correction needs RH; sensors without it still count for area discovery.
            const pm25 =
              rh === undefined
                ? undefined
                : Math.round(epaCorrectedPm25((a + b) / 2, rh) * 10) / 10;
            return [{ index, lat, lon, name, pm25 }];
          });
          const areas = new Map<string, number[]>();
          for (const s of STATIONS) {
            const nearest = healthy
              .map((x) => ({ index: x.index, km: haversineKm(s.lat, s.lon, x.lat, x.lon) }))
              .filter((x) => x.km <= AREA_RADIUS_KM)
              .sort((p, q) => p.km - q.km)
              .slice(0, SENSORS_PER_AREA);
            if (nearest.length)
              areas.set(
                s.id,
                nearest.map((x) => x.index),
              );
          }
          const sensors = healthy.flatMap((x) =>
            x.pm25 === undefined
              ? []
              : [
                  {
                    id: x.index,
                    name: x.name,
                    lat: x.lat,
                    lon: x.lon,
                    pm25: x.pm25,
                    t: new Date(at).toISOString(),
                  },
                ],
          );
          return { areas, sensors, at };
        })
        .catch((e: unknown) => {
          discovery = undefined;
          throw e;
        });
    }
    return discovery;
  }

  async function sensorReadings(index: number, start: number, end: number, average: 60 | 1440) {
    const span = average === 60 ? HOURLY_CHUNK_MS : DAILY_CHUNK_MS;
    const readings: Reading[] = [];
    for (const [from, to] of chunkRanges(start, end, span)) {
      // Behind the proxy the sensor is a parameter (the platform routes one path segment); direct calls use the real path.
      const table = await get(proxied ? '/history' : `/sensors/${index}/history`, {
        ...(proxied ? { sensor_index: index } : {}),
        start_timestamp: Math.floor(from / 1000),
        end_timestamp: Math.floor(to / 1000),
        average,
        fields: 'pm2.5_cf_1_a,pm2.5_cf_1_b,humidity,temperature',
      });
      for (const r of toRows(table)) {
        const [ts, a, b, rh, tempF] = [
          num(r.time_stamp),
          num(r['pm2.5_cf_1_a']),
          num(r['pm2.5_cf_1_b']),
          num(r.humidity),
          num(r.temperature),
        ];
        // The correction needs RH, and disagreeing channels mean a failing sensor.
        if (ts === undefined || a === undefined || b === undefined || rh === undefined) continue;
        if (!channelsAgree(a, b)) continue;
        // Daily rows are stamped at the start of the period; midpoint keeps them on the right Mountain-time day.
        const t = new Date(ts * 1000 + (average === 1440 ? 12 * HOUR : 0)).toISOString();
        const pm25 = Math.round(epaCorrectedPm25((a + b) / 2, rh) * 10) / 10;
        readings.push(
          tempF === undefined ? { t, pm25 } : { t, pm25, temp: sensorFToAmbientC(tempF) },
        );
      }
    }
    return readings;
  }

  async function series(
    windowMs: number,
    average: 60 | 1440,
    ids?: string[],
  ): Promise<StationSeries[]> {
    const { areas } = await discover();
    const stations = pickStations(ids).filter((s) => areas.has(s.id));
    // Bucketed so every visitor in the same window requests identical URLs and the proxy's CDN cache can hit.
    const end = Math.floor(now() / CACHE_BUCKET_MS) * CACHE_BUCKET_MS;
    const jobs = stations.flatMap((station) =>
      (areas.get(station.id) ?? []).map((index) => ({ station, index })),
    );
    const results = await mapLimit(jobs, CONCURRENCY, (j) =>
      sensorReadings(j.index, end - windowMs, end, average),
    );
    return stations.map((station) => ({
      station,
      readings: combineSensors(results.filter((_, i) => jobs[i]?.station.id === station.id)),
    }));
  }

  const off = async (): Promise<never> => {
    throw new ProviderDisabledError();
  };

  if (!enabled) {
    return {
      id: 'purpleair',
      label: 'PurpleAir (disabled: no API key)',
      enabled,
      getStations: off,
      getSeries: off,
      getHistory: off,
    };
  }

  return {
    id: 'purpleair',
    label: 'PurpleAir community sensors (EPA-corrected)',
    enabled,
    // Each call is metered; keep background refreshes infrequent.
    minPollMs: 5 * 60_000,
    async getStations(): Promise<Station[]> {
      const { areas } = await discover();
      return STATIONS.filter((s) => areas.has(s.id));
    },
    async getSensors(): Promise<Sensor[]> {
      return (await discover()).sensors;
    },
    getSeries: (range, ids) => series(RANGE_HOURS[range] * HOUR, 60, ids),
    // Daily averages: one cheap request per sensor covers the whole year.
    getHistory: (days, ids) => series(days * DAY, 1440, ids),
  };
}
