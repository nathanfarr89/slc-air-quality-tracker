/** Single source for the map's lazy chunk, so it can also be prefetched. */
export const loadMapPanel = () => import('./MapPanel');

/**
 * Start downloading the map code (and mapbox-gl itself) before the map is rendered. The map only mounts after
 * the station data arrives, so without this the ~1.8 MB download would start after the data round-trips
 * instead of overlapping them.
 */
export function preloadMap() {
  if (!import.meta.env.VITE_MAPBOX_TOKEN) return;
  void loadMapPanel();
  void import('mapbox-gl');
}
