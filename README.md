# Salt Lake Valley Air Quality & Inversion Tracker

A React + TypeScript dashboard for current and historical PM2.5 across the Salt Lake Valley, built around
winter inversion episodes. It runs out of the box on keyless data (Open-Meteo) or fully offline on
inversion-shaped fixtures.

**Views:** Overview (map, KPI cards, station drawer) · Trends (Apex time series, range + station filters, live
polling) · History (Plotly: calendar heatmap, monthly box plot, PM2.5-vs-temperature scatter) · About/Data
(sources, methodology, AQI legend).

## Setup

```bash
npm install
cp .env.example .env.local   # then edit
npm run dev
```

| Script              | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Vite dev server                         |
| `npm run build`     | Typecheck, then production build        |
| `npm run typecheck` | `tsc --noEmit` (strict)                 |
| `npm run lint`      | ESLint (typescript-eslint, react-hooks) |
| `npm run format`    | Prettier                                |
| `npm test`          | Vitest + React Testing Library          |

### Environment variables

| Variable                 | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `VITE_MAPBOX_TOKEN`      | Mapbox public token. Without it the map is replaced by an explanatory message; the station table still works.        |
| `VITE_USE_MOCK_DATA`     | `true` serves offline fixtures (a cleared inversion plus one still building, and winter episodes for the past year). |
| `VITE_PURPLEAIR_API_KEY` | PurpleAir **read** key. When set (and mock mode is off) PurpleAir is used instead of Open-Meteo. See below.          |

`.env.local` is git-ignored; `.env.example` contains no secrets. Note that any `VITE_*` value is embedded in the
client bundle, so use a URL-restricted public Mapbox token.

## Architecture

```
src/
  api/          Provider interface + adapters. The only code that knows where data comes from.
    types.ts        Station, Reading, SeriesRange, AirQualityProvider
    aqi.ts          EPA PM2.5 → AQI/category/color/shape (pure, tested)
    openMeteo.ts    Open-Meteo Air Quality + Weather/Archive adapter
    mock.ts         Deterministic inversion-shaped fixtures
    purpleAir.ts    PurpleAir adapter (EPA correction, A/B QC, area aggregation), disabled without a key
    index.ts        createProvider(): the one place a source is chosen
  hooks/        TanStack Query hooks (useStations, useTimeSeries, useHistory) + live-append hook. No JSX.
  lib/          Pure derivations (KPIs, daily means, calendar grid, quartiles) and Mountain-time formatting.
  theme/        Chakra system with semantic tokens, color-mode provider, useChartColors().
  components/   Shared UI: DataState, ChartCard, ChartTable, AqiGlyph, PmChart.
  features/     overview/ trends/ history/ about/   (colocated views)
```

- **Single service layer.** Views call hooks; hooks call `provider`; adapters implement `AirQualityProvider`.
  Swapping in PurpleAir or AirNow/UDEQ means writing one adapter and changing one line in `api/index.ts`.
  The PurpleAir adapter rejects with a typed `ProviderDisabledError` when no key exists.
- **Explicit data states.** `DataState` handles loading, error (with retry), empty, stale (newest reading older
  than 3 h) and "refresh failed, showing cached data" for every view.
- **One theme, three chart libraries.** AQI colors, chart series colors and surface colors are Chakra semantic
  tokens (light/dark). `useChartColors()` resolves them through their CSS variables for Apex, Plotly and the
  Mapbox basemap style (light-v11 / dark-v11), and re-resolves on mode change.
- **Color-blind safety.** Every AQI category has a distinct shape as well as the standard EPA color. Markers show
  the AQI number, the legend and tables show the category name, and the Plotly scatter uses matching marker
  symbols per category.
- **Accessibility.** Skip link, tab semantics with keyboard navigation, focus-visible rings, labelled markers
  (station, value, AQI, category), `role="img"` + labels on charts, a collapsible data table under every chart,
  and focus returned to the marker when the drawer closes.
- **Time zones.** Charts show Mountain Time for every viewer (`lib/format.ts` re-expresses instants as Mountain
  wall-clock time for libraries that only do UTC/local), and daily aggregation uses Mountain-time days.

### Bundle size (production build, gzip)

