import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import type { FeatureCollection, Point } from 'geojson';
import { useChartColors } from '../../theme/useChartColors';
import {
  buildLayers,
  CLUSTER_PROPERTIES,
  HEAT_SOURCE,
  SENSOR_SOURCE,
  withVisibility,
  type SensorProps,
} from './sensorLayerSpecs';

interface Props {
  data: FeatureCollection<Point, SensorProps>;
  showHeat: boolean;
  showSensors: boolean;
}

/**
 * Two GeoJSON sources over the same features: one clustered (circles, counts, labels) and one raw (heatmap).
 * Layers are rebuilt only when theme colors change; react-map-gl diffs them into `setPaintProperty` calls.
 */
export function SensorLayers({ data, showHeat, showSensors }: Props) {
  const colors = useChartColors();
  const count = data.features.length;
  const layers = useMemo(() => buildLayers(colors, count), [colors, count]);

  return (
    <>
      <Source id={HEAT_SOURCE} type="geojson" data={data}>
        <Layer {...withVisibility(layers.heat, showHeat)} />
      </Source>
      <Source
        id={SENSOR_SOURCE}
        type="geojson"
        data={data}
        cluster
        clusterRadius={45}
        clusterMaxZoom={12}
        clusterProperties={CLUSTER_PROPERTIES as never}
      >
        <Layer {...withVisibility(layers.clusters, showSensors)} />
        <Layer {...withVisibility(layers.clusterCount, showSensors)} />
        <Layer {...withVisibility(layers.points, showSensors)} />
        <Layer {...withVisibility(layers.labels, showSensors)} />
      </Source>
    </>
  );
}
