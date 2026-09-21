import { AQI_CATEGORIES, aqiColor, getAqiCategory, pm25ToAqi } from './aqi';

describe('getAqiCategory', () => {
  it.each([
    [0, 'good'],
    [9.0, 'good'],
    [9.1, 'moderate'],
    [35.4, 'moderate'],
    [35.5, 'usg'],
    [55.4, 'usg'],
    [55.5, 'unhealthy'],
    [125.4, 'unhealthy'],
    [125.5, 'veryUnhealthy'],
    [225.5, 'hazardous'],
  ])('%s µg/m³ → %s', (pm, key) => {
    expect(getAqiCategory(pm).key).toBe(key);
  });

  it('truncates to one decimal like the EPA (9.09 is still Good)', () => {
    expect(getAqiCategory(9.09).key).toBe('good');
  });

  it('clamps negatives and off-scale values', () => {
    expect(getAqiCategory(-3).key).toBe('good');
    expect(getAqiCategory(900).key).toBe('hazardous');
  });
});

describe('pm25ToAqi', () => {
  it.each([
    [0, 0],
    [9.0, 50],
    [35.4, 100],
    [55.4, 150],
    [125.4, 200],
    [225.4, 300],
  ])('%s → AQI %s at breakpoint edges', (pm, aqi) => {
    expect(pm25ToAqi(pm)).toBe(aqi);
  });

  it('interpolates inside a band', () => {
    expect(pm25ToAqi(22.3)).toBeGreaterThan(50);
    expect(pm25ToAqi(22.3)).toBeLessThan(100);
  });

  it('caps at 500', () => {
    expect(pm25ToAqi(9999)).toBe(500);
  });
});

describe('category table', () => {
  it('gives every category a distinct color and shape (color-blind secondary cue)', () => {
    expect(new Set(AQI_CATEGORIES.map((c) => c.color)).size).toBe(AQI_CATEGORIES.length);
    expect(new Set(AQI_CATEGORIES.map((c) => c.shape)).size).toBe(AQI_CATEGORIES.length);
  });

  it('aqiColor returns the standard EPA color', () => {
    expect(aqiColor(5)).toBe('#00e400');
    expect(aqiColor(40)).toBe('#ff7e00');
  });
});

describe('demo flag', () => {
  it('is on when ?demo is in the URL, whatever its value', async () => {
    const { hasDemoFlag } = await import('./index');
    expect(hasDemoFlag('?demo')).toBe(true);
    expect(hasDemoFlag('?a=1&demo=1')).toBe(true);
    expect(hasDemoFlag('')).toBe(false);
    expect(hasDemoFlag('?demonstration=1')).toBe(false);
  });
});
