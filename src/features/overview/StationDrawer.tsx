import { useRef } from 'react';
import {
  Box,
  CloseButton,
  Drawer,
  HStack,
  Portal,
  SimpleGrid,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react';
import { getAqiCategory, isStale, latestTimestamp, type StationSeries } from '../../api';
import { AqiBadge } from '../../components/AqiGlyph';
import { ChartTable } from '../../components/ChartTable';
import { PmChart } from '../../components/PmChart';
import { celsiusToF, formatMtDateTime, round1 } from '../../lib/format';

interface Props {
  series?: StationSeries;
  onClose: () => void;
  /** Element to refocus when the drawer closes (the marker or table button that opened it). */
  returnFocusTo?: () => HTMLElement | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
        {label}
      </Text>
      <Text fontWeight="semibold" fontSize="lg">
        {value}
      </Text>
    </Box>
  );
}

function Body({ series }: { series: StationSeries }) {
  const { station, readings } = series;
  const last = readings.at(-1);
  if (!last) return <Text>No readings for this station.</Text>;
  const pm = readings.map((r) => r.pm25);
  const latest = latestTimestamp(readings);
  const category = getAqiCategory(last.pm25);

  return (
    <>
      <Text fontSize="4xl" fontWeight="bold" lineHeight="1">
        {round1(last.pm25)}{' '}
        <Text as="span" fontSize="md" fontWeight="normal" color="fg.muted">
          µg/m³
        </Text>
      </Text>
      <Box mt="2">
        <AqiBadge pm25={last.pm25} />
      </Box>
      <Text mt="2" fontSize="sm">
        {category.advice}
      </Text>
      <Text fontSize="xs" color="fg.muted" mt="2">
        Updated {latest ? formatMtDateTime(latest) : 'unknown'}
        {isStale(latest) && ' · data may be out of date'} · {station.lat.toFixed(3)}°N,{' '}
        {Math.abs(station.lon).toFixed(3)}°W
      </Text>

      <SimpleGrid columns={4} gap="3" my="4">
        <Stat
          label="24h avg"
          value={round1(pm.reduce((a, b) => a + b, 0) / pm.length).toString()}
        />
        <Stat label="24h min" value={round1(Math.min(...pm)).toString()} />
        <Stat label="24h max" value={round1(Math.max(...pm)).toString()} />
        <Stat
          label="Temp"
          value={last.temp === undefined ? '—' : `${Math.round(celsiusToF(last.temp))}°F`}
        />
      </SimpleGrid>

      <Box role="img" aria-label={`Line chart of ${station.name} PM2.5 over the last 24 hours.`}>
        <PmChart series={[{ name: station.name, readings }]} height={220} showLegend={false} />
      </Box>
      <ChartTable
        caption={`${station.name} hourly PM2.5, last 24 hours`}
        columns={['Time (MT)', 'PM2.5 (µg/m³)']}
        rows={readings.map((r) => [formatMtDateTime(Date.parse(r.t)), r.pm25])}
      />
    </>
  );
}

export function StationDrawer({ series, onClose, returnFocusTo }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const placement = useBreakpointValue<'bottom' | 'end'>({ base: 'bottom', md: 'end' }) ?? 'end';
  return (
    <Drawer.Root
      open={Boolean(series)}
      onOpenChange={(e) => !e.open && onClose()}
      finalFocusEl={returnFocusTo}
      // Open on the dialog's close button; Apex makes the chart focusable, and landing there shows a stray focus ring and tooltip.
      initialFocusEl={() => closeRef.current}
      placement={placement}
      size={placement === 'end' ? 'md' : 'full'}
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content
            maxH={placement === 'bottom' ? '88dvh' : undefined}
            roundedTop={placement === 'bottom' ? 'xl' : undefined}
          >
            <Drawer.Header>
              <HStack>
                <Drawer.Title>{series?.station.name}</Drawer.Title>
              </HStack>
            </Drawer.Header>
            <Drawer.Body pb="6">{series && <Body series={series} />}</Drawer.Body>
            <Drawer.CloseTrigger asChild position="absolute" top="3" insetEnd="3">
              <CloseButton ref={closeRef} aria-label="Close station details" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
