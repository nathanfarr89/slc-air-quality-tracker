import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useState } from 'react';
import { Alert, Box, chakra, Text, useBreakpointValue } from '@chakra-ui/react';
import { getAqiCategory, pm25ToAqi } from '../../api';
import { AqiGlyph } from '../../components/AqiGlyph';
import type { StationNow } from '../../lib/derive';
import { useColorMode } from '../../theme/colorMode';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
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
  selectedId?: string;
  onSelect: (id: string, trigger: HTMLElement) => void;
}

export default function MapPanel({ stations, selectedId, onSelect }: Props) {
  const { mode } = useColorMode();
  const [mapError, setMapError] = useState<string>();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  return (
    <>
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
      <Box
        h={{ base: '55vh', lg: '640px' }}
        minH="340px"
        rounded="lg"
        overflow="hidden"
        borderWidth="1px"
        role="region"
        aria-label="Map of Salt Lake Valley air quality stations"
      >
        <Map
          mapboxAccessToken={TOKEN}
          mapStyle={STYLES[mode]}
          initialViewState={{
            bounds: [
              [-112.12, 40.3],
              [-111.72, 40.98],
            ],
            fitBoundsOptions: { padding: 32 },
          }}
          cooperativeGestures={isMobile}
          onError={(e) => setMapError(e.error.message)}
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl showCompass={false} />
          {stations.map(({ station, reading }) => {
            const category = getAqiCategory(reading.pm25);
            const aqi = pm25ToAqi(reading.pm25);
            const selected = station.id === selectedId;
            return (
              <Marker
                key={station.id}
                longitude={station.lon}
                latitude={station.lat}
                anchor="center"
              >
                <MarkerButton
                  type="button"
                  aria-label={`${station.name}: PM2.5 ${reading.pm25.toFixed(1)} micrograms per cubic meter, AQI ${aqi}, ${category.label}. Open details.`}
                  aria-haspopup="dialog"
                  onClick={(e) => onSelect(station.id, e.currentTarget)}
                >
                  <AqiGlyph category={category} size={selected ? 46 : 38} value={aqi} />
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
      </Box>
    </>
  );
}
