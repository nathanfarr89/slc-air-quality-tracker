import { createMockProvider } from './mock';
import { createOpenMeteoProvider } from './openMeteo';
import { createPurpleAirProvider } from './purpleAir';
import type { AirQualityProvider } from './types';

export * from './types';
export * from './aqi';
export * from './freshness';
export * from './errors';
export { STATIONS } from './stations';

export interface ProviderConfig {
  useMock: boolean;
  purpleAirKey?: string;
  /** Same-origin proxy that holds the key server-side (production). Takes precedence over a direct key. */
  purpleAirProxyUrl?: string;
  mockSensorCount?: number;
}

/** The one place a data source is chosen: mock flag, PurpleAir via proxy, PurpleAir direct key (dev only), else Open-Meteo. */
export function createProvider({
  useMock,
  purpleAirKey,
  purpleAirProxyUrl,
  mockSensorCount,
}: ProviderConfig): AirQualityProvider {
  if (useMock) return createMockProvider({ sensorCount: mockSensorCount });
  if (purpleAirProxyUrl) {
    return createPurpleAirProvider(undefined, undefined, undefined, purpleAirProxyUrl);
  }
  if (purpleAirKey) return createPurpleAirProvider(purpleAirKey);
  return createOpenMeteoProvider();
}

export const provider = createProvider({
  useMock: import.meta.env.VITE_USE_MOCK_DATA === 'true',
  purpleAirKey: import.meta.env.VITE_PURPLEAIR_API_KEY,
  purpleAirProxyUrl: import.meta.env.VITE_PURPLEAIR_PROXY_URL,
  mockSensorCount: Number(import.meta.env.VITE_MOCK_SENSOR_COUNT) || undefined,
});
