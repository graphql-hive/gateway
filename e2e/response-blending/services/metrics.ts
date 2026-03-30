import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);
const servicePort = opts.getServicePort('metrics');

let REQUEST_COUNTER = 0;

interface ThingParent {
  readonly id: number;
}

interface MetricsRequest {
  readonly input: {
    readonly traces: string[];
    readonly startTime: number;
    readonly endTime: number;
  };
}

function getInclusiveTimeStampsInRange(startTime: number, endTime: number) {
  const arr = [100, 150, 200, 250, 300, 350, 400];
  const startIdx = arr.indexOf(startTime);
  const endIdx = arr.indexOf(endTime);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Unexpected time range');
  }

  return arr.slice(startIdx, endIdx + 1);
}

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend type Thing @key(fields: "id") {
          id: Int! @external
          metrics(input: MetricsRequest!): MetricsResponse!
        }

        input MetricsRequest {
          traces: [String!]!
          startTime: Int!
          endTime: Int!
        }

        type MetricsResponse {
          data: [MetricsData!]!
        }

        type MetricsData {
          trace: String!
          timeStamps: [Int!]!
        }
      `),
      resolvers: {
        Thing: {
          metrics: async (
            _parent: ThingParent,
            { input: { traces, startTime, endTime } }: MetricsRequest,
          ) => {
            const requestId = ++REQUEST_COUNTER;

            const timeStamps = getInclusiveTimeStampsInRange(
              startTime,
              endTime,
            );

            console.log(
              `\n[REQ #${requestId}] Timestamps for range (${startTime} - ${endTime}):`,
              timeStamps,
            );

            const response = traces.map((trace) => {
              return {
                trace,
                timeStamps,
              };
            });

            return {
              data: response,
            };
          },
        },
      },
    }),
  }),
).listen(servicePort, () => {
  console.log(
    `Metrics service is running at http://localhost:${servicePort}/graphql`,
  );
});
