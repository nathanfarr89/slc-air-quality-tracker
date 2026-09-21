import { Box, HStack, Text } from '@chakra-ui/react';
import { getAqiCategory, pm25ToAqi, type AqiCategory, type AqiShape } from '../api';
import { colorVar } from '../theme/system';

const POINTS: Record<Exclude<AqiShape, 'circle' | 'square'>, string> = {
  diamond: '12,1.5 22.5,12 12,22.5 1.5,12',
  triangle: '12,2 23,21.5 1,21.5',
  pentagon: '12,1.5 22.5,9.2 18.5,22 5.5,22 1.5,9.2',
  octagon: '7.7,1.5 16.3,1.5 22.5,7.7 22.5,16.3 16.3,22.5 7.7,22.5 1.5,16.3 1.5,7.7',
};

interface GlyphProps {
  category: AqiCategory;
  size?: number;
  /** Text drawn inside the shape (e.g. the AQI number). */
  value?: number;
}

/** Category shape filled with the theme's AQI color; the shape is the non-color cue. */
export function AqiGlyph({ category, size = 20, value }: GlyphProps) {
  const style = { fill: colorVar(`aqi.${category.key}`), stroke: colorVar('fg'), strokeWidth: 1.5 };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {category.shape === 'circle' && <circle cx="12" cy="12" r="10.5" style={style} />}
      {category.shape === 'square' && (
        <rect x="2" y="2" width="20" height="20" rx="2" style={style} />
      )}
      {category.shape in POINTS && (
        <polygon
          points={POINTS[category.shape as keyof typeof POINTS]}
          style={style}
          strokeLinejoin="round"
        />
      )}
      {value !== undefined && (
        <text
          x="12"
          y={category.shape === 'triangle' ? 17 : 12.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={value > 99 ? 8.5 : 10}
          fontWeight="700"
          style={{ fill: colorVar(`aqiText.${category.key}`) }}
        >
          {value}
        </text>
      )}
    </svg>
  );
}

/** Glyph + label + optional numbers: never relies on color alone. */
export function AqiBadge({ pm25, showAqi = true }: { pm25: number; showAqi?: boolean }) {
  const category = getAqiCategory(pm25);
  return (
    <HStack gap="2" display="inline-flex">
      <AqiGlyph category={category} />
      <Text as="span" fontWeight="medium">
        {category.label}
        {showAqi && (
          <Box as="span" color="fg.muted" fontWeight="normal">
            {' '}
            · AQI {pm25ToAqi(pm25)}
          </Box>
        )}
      </Text>
    </HStack>
  );
}
