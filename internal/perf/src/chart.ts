import { Canvas, createCanvas } from 'canvas';
import { Chart, ChartConfiguration, ChartData } from 'chart.js/auto';
import chartTrendline from // @ts-expect-error no type definitions
'chartjs-plugin-trendline';
import { LoadtestMemorySample } from './loadtest';

export interface LineChartOptions {
  /** The tick label callbacks of the Y scale entries. */
  yTicksCallback?: (tickValue: number | string) => string;
}

export function createLineChart(
  data: ChartData<'line'>,
  options: LineChartOptions = {},
): Canvas {
  const canvas = createCanvas(1366, 768, 'svg');

  const chartConfig: ChartConfiguration = {
    type: 'line',
    data,
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

export async function createMemorySampleLineChart(
  samples: LoadtestMemorySample[],
) {
  const chart = createLineChart(
    {
      labels: samples.map(({ time }) => toTimeString(time)),
      datasets: [
        {
          label: 'Memory',
          borderColor: 'blue',
          data: samples.map(({ mem }) => mem),
        },
      ],
    },
    {
      yTicksCallback: (tickValue) => `${tickValue} MB`,
    },
  );
  return chart;
}

function toTimeString(date: Date) {
  let hours = date.getUTCHours().toString();
  if (hours.length === 1) {
    hours = `0${hours}`;
  }

  let minutes = date.getUTCMinutes().toString();
  if (minutes.length === 1) {
    minutes = `0${minutes}`;
  }

  let seconds = date.getUTCSeconds().toString();
  if (seconds.length === 1) {
    seconds = `0${seconds}`;
  }

  return `${hours}:${minutes}:${seconds}`;
}
