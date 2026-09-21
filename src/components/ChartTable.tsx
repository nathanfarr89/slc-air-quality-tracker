import { Box, Table } from '@chakra-ui/react';

interface Props {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

/** Collapsible, keyboard-reachable data table: the accessible twin of every chart. */
export function ChartTable({ caption, columns, rows }: Props) {
  return (
    <Box as="details" mt="3" fontSize="sm">
      <Box
        as="summary"
        cursor="pointer"
        color="brand.solid"
        fontWeight="medium"
        w="fit-content"
        rounded="sm"
      >
        View data table
      </Box>
      <Box
        mt="2"
        maxH="18rem"
        overflow="auto"
        tabIndex={0}
        role="region"
        aria-label={`${caption} (scrollable)`}
      >
        <Table.Root size="sm" stickyHeader>
          <Table.Caption srOnly>{caption}</Table.Caption>
          <Table.Header>
            <Table.Row>
              {columns.map((c) => (
                <Table.ColumnHeader key={c} scope="col">
                  {c}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row, i) => (
              <Table.Row key={i}>
                {row.map((cell, j) => (
                  <Table.Cell key={j}>{cell}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
}
