import { pickStations, STATIONS } from './stations';
import type {
  AirQualityProvider,
  Reading,
  Sensor,
  SeriesRange,
  Station,
  StationSeries,
} from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGE_HOURS: Record<SeriesRange, number> = { '24h': 24, '7d': 168, '30d': 720 };

/** Per-station multiplier: West Valley sits deepest in the cold pool, Lehi and Bountiful get less. */
const STATION_FACTOR: Record<string, number> = {
  'slc-downtown': 1,
  bountiful: 0.88,
  sandy: 1.06,
  'west-valley': 1.18,
  lehi: 0.82,
};

/** Deterministic hash → [0, 1). Same inputs always give the same "noise", so windows overlap consistently. */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Episode {
  start: number;
  buildHours: number;
  /** Extra PM2.5 (µg/m³) reached at the end of the buildup, before clearing. */
  peak: number;
}

/**
 * Inversion episodes: a multi-day buildup (PM accumulates under the cap), then a
 * front clears it out in roughly a day. Winter episodes are calendar-based; two
 * more are anchored to `now` so demos always show a cleared episode plus one still building.
 */
function buildEpisodes(now: number): Episode[] {
  const episodes: Episode[] = [];
  const year = new Date(now).getUTCFullYear();
  for (let y = year - 2; y <= year; y++) {
    let s = Date.UTC(y, 10, 22);
    const end = Date.UTC(y + 1, 1, 25);
    let i = 0;
    while (s < end) {
      episodes.push({
        start: s,
        buildHours: (4 + Math.round(hash01(y, i) * 4)) * 24,
        peak: 30 + Math.round(hash01(y, i + 100) * 45),
      });
      s += (9 + Math.round(hash01(y, i + 200) * 6)) * DAY;
      i++;
    }
  }
  episodes.push({ start: now - 12 * DAY, buildHours: 6 * 24, peak: 58 });
  episodes.push({ start: now - 3 * DAY, buildHours: 3.5 * 24, peak: 46 });
  return episodes;
}

/** Extra PM from episodes at time t, plus 0–1 "inversion strength" used for the temperature model. */
function inversionAt(t: number, episodes: Episode[]): { extra: number; strength: number } {
  let extra = 0;
  let strength = 0;
  for (const e of episodes) {
    const buildEnd = e.start + e.buildHours * HOUR;
    let v = 0;
    if (t >= e.start && t <= buildEnd) v = Math.pow((t - e.start) / (buildEnd - e.start), 1.4);
    else if (t > buildEnd) v = Math.exp(-(t - buildEnd) / (5 * HOUR)); // clearing
    if (v * e.peak > extra) {
      extra = v * e.peak;
      strength = v;
    }
  }
  return { extra, strength };
}

function sample(station: Station, t: number, episodes: Episode[]): Reading {
  const date = new Date(t);
  const doy = (t - Date.UTC(date.getUTCFullYear(), 0, 0)) / DAY;
  const localHour = (((t / HOUR) % 24) - 7 + 24) % 24; // Mountain time, ignoring DST

  const winter = (1 + Math.cos((2 * Math.PI * (doy - 15)) / 365)) / 2; // 1 in mid-Jan
  const { extra, strength } = inversionAt(t, episodes);
  const hourKey = Math.floor(t / HOUR);
  const stationKey = STATIONS.findIndex((s) => s.id === station.id) + 1;

  const noise = 1 + (hash01(hourKey, stationKey) - 0.5) * 0.22;
  const diurnal = 1 + 0.14 * Math.sin((2 * Math.PI * (localHour - 3)) / 24) * (0.4 + strength);
  const factor = STATION_FACTOR[station.id] ?? 1;
  const pm25 = Math.max(0.5, (4 + 4 * winter + extra) * factor * diurnal * noise);

  const seasonal = 12.5 - 14 * Math.cos((2 * Math.PI * (doy - 15)) / 365);
  const swing = 6.5 * Math.sin((2 * Math.PI * (localHour - 9)) / 24) * (1 - 0.6 * strength);
  const temp = seasonal + swing - 3 * strength + (hash01(hourKey, stationKey + 50) - 0.5) * 3;

  return {
    t: new Date(t).toISOString(),
    pm25: Math.round(pm25 * 10) / 10,
    temp: Math.round(temp * 10) / 10,
  };
}

/**
 * Simulated dense sensor network: inverse-distance-weighted from the five station values, with per-sensor
 * noise and a lower factor on the east bench (above the cold pool). Deterministic per index.
 */
function buildSensors(count: number, current: number): Sensor[] {
  const hourMs = Math.floor(current / HOUR) * HOUR;
  const episodes = buildEpisodes(current);
  const stationNow = STATIONS.map((s) => ({ s, pm: sample(s, hourMs, episodes).pm25 }));
  return Array.from({ length: count }, (_, i) => {
    const lat = 40.38 + hash01(i, 1) * 0.55;
    const lon = -112.03 + hash01(i, 2) * 0.27;
    let num = 0;
    let den = 0;
    for (const { s, pm } of stationNow) {
      const km2 = ((lat - s.lat) * 111) ** 2 + ((lon - s.lon) * 84) ** 2;
      num += pm / (km2 + 4);
      den += 1 / (km2 + 4);
    }
    const bench = lon > -111.84 ? 0.78 : 1;
    const pm25 = Math.max(0.5, (num / den) * bench * (0.85 + hash01(i, 3) * 0.3));
    return {
      id: i + 1,
      name: `Sensor ${i + 1}`,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      pm25: Math.round(pm25 * 10) / 10,
      t: new Date(hourMs).toISOString(),
    };
  });
}

export interface MockOptions {
  now?: () => number;
  /** Simulated network latency so loading states are visible in demos. */
  latencyMs?: number;
  /** Number of simulated sensors for the map layers (raise it to stress-test rendering). */
  sensorCount?: number;
}

export function createMockProvider({
  now = Date.now,
  latencyMs = 350,
  sensorCount = 180,
}: MockOptions = {}): AirQualityProvider {
  const delay = () =>
    latencyMs ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve();

  const build = (
    hours: number,
    ids: string[] | undefined,
    withLivePoint: boolean,
  ): StationSeries[] => {
    const current = now();
    const lastHour = Math.floor(current / HOUR) * HOUR;
    const episodes = buildEpisodes(current);
    return pickStations(ids).map((station) => {
      const readings: Reading[] = [];
      for (let t = lastHour - (hours - 1) * HOUR; t <= lastHour; t += HOUR) {
        readings.push(sample(station, t, episodes));
      }
      // In-progress point, so the Trends "live" mode has something new to append on every poll.
      const minute = Math.floor(current / 60_000) * 60_000;
      if (withLivePoint && minute > lastHour) readings.push(sample(station, minute, episodes));
      return { station, readings };
    });
  };

  return {
    id: 'mock',
    label: 'Mock fixture data (offline)',
    async getStations() {
      await delay();
      return [...STATIONS];
    },
    async getSensors() {
      await delay();
      return buildSensors(sensorCount, now());
    },
    async getSeries(range, ids) {
      await delay();
      return build(RANGE_HOURS[range], ids, true);
    },
    async getHistory(days, ids) {
      await delay();
      return build(days * 24, ids, false);
    },
  };
}
