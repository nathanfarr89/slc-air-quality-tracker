import type { ReactNode } from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

interface Props {
  title: string;
  description?: string;
  /** Accessible summary of the chart (screen readers get this instead of the SVG/canvas). */
  label: string;
  children: ReactNode;
  /** Data table fallback, rendered below the chart. */
  table?: ReactNode;
  minH?: string | number;
}

export function ChartCard({ title, description, label, children, table, minH }: Props) {
  return (
    <Box
      as="section"
      bg="bg.panel"
      borderWidth="1px"
      rounded="lg"
      p={{ base: 3, md: 5 }}
      aria-label={title}
    >
      <Heading as="h2" size="md">
        {title}
      </Heading>
      {description && (
        <Text color="fg.muted" fontSize="sm" mt="1">
          {description}
        </Text>
      )}
      <Box role="img" aria-label={label} mt="3" minH={minH}>
        {children}
      </Box>
      {table}
    </Box>
  );
}
