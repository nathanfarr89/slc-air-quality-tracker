import { Badge, Box, Code, Heading, Link, List, Stack, Table, Text } from '@chakra-ui/react';
import { AQI_CATEGORIES, provider } from '../../api';
import { AqiGlyph } from '../../components/AqiGlyph';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box
    as="section"
    aria-label={title}
    bg="bg.panel"
    borderWidth="1px"
    rounded="lg"
    p={{ base: 4, md: 6 }}
  >
    <Heading as="h2" size="md" mb="3">
      {title}
    </Heading>
    <Stack gap="3">{children}</Stack>
  </Box>
);

export default function AboutView() {
  return (
    <Stack gap="4" maxW="4xl">
      <Section title="Data sources">
        <Text>
          Active source: <Badge>{provider.label}</Badge>
        </Text>
        <List.Root ps="5" gap="1">
          <List.Item>
            <Link
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noreferrer"
            >
              Open-Meteo Air Quality API
            </Link>
            : hourly PM2.5 from the CAMS global atmospheric composition model.
          </List.Item>
          <List.Item>
            <Link href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">
              Open-Meteo Weather API
            </Link>{' '}
            (forecast + ERA5 archive): hourly 2 m air temperature.
          </List.Item>
          <List.Item>
            <Link href="https://api.purpleair.com" target="_blank" rel="noreferrer">
              PurpleAir
            </Link>{' '}
            (when <Code>VITE_PURPLEAIR_API_KEY</Code> is set): outdoor community sensors, with the
            EPA PM2.5 correction applied, channels A/B quality-checked, and the median of the
            nearest two sensors per area. Annual history uses daily averages.
          </List.Item>
        </List.Root>
        <Text color="fg.muted" fontSize="sm">
          Set <Code>VITE_USE_MOCK_DATA=true</Code> for offline fixture data with a built-in
          multi-day inversion.
        </Text>
      </Section>

      <Section title="Methodology and limits">
        <List.Root ps="5" gap="1">
          <List.Item>
            Each “station” is a fixed coordinate (Downtown SLC, Bountiful, Sandy, West Valley City,
            Lehi), not a physical monitor. With PurpleAir each is an area served by the nearest
            sensors. With Open-Meteo, values are modeled on a coarse grid, so neighboring stations
            can look alike.
          </List.Item>
          <List.Item>
            Modeled (Open-Meteo) PM2.5 tends to under-read sharp winter inversions compared with
            regulatory monitors and low-cost sensors. Use it for trends, not for health decisions.
          </List.Item>
          <List.Item>
            AQI is computed from PM2.5 with the EPA breakpoints (2024 revision) on the value at each
            hour, not the EPA’s 24-hour NowCast.
          </List.Item>
          <List.Item>
            Daily figures average all stations and hours in a Mountain Time day. Times are shown in
            Mountain Time.
          </List.Item>
          <List.Item>
            The temperature archive lags by about five days, so the most recent days are missing
            from the PM2.5-versus-temperature scatter.
          </List.Item>
        </List.Root>
        <Text>
          For official readings see{' '}
          <Link href="https://air.utah.gov" target="_blank" rel="noreferrer">
            Utah DEQ
          </Link>{' '}
          or{' '}
          <Link href="https://www.airnow.gov" target="_blank" rel="noreferrer">
            AirNow
          </Link>
          .
        </Text>
      </Section>

      <Section title="AQI categories (PM2.5)">
        <Table.ScrollArea>
          <Table.Root size="sm">
            <Table.Caption srOnly>AQI categories with PM2.5 ranges</Table.Caption>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Category</Table.ColumnHeader>
                <Table.ColumnHeader>AQI</Table.ColumnHeader>
                <Table.ColumnHeader>PM2.5 (µg/m³)</Table.ColumnHeader>
                <Table.ColumnHeader>Guidance</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {AQI_CATEGORIES.map((c) => (
                <Table.Row key={c.key}>
                  <Table.Cell>
                    <Box display="inline-flex" alignItems="center" gap="2" whiteSpace="nowrap">
                      <AqiGlyph category={c} size={22} />
                      <b>{c.label}</b>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    {c.aqiMin}–{c.aqiMax}
                  </Table.Cell>
                  <Table.Cell>
                    {c.key === 'hazardous' ? `${c.pmMin}+` : `${c.pmMin}–${c.pmMax}`}
                  </Table.Cell>
                  <Table.Cell>{c.advice}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
        <Text fontSize="sm" color="fg.muted">
          Each category has its own shape as well as its color, so the scale never depends on color
          vision.
        </Text>
      </Section>
    </Stack>
  );
}
