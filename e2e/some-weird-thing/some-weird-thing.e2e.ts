import { createTenv, Gateway } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should match the http duration with the request deadline', async () => {
  const gw = await gateway({
    subgraph: {
      with: 'mesh',
      subgraphName: 'hello',
      services: [await service('hello')],
    },
  });

  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const err: ExecutionResult | Error = await gw
      .execute({
        query: '{slowHello}',
      })
      .catch((err) => err);
    const end = Date.now() - start;
    if ('message' in err) {
      // `requestDeadline`
      expect(err.message).toContain(
        'ResponseError: Status is not 200, got status 503 Service Unavailable',
      );
    } else {
      // gateway `upstreamTimeout` or mesh `timeout`
      expect(err.errors?.[0]?.message).toContain(
        'The operation was aborted due to timeout',
      );
    }
    // 600ms is the request deadline + some leeway
    expect(end).toBeLessThan(600);
  }

  // wait a moment for metrics to flush (even though theoretically unnecessary)
  await new Promise((resolve) => setTimeout(resolve, 100));

  const histogram = await getHistogram(gw, 'graphql_yoga_http_duration');

  // 0.6s is the request deadline + some leeway
  expect(histogram.avg).toBeLessThan(0.6);
});

async function getHistogram(
  gw: Gateway,
  metricName: string,
): Promise<{
  buckets: { name: string; rawLabels: string; value: number }[];
  sum: number;
  count: number;
  avg: number;
}> {
  const res = await fetch(`http://localhost:${gw.port}/metrics`);
  const raw = await res.text();
  const lines = raw.split('\n');

  const parseLine = (line: string, prefix: string) => {
    const lastSpace = line.lastIndexOf(' ');
    const rawLabels = line.slice(prefix.length, lastSpace).trim();
    const value = parseFloat(line.slice(lastSpace + 1));
    return { name: prefix, rawLabels, value };
  };

  const buckets = lines
    .filter((l) => l.startsWith(metricName + '_bucket'))
    .map((l) => parseLine(l, metricName + '_bucket'));

  const sumLine = lines.find((l) => l.startsWith(metricName + '_sum'));
  const countLine = lines.find((l) => l.startsWith(metricName + '_count'));

  const sum = sumLine ? parseFloat(sumLine.split(' ').at(-1)!) : 0;
  const count = countLine ? parseFloat(countLine.split(' ').at(-1)!) : 0;

  return { buckets, sum, count, avg: count > 0 ? sum / count : 0 };
}
