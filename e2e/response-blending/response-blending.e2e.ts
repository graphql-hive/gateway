import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const QUERY = /* GraphQL */ `
  query ThingMetrics($thingId: Int!, $input: MetricsRequest!) {
    thing(id: $thingId) {
      id
      metrics(input: $input) {
        data {
          trace
          timeStamps
        }
      }
    }
  }
`;

const { service, gateway } = createTenv(__dirname);

it('test query response blending', async () => {
  const gw = await gateway({
    pipeLogs: true,
    supergraph: {
      with: 'apollo',
      services: [await service('thing'), await service('metrics')],
    },
  });

  const responses = await Promise.all([
    gw.execute({
      query: QUERY,
      variables: {
        thingId: 1,
        input: {
          traces: ['trace-1', 'trace-2', 'trace-3'],
          startTime: 300,
          endTime: 400,
        },
      },
    }),
    gw.execute({
      query: QUERY,
      variables: {
        thingId: 1, // Same top level thing as the first query
        input: {
          traces: ['trace-1', 'trace-2', 'trace-3'],
          startTime: 100, // Different startTime from the first query, which returns a different response from the metrics service
          endTime: 400,
        },
      },
    }),
  ]);

  expect(responses).toEqual([
    {
      data: {
        thing: {
          id: 1,
          metrics: {
            data: [
              {
                trace: 'trace-1',
                timeStamps: [300, 350, 400],
              },
              {
                trace: 'trace-2',
                timeStamps: [300, 350, 400],
              },
              {
                trace: 'trace-3',
                timeStamps: [300, 350, 400],
              },
            ],
          },
        },
      },
    },
    {
      data: {
        thing: {
          id: 1,
          metrics: {
            data: [
              {
                trace: 'trace-1',
                timeStamps: [100, 150, 200, 250, 300, 350, 400],
              },
              {
                trace: 'trace-2',
                timeStamps: [100, 150, 200, 250, 300, 350, 400],
              },
              {
                trace: 'trace-3',
                timeStamps: [100, 150, 200, 250, 300, 350, 400],
              },
            ],
          },
        },
      },
    },
  ]);
});
