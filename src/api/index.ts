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
}

/** The one place a data source is chosen: mock flag, then PurpleAir if a key is set, else Open-Meteo. */
export function createProvider({ useMock, purpleAirKey }: ProviderConfig): AirQualityProvider {
  if (useMock) return createMockProvider();
  if (purpleAirKey) return createPurpleAirProvider(purpleAirKey);
  return createOpenMeteoProvider();
}

export const provider = createProvider({
  useMock: import.meta.env.VITE_USE_MOCK_DATA === 'true',
  purpleAirKey: import.meta.env.VITE_PURPLEAIR_API_KEY,
});
