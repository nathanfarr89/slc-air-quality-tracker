import type { Station } from './types';

/** Fixed valley coordinates; each is treated as a "station" by the Open-Meteo and mock adapters. */
export const STATIONS: readonly Station[] = [
  { id: 'slc-downtown', name: 'Downtown SLC', lat: 40.7608, lon: -111.891 },
  { id: 'bountiful', name: 'Bountiful', lat: 40.8894, lon: -111.8808 },
  { id: 'sandy', name: 'Sandy', lat: 40.5649, lon: -111.8389 },
  { id: 'west-valley', name: 'West Valley City', lat: 40.6916, lon: -112.0011 },
  { id: 'lehi', name: 'Lehi', lat: 40.3916, lon: -111.8508 },
];

export function pickStations(ids?: string[]): Station[] {
  return ids?.length ? STATIONS.filter((s) => ids.includes(s.id)) : [...STATIONS];
}