| Chunk                                | Raw        | Gzip     | Loaded                         |
| ------------------------------------ | ---------- | -------- | ------------------------------ |
| App shell (React, Chakra, Apex, app) | 1,253 kB   | 368 kB   | Initial                        |
| Chakra system                        | 265 kB     | 69 kB    | Initial                        |
| `HistoryView` (Plotly cartesian)     | 1,449 kB   | 478 kB   | On opening History             |
| `mapbox-gl`                          | 1,839 kB   | 510 kB   | On Overview, only with a token |
| `MapPanel` + CSS                     | 18 + 49 kB | 7 + 6 kB | On Overview, only with a token |

Initial JS is about 437 kB gzipped. Plotly and Mapbox are each lazy-loaded via `React.lazy`. Apex and Chakra are
the remaining bulk of the initial load; see "What I'd do next".

### PurpleAir adapter

Source priority in `api/index.ts`: mock flag, then PurpleAir if a key is set, else Open-Meteo.

- **Areas, not single sensors.** Each of the five fixed stations becomes an area. The adapter discovers outdoor
  sensors that reported in the last hour, drops any whose channels A/B disagree (within 5 µg/m³ or 70%), and
  keeps the nearest 2 within 8 km. Readings are the median across them. Areas with no healthy sensor are omitted,
  and the Trends station list follows whatever the source returns.
- **EPA correction.** Channel-mean CF=1 PM2.5 and sensor RH go through the EPA/Barkjohn 2021 US-wide correction.
  Sensor temperature has the ~8 °F housing bias removed.
- **Cost control.** PurpleAir bills API points. Discovery runs once per session, hourly history is fetched in
  10-day chunks (the API allows 14), the year view uses daily averages (one request per sensor), and background
  and live polling are floored at 5 minutes via `minPollMs`. Roughly 10 sensors means a 30-day Trends view costs
  about 30 history requests; check your point balance in the PurpleAir developer portal.
- **Not verified against the live API.** It is built from PurpleAir's public docs and community documentation and
  covered by unit tests with a fake `fetch`, but I have not run it with a real key.

## How each visualization technology is used

### Job-requirement map

| Requirement                    | Evidence in this project                                                                                                       | Coverage                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Mapbox: **interactions**       | Keyboard- and pointer-operable markers that open a detail drawer; focus returns to the marker on close                         | Covered                                                     |
| Mapbox: **performance tuning** | `mapbox-gl` split into a lazy chunk (510 kB gzip) that loads only when the map is shown; style swap without recreating the map | Partial (bundle/loading only; no large-dataset tuning yet)  |
| Mapbox: **sources and layers** | None yet. Stations are DOM `Marker`s, not GeoJSON sources or style layers                                                      | **Gap.** See "Mapbox: what is and isn't demonstrated" below |
| Plotly and/or ApexCharts       | Both, each for the job it suits: Apex for 4 dashboard/live widgets, Plotly for 3 exploratory charts                            | Covered                                                     |

### Mapbox GL (via react-map-gl)

**Where:** `src/features/overview/MapPanel.tsx` (the map) and `MapSection.tsx` (token check and lazy loading).
`mapbox-gl` v3 is used through `react-map-gl` v8 (`react-map-gl/mapbox`).

**What it does here**

- **Declarative map.** `<Map>` with `initialViewState` fitting the valley's bounding box, so the framing is right on
  any screen size. `NavigationControl` for zoom, and `cooperativeGestures` on touch devices so the map doesn't trap
  page scrolling.
- **Theme-aware basemap.** The `mapStyle` prop switches between `light-v11` and `dark-v11` with the app's color
  mode. `react-map-gl` applies the new style to the existing map instead of re-creating it.
- **Custom interactive markers.** Each station is a `Marker` containing an accessible `<button>` with an SVG whose
  shape and AQI number encode the category (a color-blind-safe secondary cue). Clicking opens the drawer, and the
  `aria-label` reads the station, PM2.5, AQI and category.
- **Failure handling.** `onError` shows a warning instead of a blank map when the token is invalid, and a missing
  token renders an explanation plus a station table.
- **Performance.** The map and `mapbox-gl` load lazily (`React.lazy`), so users who never see the map, or have no
  token, don't pay for them. Marker data is derived with memoized selectors, and tiles/rendering run on the GPU
  inside Mapbox GL.

**Benefits of the approach:** the map is a normal React component, so app state (selected station, color mode, data
polling) drives it without imperative `map.*` calls; a11y is easy because markers are real DOM buttons.

