import { useCallback, useRef, useState, type RefObject } from 'react';
import type { GeoJSONSource } from 'mapbox-gl';
import type { MapMouseEvent, MapRef } from 'react-map-gl/mapbox';
import { LAYER_IDS, SENSOR_SOURCE, type SensorProps } from './sensorLayerSpecs';

export interface PopupInfo {
  id: number;
  lon: number;
  lat: number;
  props: SensorProps;
  /** Pinned by click/tap (the only way to open it on touch); hover popups vanish on mouse-out. */
  pinned: boolean;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Pointer behavior for the sensor layers:
 * - hover: GPU `feature-state` highlight + transient popup, pointer cursor
 * - click a sensor: pin its popup (works on touch)
 * - click a cluster: zoom to the level where it breaks apart
 * State only changes when the hovered feature changes, so mouse movement doesn't re-render React.
 */
export function useSensorInteractions(mapRef: RefObject<MapRef | null>) {
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [cursor, setCursor] = useState('');
  const hovered = useRef<number | null>(null);

  const setHover = useCallback(
    (id: number | null) => {
      const map = mapRef.current;
      if (!map || hovered.current === id) return;
      if (hovered.current !== null) {
        map.setFeatureState({ source: SENSOR_SOURCE, id: hovered.current }, { hover: false });
      }
      if (id !== null) map.setFeatureState({ source: SENSOR_SOURCE, id }, { hover: true });
      hovered.current = id;
    },
    [mapRef],
  );

  const toPopup = (
    f: NonNullable<MapMouseEvent['features']>[number],
    pinned: boolean,
  ): PopupInfo => {
    const [lon = 0, lat = 0] = (f.geometry as GeoJSON.Point).coordinates;
    return { id: f.id as number, lon, lat, props: f.properties as SensorProps, pinned };
  };

  const onMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const f = e.features?.[0];
      const layer = f?.layer?.id;
      setCursor(layer ? 'pointer' : '');
      if (f && layer === LAYER_IDS.points) {
        setHover(f.id as number);
        setPopup((prev) => (prev?.pinned || prev?.id === f.id ? prev : toPopup(f, false)));
      } else {
        setHover(null);
        setPopup((prev) => (prev?.pinned ? prev : null));
      }
    },
    [setHover],
  );

  const onMouseLeave = useCallback(() => {
    setHover(null);
    setCursor('');
    setPopup((prev) => (prev?.pinned ? prev : null));
  }, [setHover]);

  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const f = e.features?.[0];
      const map = mapRef.current;
      if (!f || !map) {
        setPopup(null);
        return;
      }
      if (f.layer?.id === LAYER_IDS.clusters) {
        const source = map.getMap().getSource(SENSOR_SOURCE) as GeoJSONSource | undefined;
        const center = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        source?.getClusterExpansionZoom(f.properties?.cluster_id as number, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center, zoom, duration: prefersReducedMotion() ? 0 : 500 });
        });
      } else {
        setPopup(toPopup(f, true));
      }
    },
    [mapRef],
  );

  return { popup, cursor, closePopup: () => setPopup(null), onMouseMove, onMouseLeave, onClick };
}
