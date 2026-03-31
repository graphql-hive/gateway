import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { expect, it } from 'vitest';

it('Reproduction GW-584', async () => {
  await using gw = createGatewayTester({
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              entity(id: Int): Entity
            }
            type Entity @key(fields: "id") {
              id: ID
              historicalData(
                input: HistoricalDataRequest
              ): HistoricalDataContainer
            }

            input HistoricalDataRequest {
              traces: [String]
              startTime: Int
              endTime: Int
              resolution: HistoricalDataResolution
            }

            enum HistoricalDataResolution {
              HOURLY
              FIFTEEN_MIN
            }

            type HistoricalDataContainer {
              data: [HistoricalData]
            }

            type HistoricalData {
              trace: String
              times: [Int]
            }
          `,
          resolvers: {
            Query: {
              entity(_, { id }) {
                return { id };
              },
            },
            Entity: {
              historicalData(_, { input }) {
                const times = [];
                for (
                  let time = input.startTime;
                  time <= input.endTime;
                  time += 100
                ) {
                  times.push(time);
                }
                return {
                  data: [
                    {
                      trace: input.traces[0],
                      times,
                    },
                  ],
                };
              },
            },
          },
        },
      },
    ],
  });
  const query = /* GraphQL */ `
    query historicalData($entityId: Int!, $input: HistoricalDataRequest!) {
      entity(id: $entityId) {
        id
        historicalData(input: $input) {
          data {
            trace
            times
          }
        }
      }
    }
  `;
  const variables1 = {
    entityId: 200,
    input: {
      traces: ['metric/trace_a', 'metric/trace_b', 'metric/trace_c'],
      startTime: 1000,
      endTime: 1400,
      resolution: 'HOURLY',
    },
  };
  const variables2 = {
    entityId: 200,
    input: {
      traces: ['metric/trace_a', 'metric/trace_b', 'metric/trace_c'],
      startTime: 800,
      endTime: 1400,
      resolution: 'FIFTEEN_MIN',
    },
  };
  const responses = await Promise.all([
    gw.execute({ query, variables: variables1 }),
    gw.execute({ query, variables: variables2 }),
  ]);
  expect(responses).toEqual([
    {
      data: {
        entity: {
          id: '200',
          historicalData: {
            data: [
              {
                trace: 'metric/trace_a',
                times: [1000, 1100, 1200, 1300, 1400],
              },
            ],
          },
        },
      },
    },
    {
      data: {
        entity: {
          id: '200',
          historicalData: {
            data: [
              {
                trace: 'metric/trace_a',
                times: [800, 900, 1000, 1100, 1200, 1300, 1400],
              },
            ],
          },
        },
      },
    },
  ]);
});
