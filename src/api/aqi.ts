export type AqiCategoryKey =
  'good' | 'moderate' | 'usg' | 'unhealthy' | 'veryUnhealthy' | 'hazardous';

/** Secondary, non-color cue for markers and legends (color-blind safety). */
export type AqiShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'pentagon' | 'octagon';

export interface AqiCategory {
  key: AqiCategoryKey;
  label: string;
  /** AQI index range. */
  aqiMin: number;
  aqiMax: number;
  /** PM2.5 µg/m³ breakpoints (EPA, 2024 revision). */
  pmMin: number;
  pmMax: number;
  /** Standard EPA AQI color. The theme turns these into semantic tokens. */
  color: string;
  /** Readable text color to place on `color`. */
  textColor: string;
  shape: AqiShape;
  advice: string;
}

export const AQI_CATEGORIES: readonly AqiCategory[] = [
  {
    key: 'good',
    label: 'Good',
    aqiMin: 0,
    aqiMax: 50,
    pmMin: 0,
    pmMax: 9.0,
    color: '#00e400',
    textColor: '#000000',
    shape: 'circle',
    advice: 'Air quality is satisfactory.',
  },
  {
    key: 'moderate',
    label: 'Moderate',
    aqiMin: 51,
    aqiMax: 100,
    pmMin: 9.1,
    pmMax: 35.4,
    color: '#ffff00',
    textColor: '#000000',
    shape: 'square',
    advice: 'Unusually sensitive people should consider limiting prolonged outdoor exertion.',
  },
  {
    key: 'usg',
    label: 'Unhealthy for Sensitive Groups',
    aqiMin: 101,
    aqiMax: 150,
    pmMin: 35.5,
    pmMax: 55.4,
    color: '#ff7e00',
    textColor: '#000000',
    shape: 'diamond',
    advice:
      'Children, older adults and people with heart or lung disease should reduce prolonged exertion.',
  },
  {
    key: 'unhealthy',
    label: 'Unhealthy',
    aqiMin: 151,
    aqiMax: 200,
    pmMin: 55.5,
    pmMax: 125.4,
    color: '#ff0000',
    textColor: '#ffffff',
    shape: 'triangle',
    advice:
      'Everyone may begin to experience health effects; sensitive groups may see more serious effects.',
  },
  {
    key: 'veryUnhealthy',
    label: 'Very Unhealthy',
    aqiMin: 201,
    aqiMax: 300,
    pmMin: 125.5,
    pmMax: 225.4,
    color: '#8f3f97',
    textColor: '#ffffff',
    shape: 'pentagon',
    advice: 'Health alert: everyone may experience more serious health effects.',
  },
  {
    key: 'hazardous',
    label: 'Hazardous',
    aqiMin: 301,
    aqiMax: 500,
    pmMin: 225.5,
    pmMax: 500.4,
    color: '#7e0023',
    textColor: '#ffffff',
    shape: 'octagon',
    advice: 'Emergency conditions: everyone is more likely to be affected.',
  },
];

const HAZARDOUS = AQI_CATEGORIES[AQI_CATEGORIES.length - 1]!;

/** EPA reports PM2.5 truncated to one decimal before applying breakpoints. */
const truncate1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;

/** Category for a PM2.5 concentration (µg/m³). Values above the scale clamp to Hazardous. */
export function getAqiCategory(pm25: number): AqiCategory {
  const pm = truncate1(Math.max(0, pm25));
  return AQI_CATEGORIES.find((c) => pm <= c.pmMax) ?? HAZARDOUS;
}

/** EPA piecewise-linear AQI for a PM2.5 concentration, rounded to an integer. */
export function pm25ToAqi(pm25: number): number {
  const pm = truncate1(Math.max(0, pm25));
  const c = getAqiCategory(pm);
  const aqi = ((c.aqiMax - c.aqiMin) / (c.pmMax - c.pmMin)) * (pm - c.pmMin) + c.aqiMin;
  return Math.min(500, Math.round(aqi));
}

export const aqiColor = (pm25: number) => getAqiCategory(pm25).color;
