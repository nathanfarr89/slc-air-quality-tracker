import { Box, Checkbox, Stack, Text } from '@chakra-ui/react';
import { AQI_CATEGORIES } from '../../api';
import { AqiGlyph } from '../../components/AqiGlyph';

interface Props {
  showHeat: boolean;
  showSensors: boolean;
  onHeat: (on: boolean) => void;
  onSensors: (on: boolean) => void;
  sensorCount: number;
}

const overlay = {
  position: 'absolute' as const,
  zIndex: 1,
  bg: 'bg.panel',
  borderWidth: '1px',
  rounded: 'md',
  p: '2',
  fontSize: 'xs',
  boxShadow: 'sm',
};

/** Layer toggles (top-left) and category legend (bottom-left) laid over the map. */
export function MapControls({ showHeat, showSensors, onHeat, onSensors, sensorCount }: Props) {
  return (
    <>
      <Box as="fieldset" {...overlay} top="2" left="2" m="0" minW="0">
        <Text as="legend" fontWeight="semibold" mb="1" px="0">
          Map layers
        </Text>
        <Stack gap="1" align="start">
          <Checkbox.Root
            size="sm"
            checked={showSensors}
            onCheckedChange={(e) => onSensors(e.checked === true)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Sensors ({sensorCount})</Checkbox.Label>
          </Checkbox.Root>
          <Checkbox.Root
            size="sm"
            checked={showHeat}
            onCheckedChange={(e) => onHeat(e.checked === true)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>PM2.5 heat</Checkbox.Label>
          </Checkbox.Root>
        </Stack>
      </Box>
      <Box
        {...overlay}
        bottom="6"
        left="2"
        display={{ base: 'none', sm: 'block' }}
        aria-label="AQI legend"
        role="group"
      >
        {AQI_CATEGORIES.map((c) => (
          <Box key={c.key} display="flex" alignItems="center" gap="1.5" py="0.5">
            <AqiGlyph category={c} size={14} />
            <span>{c.label}</span>
          </Box>
        ))}
      </Box>
    </>
  );
}
