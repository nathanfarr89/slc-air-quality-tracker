import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-cartesian-dist-min';
import type { Config, Layout } from 'plotly.js';
import type { ChartColors } from '../../theme/useChartColors';

// Only the cartesian bundle (scatter, box, heatmap): far smaller than full plotly.js.
export const Plot = createPlotlyComponent(Plotly as never);

export const plotConfig: Partial<Config> = { displaylogo: false, responsive: true };

/** Layout defaults driven by theme tokens, so charts follow light/dark mode. */
export function baseLayout(colors: ChartColors): Partial<Layout> {
  const axis = { gridcolor: colors.grid, linecolor: colors.grid, zerolinecolor: colors.grid };
  return {
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: colors.text, family: 'inherit', size: 12 },
    margin: { t: 16, r: 16, b: 48, l: 56 },
    hoverlabel: { bgcolor: colors.panel, bordercolor: colors.border, font: { color: colors.text } },
    xaxis: axis,
    yaxis: axis,
    legend: { orientation: 'h', y: -0.25 },
  };
}
