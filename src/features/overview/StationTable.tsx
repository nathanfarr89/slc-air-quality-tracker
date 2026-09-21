import { Button, Table } from '@chakra-ui/react';
import { pm25ToAqi } from '../../api';
import { AqiBadge } from '../../components/AqiGlyph';
import type { StationNow } from '../../lib/derive';
import { formatMtDateTime, round1 } from '../../lib/format';

interface Props {
  stations: StationNow[];
  onSelect: (id: string, trigger: HTMLElement) => void;
}

/** Text alternative to the map; also the primary view when no Mapbox token is set. */
export function StationTable({ stations, onSelect }: Props) {
  return (
    <Table.ScrollArea borderWidth="1px" rounded="lg" bg="bg.panel">
      <Table.Root size="sm">
        <Table.Caption srOnly>Current PM2.5 by station</Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Station</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">PM2.5 (µg/m³)</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">AQI</Table.ColumnHeader>
            <Table.ColumnHeader>Category</Table.ColumnHeader>
            <Table.ColumnHeader>Updated</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {stations.map(({ station, reading }) => (
            <Table.Row key={station.id}>
              <Table.Cell>
                <Button
                  variant="plain"
                  size="sm"
                  px="0"
                  onClick={(e) => onSelect(station.id, e.currentTarget)}
                  aria-label={`Open details for ${station.name}`}
                >
                  {station.name}
                </Button>
              </Table.Cell>
              <Table.Cell textAlign="end">{round1(reading.pm25)}</Table.Cell>
              <Table.Cell textAlign="end">{pm25ToAqi(reading.pm25)}</Table.Cell>
              <Table.Cell>
                <AqiBadge pm25={reading.pm25} showAqi={false} />
              </Table.Cell>
              <Table.Cell>{formatMtDateTime(Date.parse(reading.t))}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
