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
      plugins: {
        legend: {
          labels: {
            // hide legend labels that have no text
            filter: ({ text }) => !!text,
          },
        },
      },
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
          label: 'Idle',
          borderColor: 'blue',
          data: [],
        },
        {
          label: 'Loadtest',
          borderColor: 'red',
          data: [],
        },
        {
          label: 'Calmdown',
          borderColor: 'orange',
          data: [],
        },
        {
          pointStyle: false,
          cubicInterpolationMode: 'monotone',
          data: samples.map(({ mem }) => mem),
          // @ts-expect-error plugin is provided but the options are not typed
          trendlineLinear: {
            colorMin: 'black',
            colorMax: 'black',
            width: 1,
            lineStyle: 'dashed',
            label: {
              color: 'black',
              text: 'Memory trend',
              displayValue: false,
            },
          },
          segment: {
            // color the diffrent phase segments
            borderColor: (ctx) => {
              // already if the second point is in the phase,
              // we want to color from the first point
              const p1 = samples[ctx.p1DataIndex];
              switch (p1?.phase) {
                case 'idle':
                  return 'blue';
                case 'loadtest':
                  return 'red';
                case 'calmdown':
                  return 'orange';
                default:
                  throw new Error(`Unexpected phase ${p1?.phase}`);
              }
            },
          },
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
