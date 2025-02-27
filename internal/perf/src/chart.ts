import { Canvas, createCanvas } from 'canvas';
import { Chart, ChartConfiguration } from 'chart.js/auto';
import chartTrendline from // @ts-expect-error no type definitions
'chartjs-plugin-trendline';

export interface LineChartDataset {
  /** The label of the line in the line chart. */
  label: string;
  /** The Y data points in the line chart. */
  data: (number | null)[];
  /** The color of the line. */
  color?: string;
  /** Whether the line is dashed. */
  dashed?: boolean;
  /** Whether to show the linear regression trend line. */
  trendline?: boolean;
}

export interface LineChartOptions {
  /**
   * The tick label callbacks of {@link LineChartDataset.data y} entries.
   *
   * TODO: separate the tick callback for each data.
   */
  yTicksCallback?: (tickValue: number | string) => string;
}

export function createLineChart(
  /** The X data points in the line chart, which are the labels. */
  labels: (number | string | null)[],
  datasets: LineChartDataset[],
  options: LineChartOptions = {},
): Canvas {
  const canvas = createCanvas(1366, 768, 'svg');

  const chartConfig: ChartConfiguration = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(({ label, data, color, dashed, trendline }) => ({
        label,
        data,
        borderColor: color,
        borderDash: dashed ? [5, 5] : [],
        ...(trendline
          ? {
              trendlineLinear: {
                width: 1,
                lineStyle: 'dashed',
              },
            }
          : {}),
      })),
    },
    options: {
      responsive: false, // because we're rendering the chart statically
      scales: {
        y: {
          ticks: {
            callback: options.yTicksCallback,
          },
        },
      },
    },
    plugins: [
      chartTrendline,
      {
        id: 'set-white-background',
        beforeDraw: (chart) => {
          chart.ctx.fillStyle = 'white';
          chart.ctx.fillRect(0, 0, chart.width, chart.height);
          chart.ctx.restore();
        },
      },
    ],
  };

  new Chart(
    // @ts-expect-error canvas types are of a different instance, but they fit
    canvas.getContext('2d'),
    chartConfig,
  );

  return canvas;
}
