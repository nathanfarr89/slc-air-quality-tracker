import { useMemo, useRef, useState } from 'react';
import Map, { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Alert, Box, chakra, Text, useBreakpointValue } from '@chakra-ui/react';
import { getAqiCategory, pm25ToAqi, type Sensor } from '../../api';
import { AqiGlyph } from '../../components/AqiGlyph';
import { ChartTable } from '../../components/ChartTable';
import type { StationNow } from '../../lib/derive';
import { formatMtDateTime } from '../../lib/format';
import { useColorMode } from '../../theme/colorMode';
import { MapControls } from './MapControls';
import { SensorLayers } from './SensorLayers';
import { INTERACTIVE_LAYERS, sensorsToGeoJSON, summarize } from './sensorLayerSpecs';
import { useSensorInteractions } from './useSensorInteractions';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
};
/** Keeps panning inside the valley region, so tiles outside it are never requested. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [-112.7, 40.0],
  [-111.3, 41.3],
];

/**
 * Mapbox marks every marker wrapper role="img" with a generic label. Ours contains a real focusable button,
 * and an image role may not contain interactive controls, so drop the role and let the button speak.
 */
const stripMarkerRole = (marker: { getElement(): HTMLElement } | null) => {
  marker?.getElement().removeAttribute('role');
  marker?.getElement().removeAttribute('aria-label');
};

const MarkerButton = chakra('button', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    rounded: 'md',
    bg: 'transparent',
    transition: 'transform 0.1s',
    _hover: { transform: 'scale(1.12)' },
  },
});

interface Props {
  stations: StationNow[];
  sensors?: Sensor[];
  sensorsFailed?: boolean;
  selectedId?: string;
  onSelect: (id: string, trigger: HTMLElement) => void;
}

export default function MapPanel({
  stations,
  sensors,
  sensorsFailed,
  selectedId,
  onSelect,
}: Props) {
  const { mode } = useColorMode();
  const mapRef = useRef<MapRef>(null);
  const [mapError, setMapError] = useState<string>();
  const [showHeat, setShowHeat] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;
  const { popup, cursor, closePopup, ...handlers } = useSensorInteractions(mapRef);

  // Stable reference: the GeoJSON sources are only re-parsed when the sensor data actually changes.
  const geojson = useMemo(() => sensorsToGeoJSON(sensors ?? []), [sensors]);
  const summary = useMemo(() => summarize(sensors ?? []), [sensors]);
  const hasSensors = geojson.features.length > 0;

  return (
    <Box minW="0">
      {mapError && (
        <Alert.Root status="warning" role="status" mb="2">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>The basemap couldn’t load</Alert.Title>
            <Alert.Description>
              {mapError} Check <code>VITE_MAPBOX_TOKEN</code>. Station markers and the table below
              still work.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {sensorsFailed && (
        <Alert.Root status="warning" role="status" mb="2">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Sensor layers unavailable</Alert.Title>
            <Alert.Description>
              Individual sensors couldn’t be loaded. Station markers still work.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Box
        position="relative"
        h={{ base: '55vh', lg: '640px' }}
        minH="340px"
        rounded="lg"
        overflow="hidden"
        borderWidth="1px"
        role="region"
        aria-label="Map of Salt Lake Valley air quality stations and sensors"
      >
        <Map
          ref={mapRef}
          mapboxAccessToken={TOKEN}
          mapStyle={STYLES[mode]}
          initialViewState={{
            bounds: [
              [-112.12, 40.3],
              [-111.72, 40.98],
            ],
            fitBoundsOptions: { padding: 32 },
          }}
          minZoom={8}
          maxBounds={MAX_BOUNDS}
          cooperativeGestures={isMobile}
          interactiveLayerIds={hasSensors ? INTERACTIVE_LAYERS : []}
          cursor={cursor}
          onError={(e) => setMapError(e.error.message)}
          style={{ width: '100%', height: '100%' }}
          {...handlers}
        >
          <NavigationControl showCompass={false} />

          {hasSensors && (
            <SensorLayers data={geojson} showHeat={showHeat} showSensors={showSensors} />
          )}

          {popup && (
            <Popup
              key={`${popup.id}-${popup.pinned}`}
              longitude={popup.lon}
              latitude={popup.lat}
              anchor="bottom"
              offset={14}
              closeButton={popup.pinned}
              closeOnClick={false}
              onClose={closePopup}
              maxWidth="220px"
            >
              <div style={{ color: '#111', fontSize: 13, lineHeight: 1.35 }}>
                <strong>{popup.props.name}</strong>
                <div>
                  PM2.5 {popup.props.pm25.toFixed(1)} µg/m³ · AQI {popup.props.aqi}
                </div>
                <div>{getAqiCategory(popup.props.pm25).label}</div>
                <div style={{ color: '#555', fontSize: 11 }}>
                  {formatMtDateTime(Date.parse(popup.props.t))}
                </div>
              </div>
            </Popup>
          )}

          {stations.map(({ station, reading }) => {
            const category = getAqiCategory(reading.pm25);
            const aqi = pm25ToAqi(reading.pm25);
            const selected = station.id === selectedId;
            return (
              <Marker
                ref={stripMarkerRole}
                key={station.id}
                longitude={station.lon}
                latitude={station.lat}
                anchor="center"
              >
                <MarkerButton
                  type="button"
                  aria-label={`AQI ${aqi} ${station.name}. PM2.5 ${reading.pm25.toFixed(1)} micrograms per cubic meter, ${category.label}. Open details.`}
                  aria-haspopup="dialog"
                  onClick={(e) => onSelect(station.id, e.currentTarget)}
                >
                  <AqiGlyph category={category} size={selected ? 46 : 38} value={aqi} />
                  {/* Whitespace node: keeps the DOM text "112 Downtown SLC" (not "112Downtown SLC"), matching the accessible name. Invisible in a flex column. */}{' '}
                  <Text
                    as="span"
                    fontSize="xs"
                    fontWeight="semibold"
                    color="fg"
                    bg="bg.panel"
                    px="1.5"
                    rounded="sm"
                    borderWidth="1px"
                    mt="0.5"
                    whiteSpace="nowrap"
                  >
                    {station.name}
                  </Text>
                </MarkerButton>
              </Marker>
            );
          })}
        </Map>

        {hasSensors && (
          <MapControls
            showHeat={showHeat}
            showSensors={showSensors}
            onHeat={setShowHeat}
            onSensors={setShowSensors}
            sensorCount={geojson.features.length}
          />
        )}
      </Box>

      {hasSensors && (
        <Box mt="2">
          <Text fontSize="sm" color="fg.muted" aria-live="polite">
            {geojson.features.length} sensors shown as circles and a heat layer. Hover or tap a
            circle for its reading; click a cluster to zoom in. Stations above stay keyboard
            accessible.
          </Text>
          <ChartTable
            caption="Sensors by AQI category"
            columns={['Category', 'Sensors']}
            rows={summary.map((s) => [s.label, s.count])}
          />
        </Box>
      )}
    </Box>
  );
}
