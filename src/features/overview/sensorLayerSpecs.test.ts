import { AQI_CATEGORIES, type Sensor } from '../../api';
import type { ChartColors } from '../../theme/useChartColors';
import {
  buildLayers,
  heatIntensityScale,
  LAYER_IDS,
  pmColorStep,
  sensorsToGeoJSON,
  summarize,
  withAlpha,
  withVisibility,
} from './sensorLayerSpecs';

const colors = {
  text: '#111111',
  aqi: {
    good: '#00e400',
    moderate: '#ffff00',
    usg: '#ff7e00',
    unhealthy: '#ff0000',
    veryUnhealthy: '#8f3f97',
    hazardous: '#7e0023',
  },
} as unknown as ChartColors;

const sensor = (id: number, pm25: number, extra: Partial<Sensor> = {}): Sensor => ({
  id,
  name: `S${id}`,
  lat: 40.7,
  lon: -111.9,
  pm25,
  t: '2026-01-20T18:00:00.000Z',
  ...extra,
});

describe('sensorsToGeoJSON', () => {
  it('uses lon/lat order, numeric feature ids (for feature-state) and derived AQI properties', () => {
    const fc = sensorsToGeoJSON([sensor(7, 40)]);
    const f = fc.features[0]!;
    expect(f.id).toBe(7);
    expect(f.geometry.coordinates).toEqual([-111.9, 40.7]);
    expect(f.properties).toMatchObject({ pm25: 40, category: 'usg', aqi: 112 });
  });

  it('drops sensors with non-finite coordinates or values', () => {
    const fc = sensorsToGeoJSON([sensor(1, 5), sensor(2, NaN), sensor(3, 5, { lat: Infinity })]);
    expect(fc.features.map((f) => f.id)).toEqual([1]);
  });
});

describe('summarize', () => {
  it('counts sensors per category and omits empty ones', () => {
    const out = summarize([sensor(1, 5), sensor(2, 6), sensor(3, 40)]);
    expect(out).toEqual([
      { key: 'good', label: 'Good', count: 2 },
      { key: 'usg', label: 'Unhealthy for Sensitive Groups', count: 1 },
    ]);
  });
});

describe('expressions', () => {
  it('pmColorStep steps at the EPA PM2.5 breakpoints with the theme colors', () => {
    const expr = pmColorStep(colors);
    expect(expr.slice(0, 3)).toEqual(['step', ['get', 'pm25'], '#00e400']);
    const stops = expr.slice(3);
    const breakpoints = stops.filter((_, i) => i % 2 === 0);
    expect(breakpoints).toEqual(AQI_CATEGORIES.slice(1).map((c) => c.pmMin));
    expect(stops[1]).toBe('#ffff00');
    // Mapbox requires strictly ascending step inputs.
    expect([...breakpoints].sort((a, b) => Number(a) - Number(b))).toEqual(breakpoints);
  });

  it('withAlpha converts hex to rgba', () => {
    expect(withAlpha('#ff7e00', 0.5)).toBe('rgba(255,126,0,0.5)');
  });
});

describe('buildLayers', () => {
  const layers = buildLayers(colors);

  it('defines heat, clusters, points and labels with stable ids', () => {
    expect(Object.values(layers).map((l) => (l as { id: string }).id)).toEqual([
      LAYER_IDS.heat,
      LAYER_IDS.clusters,
      LAYER_IDS.clusterCount,
      LAYER_IDS.points,
      LAYER_IDS.labels,
    ]);
  });

  it('colors clusters by their mean PM2.5 and points by their own value', () => {
    const cluster = layers.clusters as unknown as { paint: Record<string, unknown[]> };
    const point = layers.points as unknown as { paint: Record<string, unknown[]> };
    expect(JSON.stringify(cluster.paint['circle-color']?.[1])).toContain('pmSum');
    expect(point.paint['circle-color']?.[1]).toEqual(['get', 'pm25']);
  });

  it('puts hover styling in feature-state, not in React', () => {
    expect(JSON.stringify(layers.points)).toContain('feature-state');
  });

  it('scales heat intensity down as the sensor count grows so density does not saturate', () => {
    expect(heatIntensityScale(90)).toBe(1);
    expect(heatIntensityScale(180)).toBe(1);
    expect(heatIntensityScale(1800)).toBeCloseTo(0.1 ** 0.75, 5);
    expect(heatIntensityScale(5000)).toBeLessThan(heatIntensityScale(1800));
    const heat = (n: number) =>
      (buildLayers(colors, n).heat as unknown as { paint: Record<string, unknown[]> }).paint[
        'heatmap-intensity'
      ];
    expect(heat(1800)?.[4]).toBeCloseTo(0.7 * 0.1 ** 0.75, 5);
    expect(heat(180)?.[4]).toBeCloseTo(0.7, 5);
  });

  it('toggles visibility without dropping the layout', () => {
    const hidden = withVisibility(layers.clusterCount, false) as unknown as {
      layout: Record<string, unknown>;
    };
    expect(hidden.layout.visibility).toBe('none');
    expect(hidden.layout['text-size']).toBe(12);
  });
});
