/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Public repo, so shipping source maps exposes nothing new and gives readable production stack traces.
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Hermetic: never let a developer's .env.local (keys, tokens) leak into tests.
    env: {
      VITE_USE_MOCK_DATA: 'true',
      VITE_PURPLEAIR_API_KEY: '',
      VITE_PURPLEAIR_PROXY_URL: '',
      VITE_MAPBOX_TOKEN: '',
      VITE_MOCK_SENSOR_COUNT: '',
    },
  },
});
