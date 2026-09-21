/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_USE_MOCK_DATA?: string;
  readonly VITE_PURPLEAIR_API_KEY?: string;
}

declare module 'plotly.js-cartesian-dist-min' {
  const Plotly: unknown;
  export default Plotly;
}
