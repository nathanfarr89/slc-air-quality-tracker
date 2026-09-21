import { ApiError } from './errors';
import { pickStations, STATIONS } from './stations';
import type { AirQualityProvider, Reading, SeriesRange, Station, StationSeries } from './types';

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const RANGE_HOURS: Record<SeriesRange, number> = { '24h': 24, '7d': 168, '30d': 720 };
const HOUR = 3_600_000;

interface HourlyBlock {
  time: string[];
  pm2_5?: (number | null)[];
  temperature_2m?: (number | null)[];
}
interface LocationResponse {
  hourly?: HourlyBlock;
}

type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string): Promise<LocationResponse[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new ApiError(`Open-Meteo request failed (${res.status})`, res.status);
  const body = (await res.json()) as LocationResponse | LocationResponse[];
  // One coordinate returns an object, several return an array (in request order).
  return Array.isArray(body) ? body : [body];
}

function query(stations: Station[], params: Record<string, string | number>): string {
  return new URLSearchParams({
    latitude: stations.map((s) => s.lat).join(','),
    longitude: stations.map((s) => s.lon).join(','),
    timezone: 'UTC',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString();
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Join air quality and temperature by timestamp; drop hours without PM2.5 or in the future. */
export function toReadings(
  air?: HourlyBlock,
  weather?: HourlyBlock,
  until = Date.now(),
): Reading[] {
  if (!air?.pm2_5) return [];
  const temps = new Map<string, number>();
  weather?.time.forEach((t, i) => {
    const v = weather.temperature_2m?.[i];
    if (v != null) temps.set(t, v);
  });
  const readings: Reading[] = [];
  air.time.forEach((t, i) => {
    const pm25 = air.pm2_5?.[i];
    const iso = `${t}Z`;
    if (pm25 == null || Date.parse(iso) > until) return;
    const temp = temps.get(t);
    readings.push(temp === undefined ? { t: iso, pm25 } : { t: iso, pm25, temp });
  });
  return readings;
}

export function createOpenMeteoProvider(
  fetchImpl: Fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
): AirQualityProvider {
  const assemble = (
    stations: Station[],
    air: LocationResponse[],
    wx: LocationResponse[],
    from: number,
  ): StationSeries[] =>
    stations.map((station, i) => ({
      station,
      readings: toReadings(air[i]?.hourly, wx[i]?.hourly, now()).filter(
        (r) => Date.parse(r.t) >= from,
      ),
    }));

  return {
    id: 'open-meteo',
    label: 'Open-Meteo Air Quality & Weather',
    getStations: async () => [...STATIONS],

    async getSeries(range, ids) {
      const stations = pickStations(ids);
      const hours = RANGE_HOURS[range];
      const window = { past_days: Math.ceil(hours / 24), forecast_days: 1 };
      const [air, wx] = await Promise.all([
        getJson(fetchImpl, `${AIR_URL}?${query(stations, { ...window, hourly: 'pm2_5' })}`),
        // Temperature is a nice-to-have: never fail the series because weather is down.
        getJson(
          fetchImpl,
          `${WEATHER_URL}?${query(stations, { ...window, hourly: 'temperature_2m' })}`,
        ).catch(() => []),
      ]);
      return assemble(stations, air, wx, now() - hours * HOUR);
    },

    async getHistory(days, ids) {
      const stations = pickStations(ids);
      const end = now();
      const from = end - days * 24 * HOUR;
      const range = { start_date: isoDate(from), end_date: isoDate(end) };
      const [air, wx] = await Promise.all([
        getJson(fetchImpl, `${AIR_URL}?${query(stations, { ...range, hourly: 'pm2_5' })}`),
        // The archive lags ~5 days, so recent hours have no temperature.
        getJson(
          fetchImpl,
          `${ARCHIVE_URL}?${query(stations, { ...range, hourly: 'temperature_2m' })}`,
        ).catch(() => []),
      ]);
      return assemble(stations, air, wx, from);
    },
  };
}
