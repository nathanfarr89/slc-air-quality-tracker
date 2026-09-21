import { useMemo } from 'react';
import { CHART_TOKEN_NAMES, system } from './system';
import { useColorMode } from './colorMode';
import type { AqiCategoryKey } from '../api/aqi';

export interface ChartColors {
  panel: string;
  text: string;
  muted: string;
  border: string;
  brand: string;
  grid: string;
  series: string[];
  aqi: Record<AqiCategoryKey, string>;
  aqiText: Record<AqiCategoryKey, string>;
}

const KEYS: AqiCategoryKey[] = [
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
];

/** Resolve every chart token to a concrete color via its CSS variable in the current mode. */
function resolve(mode: string): ChartColors {
  void mode; // only here to key the memo; the values come from the live CSS variables
  const style = getComputedStyle(document.documentElement);
  const values = new Map<string, string>(
    CHART_TOKEN_NAMES.map((name) => {
      // `var(--chakra-colors-x)` → `--chakra-colors-x`
      const prop = system.token.var(`colors.${name}`).slice(4, -1);
      return [name, style.getPropertyValue(prop).trim()];
    }),
  );
  const get = (n: string) => values.get(n) ?? '';
  return {
    panel: get('bg.panel'),
    text: get('chart.text'),
    muted: get('fg.muted'),
    border: get('border'),
    brand: get('brand.solid'),
    grid: get('chart.grid'),
    series: [1, 2, 3, 4, 5].map((i) => get(`chart.series.${i}`)),
    aqi: Object.fromEntries(KEYS.map((k) => [k, get(`aqi.${k}`)])) as Record<
      AqiCategoryKey,
      string
    >,
    aqiText: Object.fromEntries(KEYS.map((k) => [k, get(`aqiText.${k}`)])) as Record<
      AqiCategoryKey,
      string
    >,
  };
}

/**
 * Resolves the theme's semantic color tokens to concrete values for libraries
 * that can't consume CSS variables (Apex, Plotly, Mapbox). Re-resolves when the color mode
 * changes; the mode class is applied to <html> before the re-render, so the values are current.
 */
export function useChartColors(): ChartColors {
  const { mode } = useColorMode();
  return useMemo(() => resolve(mode), [mode]);
}
