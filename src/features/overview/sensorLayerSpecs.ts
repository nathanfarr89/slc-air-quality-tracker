import type { FeatureCollection, Point } from 'geojson';
import type { LayerProps } from 'react-map-gl/mapbox';
import {
  AQI_CATEGORIES,
  getAqiCategory,
  pm25ToAqi,
  type AqiCategoryKey,
  type Sensor,
} from '../../api';
import type { ChartColors } from '../../theme/useChartColors';

export const SENSOR_SOURCE = 'sensors';
/** Same data, unclustered: heatmaps must see every point, not cluster centroids. */
export const HEAT_SOURCE = 'sensors-heat';
export const LAYER_IDS = {
  heat: 'sensor-heat',
  clusters: 'sensor-clusters',
  clusterCount: 'sensor-cluster-count',
  points: 'sensor-points',
  labels: 'sensor-labels',
} as const;
/** Layers that respond to the pointer. */
export const INTERACTIVE_LAYERS: string[] = [LAYER_IDS.clusters, LAYER_IDS.points];

export interface SensorProps {
  name: string;
  pm25: number;
  aqi: number;
  category: AqiCategoryKey;
  t: string;
}

/**
 * Sensors → GeoJSON. Features get their numeric sensor id as the feature `id`, which Mapbox needs for
 * `feature-state` (hover styling runs on the GPU without re-rendering React or re-parsing the source).
 */
export function sensorsToGeoJSON(sensors: Sensor[]): FeatureCollection<Point, SensorProps> {
  return {
    type: 'FeatureCollection',
    features: sensors
      .filter((s) => [s.lat, s.lon, s.pm25].every(Number.isFinite))
      .map((s) => ({
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          name: s.name,
          pm25: s.pm25,
          aqi: pm25ToAqi(s.pm25),
          category: getAqiCategory(s.pm25).key,
          t: s.t,
        },
      })),
  };
}

/** Count of sensors per AQI category, for the text summary. */
export function summarize(
  sensors: Sensor[],
): { key: AqiCategoryKey; label: string; count: number }[] {
  return AQI_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    count: sensors.filter((s) => getAqiCategory(s.pm25).key === c.key).length,
  })).filter((c) => c.count > 0);
}

/** Mapbox expressions are validated by Mapbox at runtime; typing them fully adds noise, so layers are cast once below. */
type Expr = unknown[];

/** Data-driven `step` expression: color by the AQI category breakpoints (EPA PM2.5 ranges). */
export function pmColorStep(colors: ChartColors, input: Expr = ['get', 'pm25']): Expr {
  const [first, ...rest] = AQI_CATEGORIES;
  return [
    'step',
    input,
    colors.aqi[first!.key],
    ...rest.flatMap((c) => [c.pmMin, colors.aqi[c.key]]),
  ];
}

/** `#rrggbb` → `rgba(r,g,b,a)`; heatmap ramps need translucent stops. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const NOT_CLUSTER: Expr = ['!', ['has', 'point_count']];
const CLUSTER_MEAN: Expr = ['/', ['get', 'pmSum'], ['get', 'point_count']];
const FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

/** `clusterProperties` so each cluster carries the sum of PM2.5 (mean = sum / count) for coloring. */
export const CLUSTER_PROPERTIES = { pmSum: ['+', ['get', 'pm25']] };

export interface SensorLayerSpecs {
  heat: LayerProps;
  clusters: LayerProps;
  clusterCount: LayerProps;
  points: LayerProps;
  labels: LayerProps;
}

/**
 * Layer definitions. Colors come from theme tokens, so a color-mode change re-paints the layers.
 * Order matters (bottom to top): heat → clusters → points → labels.
 */
/** Sensor count the heat intensity is tuned for; more points scale it down so density doesn't saturate. */
export const HEAT_BASELINE_COUNT = 180;
/** Heatmap density grows with point count, not PM2.5, so normalize intensity by how many points overlap. */
// Exponent < 1: overlapping kernels grow slower than linearly, so a full 1/N would wash the layer out (tuned by eye).
export const heatIntensityScale = (count: number) =>
  Math.min(1, (HEAT_BASELINE_COUNT / Math.max(count, 1)) ** 0.75);

export function buildLayers(
  colors: ChartColors,
  sensorCount = HEAT_BASELINE_COUNT,
): SensorLayerSpecs {
  const k = heatIntensityScale(sensorCount);
  const [good, moderate, usg, unhealthy, veryUnhealthy] = AQI_CATEGORIES.map(
    (c) => colors.aqi[c.key],
  ) as [string, string, string, string, string];
  const halo = { 'text-halo-color': '#ffffff', 'text-halo-width': 1.5, 'text-color': '#000000' };

  return {
    // Smooth PM2.5 surface at low zoom; fades out as individual circles take over.
    heat: {
      id: LAYER_IDS.heat,
      type: 'heatmap',
      source: HEAT_SOURCE,
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'pm25'], 0, 0, 60, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.7 * k, 13, 2 * k],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 16, 13, 56],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 14, 0],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.15,
          withAlpha(good, 0.5),
          0.4,
          withAlpha(moderate, 0.65),
          0.65,
          withAlpha(usg, 0.75),
          0.85,
          withAlpha(unhealthy, 0.8),
          1,
          withAlpha(veryUnhealthy, 0.85),
        ],
      },
    } as unknown as LayerProps,

    clusters: {
      id: LAYER_IDS.clusters,
      type: 'circle',
      source: SENSOR_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': pmColorStep(colors, CLUSTER_MEAN),
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 40, 24, 200, 30],
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.text,
        'circle-opacity': 0.92,
      },
    } as unknown as LayerProps,

    clusterCount: {
      id: LAYER_IDS.clusterCount,
      type: 'symbol',
      source: SENSOR_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': FONT,
        'text-size': 12,
      },
      paint: halo,
    } as unknown as LayerProps,

    points: {
      id: LAYER_IDS.points,
      type: 'circle',
      source: SENSOR_SOURCE,
      filter: NOT_CLUSTER,
      paint: {
        'circle-color': pmColorStep(colors),
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['case', ['boolean', ['feature-state', 'hover'], false], 7, 4],
          15,
          ['case', ['boolean', ['feature-state', 'hover'], false], 16, 11],
        ],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 1.5],
        'circle-stroke-color': colors.text,
        'circle-opacity': 0.92,
      },
    } as unknown as LayerProps,

    // Numbers are the secondary (non-color) cue for the circles; shown once there is room.
    labels: {
      id: LAYER_IDS.labels,
      type: 'symbol',
      source: SENSOR_SOURCE,
      minzoom: 11.5,
      filter: NOT_CLUSTER,
      layout: { 'text-field': ['to-string', ['get', 'aqi']], 'text-font': FONT, 'text-size': 10 },
      paint: halo,
    } as unknown as LayerProps,
  };
}

export function withVisibility(spec: LayerProps, visible: boolean): LayerProps {
  return {
    ...spec,
    layout: { ...(spec as { layout?: object }).layout, visibility: visible ? 'visible' : 'none' },
  } as LayerProps;
}
