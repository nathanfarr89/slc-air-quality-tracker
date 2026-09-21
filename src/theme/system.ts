import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { AQI_CATEGORIES } from '../api/aqi';

/** Okabe–Ito based series palette (color-blind safe), light and dark variants. */
const SERIES = [
  ['#0072b2', '#56b4e9'],
  ['#d55e00', '#ff9d5c'],
  ['#009e73', '#3ddbaa'],
  ['#cc79a7', '#e8a5c9'],
  ['#8a6d00', '#e6c000'],
] as const;

const aqi = Object.fromEntries(AQI_CATEGORIES.map((c) => [c.key, { value: c.color }]));
const aqiText = Object.fromEntries(AQI_CATEGORIES.map((c) => [c.key, { value: c.textColor }]));
const series = Object.fromEntries(
  SERIES.map(([light, dark], i) => [i + 1, { value: { _light: light, _dark: dark } }]),
);

export const system = createSystem(
  defaultConfig,
  defineConfig({
    globalCss: {
      body: { bg: 'bg', color: 'fg' },
      // Apex 7 styles tooltip titles with a 55%-opacity grey variable (4.0:1 on white); use a readable one in light mode. (!important: Chakra global CSS lives in @layer base and would otherwise lose to Apex's unlayered stylesheet.)
      '.apexcharts-tooltip.apexcharts-theme-light': {
        '--apx-tt-color-muted': '#3f3f46 !important',
      },
      ':focus-visible': { outline: '3px solid', outlineColor: 'brand.focus', outlineOffset: '2px' },
    },
    theme: {
      semanticTokens: {
        colors: {
          brand: {
            solid: { value: { _light: '#1a4f8b', _dark: '#63a4ff' } },
            focus: { value: { _light: '#1a4f8b', _dark: '#9cc4ff' } },
            contrast: { value: { _light: '#ffffff', _dark: '#0b1220' } },
          },
          // AQI category fill + the text color that reads on it.
          aqi,
          aqiText,
          chart: {
            grid: { value: { _light: '#d9dee5', _dark: '#3a4250' } },
            text: { value: { _light: '#3b4453', _dark: '#c5ccd8' } },
            series,
          },
          warn: {
            bg: { value: { _light: '#fff4e0', _dark: '#3a2a0c' } },
            fg: { value: { _light: '#7a4a00', _dark: '#ffd28a' } },
          },
        },
      },
    },
  }),
);

/** Token names the charts / map read at runtime, resolved through CSS variables. */
export const CHART_TOKEN_NAMES = [
  'bg.panel',
  'fg',
  'fg.muted',
  'border',
  'brand.solid',
  'chart.grid',
  'chart.text',
  'chart.series.1',
  'chart.series.2',
  'chart.series.3',
  'chart.series.4',
  'chart.series.5',
  ...AQI_CATEGORIES.flatMap((c) => [`aqi.${c.key}`, `aqiText.${c.key}`]),
] as const;

/** `var(--chakra-colors-…)` for a semantic color token, for SVG/inline styles. */
export const colorVar = (name: string) => system.token.var(`colors.${name}`);
