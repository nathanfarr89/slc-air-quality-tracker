import { act, renderHook } from '@testing-library/react';
import type { MapMouseEvent, MapRef } from 'react-map-gl/mapbox';
import { LAYER_IDS, SENSOR_SOURCE } from './sensorLayerSpecs';
import { useSensorInteractions } from './useSensorInteractions';

const point = (id: number) => ({
  id,
  layer: { id: LAYER_IDS.points },
  geometry: { type: 'Point', coordinates: [-111.9, 40.7] },
  properties: {
    name: `S${id}`,
    pm25: 20,
    aqi: 72,
    category: 'moderate',
    t: '2026-01-20T18:00:00Z',
  },
});
const cluster = {
  id: 1,
  layer: { id: LAYER_IDS.clusters },
  geometry: { type: 'Point', coordinates: [-111.95, 40.6] },
  properties: { cluster_id: 42, point_count: 12 },
};
const evt = (...features: unknown[]) => ({ features }) as unknown as MapMouseEvent;

function setup() {
  const getClusterExpansionZoom = vi.fn((_id: number, cb: (e: Error | null, z: number) => void) =>
    cb(null, 11),
  );
  const map = {
    setFeatureState: vi.fn(),
    easeTo: vi.fn(),
    getMap: () => ({ getSource: () => ({ getClusterExpansionZoom }) }),
  };
  const ref = { current: map as unknown as MapRef };
  return { map, getClusterExpansionZoom, ...renderHook(() => useSensorInteractions(ref)) };
}

describe('useSensorInteractions', () => {
  it('highlights via feature-state and shows a transient popup on hover, clearing on mouse-out', () => {
    const { result, map } = setup();
    act(() => result.current.onMouseMove(evt(point(5))));
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: SENSOR_SOURCE, id: 5 },
      { hover: true },
    );
    expect(result.current.popup).toMatchObject({ id: 5, pinned: false, lon: -111.9, lat: 40.7 });
    expect(result.current.cursor).toBe('pointer');

    act(() => result.current.onMouseLeave());
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: SENSOR_SOURCE, id: 5 },
      { hover: false },
    );
    expect(result.current.popup).toBeNull();
    expect(result.current.cursor).toBe('');
  });

  it('does not touch feature-state again while the same feature stays hovered', () => {
    const { result, map } = setup();
    act(() => result.current.onMouseMove(evt(point(5))));
    act(() => result.current.onMouseMove(evt(point(5))));
    expect(map.setFeatureState).toHaveBeenCalledTimes(1);
  });

  it('moves the highlight when hovering a different sensor', () => {
    const { result, map } = setup();
    act(() => result.current.onMouseMove(evt(point(5))));
    act(() => result.current.onMouseMove(evt(point(6))));
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: SENSOR_SOURCE, id: 5 },
      { hover: false },
    );
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: SENSOR_SOURCE, id: 6 },
      { hover: true },
    );
  });

  it('pins on click (touch has no hover) and keeps the pin through hover changes until an empty click', () => {
    const { result } = setup();
    act(() => result.current.onClick(evt(point(5))));
    expect(result.current.popup).toMatchObject({ id: 5, pinned: true });

    act(() => result.current.onMouseMove(evt(point(6))));
    act(() => result.current.onMouseLeave());
    expect(result.current.popup).toMatchObject({ id: 5, pinned: true });

    act(() => result.current.onClick(evt()));
    expect(result.current.popup).toBeNull();
  });

  it('zooms to the expansion level when a cluster is clicked, without opening a popup', () => {
    const { result, map, getClusterExpansionZoom } = setup();
    act(() => result.current.onClick(evt(cluster)));
    expect(getClusterExpansionZoom).toHaveBeenCalledWith(42, expect.any(Function));
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-111.95, 40.6], zoom: 11 }),
    );
    expect(result.current.popup).toBeNull();
  });

  it('shows a pointer over clusters but no hover popup', () => {
    const { result } = setup();
    act(() => result.current.onMouseMove(evt(cluster)));
    expect(result.current.cursor).toBe('pointer');
    expect(result.current.popup).toBeNull();
  });
});
