import { lazy, Suspense } from 'react';
import { Alert, Code, Skeleton, Text } from '@chakra-ui/react';
import type { Sensor } from '../../api';
import type { StationNow } from '../../lib/derive';

// mapbox-gl is the heaviest dependency: load it only when the Overview is shown with a token.
const MapPanel = lazy(() => import('./MapPanel'));

interface Props {
  stations: StationNow[];
  sensors?: Sensor[];
  sensorsFailed?: boolean;
  selectedId?: string;
  onSelect: (id: string, trigger: HTMLElement) => void;
}

export function MapSection(props: Props) {
  if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    return (
      <Alert.Root status="info" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Map unavailable: no Mapbox token</Alert.Title>
          <Alert.Description>
            <Text>
              Add <Code>VITE_MAPBOX_TOKEN</Code> to a <Code>.env.local</Code> file (see{' '}
              <Code>.env.example</Code>) and restart the dev server. Station readings are still
              available in the table below.
            </Text>
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }
  return (
    <Suspense
      fallback={
        <Skeleton
          h={{ base: '55vh', lg: '640px' }}
          minH="340px"
          rounded="lg"
          aria-label="Loading map"
        />
      }
    >
      <MapPanel {...props} />
    </Suspense>
  );
}