**Mapbox: what is and isn't demonstrated.** The requirement asks for layers, sources, interactions and performance
tuning. This project currently shows interactions and loading-time performance, but **not sources or layers**. DOM
markers are simple and accessible, but each one is a DOM node and they don't scale past a few hundred points. The
natural next step, and the strongest way to cover the requirement, is:

1. Put stations (and, with PurpleAir, every valley sensor) in a GeoJSON `<Source>` and render them with a `<Layer>`
   of type `circle`, colored by a data-driven expression over PM2.5/AQI breakpoints.
2. Add `feature-state` hover/selection styling and a popup driven by `queryRenderedFeatures`.
3. Cluster at low zoom (`cluster: true`) and add a `heatmap` layer for PM2.5 intensity.
4. Measure with the browser Performance panel and document the results (feature count vs frame time).

### ApexCharts (via react-apexcharts): live and dashboard widgets

**Where:** `src/components/PmChart.tsx`, `src/features/overview/KpiCards.tsx`, shared options in
`src/components/apex.ts`, used by `TrendsView` and `StationDrawer`.

| Widget               | Apex feature                              | Used for                                               |
| -------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Trends time series   | `line` with `datetime` axis, zoom toolbar | Multi-station PM2.5 over 24 h / 7 d / 30 d             |
| AQI threshold guides | `annotations.yaxis`                       | Dashed lines and labels where each AQI category starts |
| 24-hour valley trend | `area` with `sparkline` mode              | KPI card                                               |
| Current AQI gauge    | `radialBar` with custom `dataLabels`      | KPI card, colored by the AQI category token            |
| Station drawer chart | Same `PmChart`, one series                | Per-station last 24 h                                  |

**Techniques worth pointing out**

- One `baseApexOptions()` supplies theme colors, fonts, grid and tooltip mode, so every chart follows light/dark
  mode from the Chakra tokens and options are `useMemo`-ed to avoid needless chart updates.
- Animations are off, so polling updates don't replay entry animations.
- Mountain-time display: timestamps are re-expressed as Mountain wall-clock time so the datetime axis shows Utah
  time for every viewer.
- **Live mode:** the Trends "Live" switch polls and merges new points into the existing series
  (`useAccumulatedSeries`) rather than replacing the chart data.

**Benefits:** small declarative config, good defaults, first-class sparkline and radial gauge types, cheap
re-renders for changing data, and a small footprint compared with Plotly. **Limits:** not built for statistical or
heatmap charts, which is why Plotly handles those.

### Plotly (via react-plotly.js): exploratory analysis

**Where:** `src/features/history/` (`CalendarHeatmap`, `MonthBoxPlot`, `TempScatter`, and `plotly.tsx` for the shared
setup). The whole History view is `React.lazy`-loaded, so Plotly is only downloaded when that tab opens.

| Chart                 | Plotly feature                                                                  | What it shows                                                    |
| --------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Calendar heatmap      | `heatmap` trace, discrete AQI colorscale, colorbar tick text, hover template    | One square per day for a year; inversion runs stand out          |
| PM2.5 by month        | `box` trace, reference-line shape and annotation                                | Monthly distribution against the EPA 24-hour standard (35 µg/m³) |
| PM2.5 vs. temperature | One `scatter` trace per AQI category with matching marker symbols, `rect` shape | Cold-and-polluted days cluster in the shaded region              |

**Techniques worth pointing out**

- `react-plotly.js/factory` with `plotly.js-cartesian-dist-min` gives only the trace types needed (about a third of
  the full bundle), and the component lives behind a lazy route.
- `baseLayout()` builds every layout from the theme tokens (fonts, grid, hover label), so the charts re-theme on
  color-mode change.
- Built-in zoom, pan, box-select, hover and the modebar are used as-is, as specified, rather than reimplemented.
- The scatter uses **shape plus color** per category (circle, square, diamond, ...), reusing the color-blind-safe
  encoding from the map markers.
- Every chart has `role="img"` with a text summary and a data-table fallback.

**Benefits:** statistical chart types out of the box, rich hover templates, and powerful interaction (zoom, pan,
select) with no custom code. **Limits:** heavier and slower to re-render than Apex, so it's used for static
analysis rather than live data.

## Library tradeoffs

- **Chakra UI v3** (stable): first-class semantic tokens and a `_dark` condition make one theme drive every
  surface. Tabs, Drawer, Checkbox, Switch and SegmentGroup are built on Ark UI state machines, so keyboard
  handling and ARIA come for free. The cost is a v3-only API surface and a larger runtime.
