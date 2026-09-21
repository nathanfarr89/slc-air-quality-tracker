import type { ApexOptions } from 'apexcharts';
import type { ChartColors } from '../theme/useChartColors';
import type { ColorMode } from '../theme/colorMode';

/** Options shared by every Apex chart so they all follow the theme tokens and color mode. */
export function baseApexOptions(colors: ChartColors, mode: ColorMode): ApexOptions {
  return {
    chart: {
      background: 'transparent',
      foreColor: colors.text,
      fontFamily: 'inherit',
      animations: { enabled: false },
      toolbar: { show: false },
    },
    theme: { mode },
    grid: { borderColor: colors.grid },
    tooltip: { theme: mode },
    dataLabels: { enabled: false },
  };
}
