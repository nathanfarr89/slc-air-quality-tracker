export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** One hourly (or daily) observation. `t` is an ISO-8601 UTC timestamp. */
export interface Reading {
  t: string;
  pm25: number;
  /** Air temperature in °C, when the source provides it. */
  temp?: number;
}

export type SeriesRange = '24h' | '7d' | '30d';

export interface StationSeries {
  station: Station;
  readings: Reading[];
}

export type SourceId = 'open-meteo' | 'mock' | 'purpleair';

/**
 * Everything the UI needs from a data source. Adapters (Open-Meteo, mock,
 * PurpleAir, later AirNow/UDEQ) implement this; hooks never see the adapter.
 */
export interface AirQualityProvider {
  readonly id: SourceId;
  readonly label: string;
  /** Floor (ms) for background and live polling, for sources with rate limits or metered usage. */
  readonly minPollMs?: number;
  getStations(): Promise<Station[]>;
  /** Hourly readings for the last `range`, oldest first, one series per station. */
  getSeries(range: SeriesRange, stationIds?: string[]): Promise<StationSeries[]>;
  /** Hourly readings for the past `days` days, oldest first (used by the History view). */
  getHistory(days: number, stationIds?: string[]): Promise<StationSeries[]>;
}