- **ApexCharts for live/dashboard widgets:** small declarative options, good-looking defaults, sparkline and
  radial-bar types that map directly onto KPI cards, cheap re-renders on polling updates, and animations that can be
  turned off. It is weak at statistical charts and heatmap-style layouts.
- **Plotly for exploratory analysis:** native `box` and `heatmap` traces, built-in zoom/pan/hover, and rich hover
  templates. It is heavy, so it is confined to the History route and lazy-loaded. It re-renders more slowly than
  Apex, which is why it isn't used for live data.
- **`plotly.js-cartesian-dist-min` instead of `plotly.js-basic-dist`:** the basic bundle only contains bar, pie and
  scatter, so it has no `box` or `heatmap`. The cartesian bundle adds those (plus histogram, violin, contour) for
  far less than the full 4+ MB build. This was the one dependency change beyond the requested list; it replaces
  `plotly.js-basic-dist`.
- **TanStack Query:** caching, request de-duplication, refetch intervals (the Trends "live" mode is a
  `refetchInterval` plus a merge step that appends new points), and error/stale state for free.
- **Data source:** Open-Meteo is keyless but _modeled_ (CAMS) PM2.5 on a coarse grid, so stations near each other
  look alike and sharp inversions are under-read. It's a good demo source and a poor health source; the About page
  says so. Temperature history comes from the ERA5 archive, which lags about five days.

## Testing

`npm test` runs Vitest + React Testing Library (71 tests):

- AQI category boundaries (including EPA one-decimal truncation), AQI interpolation, and color/shape uniqueness
- Mock provider: determinism, station filtering, inversion shape (buildup, peak, clearing), temperature coverage
- Open-Meteo adapter with an injected `fetch`: joins, ordering, weather-failure fallback, error mapping, archive URL
- Provider selection, PurpleAir adapter (EPA correction, channel QC, area aggregation, chunking, daily history, error mapping), freshness helpers
- Derivations (Mountain-time day bucketing, calendar grid, quartiles) and the live-append hook
- `DataState` loading, error + retry, empty, stale and cached-data states

The Mapbox map and Plotly/Apex canvases are not unit-tested (they need WebGL/canvas); they were exercised manually in a browser.

## Deployment

This is a static single-page app (`npm run build` produces `dist/`), so any static host works. Views use hash
URLs (`#trends`), so there are no server rewrite rules to configure.

| Host                       | Good for                                                                                                                                             | Watch out for                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel** (recommended)   | Zero-config Vite deploys, per-PR preview URLs, env vars in the dashboard, serverless functions for a PurpleAir key proxy, automatic HTTPS/CDN/Brotli | Hobby tier is meant for personal, non-commercial use (check current terms)                                                                                       |
| Netlify / Cloudflare Pages | Equivalent to Vercel; Cloudflare has generous free bandwidth and Workers for the proxy                                                               | Same setup work as Vercel                                                                                                                                        |
| GitHub Pages               | Free, lives next to the repo, fine for a portfolio demo                                                                                              | No server code, so **no way to hide the PurpleAir key**; needs `base: '/<repo>/'` in `vite.config.ts` and a GitHub Actions workflow to build; no preview deploys |
| S3 + CloudFront            | Full control, fits an existing AWS org                                                                                                               | Most setup for the least benefit here                                                                                                                            |

**Recommendation: Vercel.** The app is static, but three things push past GitHub Pages: preview deployments for
every PR (good for a portfolio and for reviewers), the ability to add a small server-side proxy so the PurpleAir key
never reaches the browser, and environment variables managed outside the repo. If you only want a quick public demo
on keyless data, GitHub Pages is fine.

### Deploying to Vercel

1. Create a git repository and push it to GitHub (the project isn't a git repo yet: `git init`, commit, push).
2. In Vercel choose **Add New Project**, import the repo, and keep the detected **Vite** preset
   (build `npm run build`, output `dist`).
3. Add environment variables (they're baked into the bundle at build time):
   - `VITE_MAPBOX_TOKEN`: a **public** token (`pk.`), created for production and **URL-restricted** to your
     domain(s) in the Mapbox dashboard.
   - `VITE_USE_MOCK_DATA=false`
   - Leave `VITE_PURPLEAIR_API_KEY` **unset** until the key is proxied (see below).
4. Deploy, then add your production and preview URLs to the Mapbox token's allowed URLs.

### Keeping the PurpleAir key private

Any `VITE_*` variable is readable by every visitor. To use PurpleAir in production, add a Vercel Function (for example
`api/purpleair/[...path].ts`) that forwards allowlisted `GET /v1/sensors...` requests to PurpleAir with the key from a
**non-`VITE_`** server variable (`PURPLEAIR_API_KEY`), and sets `Cache-Control: s-maxage=300` so the CDN absorbs
repeat traffic (this also protects your PurpleAir point budget). The client would then use `/api/purpleair` as its base
URL and no key. This isn't implemented yet.

## Production readiness

Status of what's needed before this should be called production-ready.

| Area                                | Status  | Notes                                                                                                                                                                                        |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict, ESLint, Prettier | Done    | `npm run typecheck`, `npm run lint`                                                                                                                                                          |
| Unit tests                          | Done    | 71 tests on the data layer, AQI utils, derivations and `DataState`                                                                                                                           |
| Loading/empty/error/stale states    | Done    | `DataState` in every view                                                                                                                                                                    |
| Code splitting                      | Done    | Plotly and Mapbox are lazy-loaded                                                                                                                                                            |
| No secrets in the repo              | Done    | `.env.local` ignored; `.env.example` is blank                                                                                                                                                |
| **Git repo and CI**                 | To do   | Not a git repo yet. Add a GitHub Actions workflow running `typecheck`, `lint`, `test` and `build` on every PR                                                                                |
| **React error boundary**            | To do   | A render error currently blanks the app. Add a top-level and per-view boundary with a friendly fallback                                                                                      |
| **Live-API verification**           | To do   | Open-Meteo and PurpleAir adapters are unit-tested with a fake `fetch` but haven't been run against the real services; test both                                                              |
| **PurpleAir key proxy**             | To do   | See above; required before enabling PurpleAir on a public site                                                                                                                               |
| **Mapbox token hygiene**            | To do   | Use a production-only public token, restrict it by URL, and monitor usage in the Mapbox dashboard                                                                                            |
| **Accessibility audit**             | To do   | Built with keyboard/ARIA support and checked manually in a browser, but no axe/Lighthouse run and no screen-reader pass yet                                                                  |
| End-to-end tests                    | To do   | Playwright for tabs, drawer open/close/focus, live toggle, dark mode; the map itself has no automated test                                                                                   |
| Error monitoring                    | To do   | e.g. Sentry (a new dependency, so decide before adding)                                                                                                                                      |
| Security headers / CSP              | To do   | Set on the host. Mapbox GL needs `worker-src blob:`, `img-src data: blob:` and `connect-src` for `api.mapbox.com` and `events.mapbox.com`; charts need `style-src 'unsafe-inline'`           |
| Data terms and attribution          | To do   | Confirm Open-Meteo, PurpleAir and Mapbox terms for your use (Open-Meteo's free tier is for non-commercial use), keep Mapbox attribution visible, and keep the source links on the About page |
| SEO/social metadata                 | To do   | Add Open Graph tags and a preview image to `index.html`                                                                                                                                      |
| Bundle budget                       | Partial | Initial JS is ~437 kB gzip. Lazy-load Trends/Apex and split Chakra to trim it                                                                                                                |
| Dependency hygiene                  | To do   | Enable Dependabot/Renovate and run `npm audit` in CI                                                                                                                                         |
| Health disclaimer                   | Partial | About page says the data is not for health decisions; add a short visible footnote on the Overview                                                                                           |
| Portfolio polish                    | To do   | Add screenshots or a short GIF, a live-demo link, and a LICENSE to this README                                                                                                               |

## What I'd do next

1. **Ground truth.** Add UDEQ/AirNow monitors and show them next to the PurpleAir and modeled values, and proxy the
   PurpleAir key server-side for public deployments.
2. **Trim the initial bundle.** Lazy-load the Trends view and the Apex charts, and use per-component Chakra imports
   or a manual chunk split.
3. **Inversion detection.** Flag episodes from data (multi-day PM2.5 rise plus cold, stable temperatures) and annotate
   them on the Trends and History charts instead of leaving them implicit.
4. **Component and e2e tests.** Playwright for the map/drawer/keyboard flow and an axe pass in CI.
5. **Persistence and sharing.** Put the selected range/stations in the URL and use a router for deep links.
6. **NowCast AQI** (the EPA's weighted 12-hour average) instead of instantaneous PM2.5, matching official reports.
