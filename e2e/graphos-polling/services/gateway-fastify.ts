import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { createLoggerFromPino } from '@graphql-hive/logger-pino';
import {
  createOtlpHttpExporter,
  useOpenTelemetry,
} from '@graphql-mesh/plugin-opentelemetry';
import { boolEnv, Opts } from '@internal/testing';
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

/* --- E2E TEST SPECIFIC CONFIGURATION START---  */

const uplinkHost = String(process.env['E2E_GATEWAY_RUNNER']).includes('docker')
  ? boolEnv('CI')
    ? '172.17.0.1'
    : 'host.docker.internal'
  : '0.0.0.0';

const opts = Opts(process.argv);

const upLink = `http://${uplinkHost}:${opts.getServicePort('graphos')}`;

const port = opts.getServicePort('gateway-fastify');

/*---  E2E TEST SPECIFIC CONFIGURATION END---  */

const requestIdHeader = 'x-guild-request-id';

const app = fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: !process.env['CI'],
      },
    },
  },
  requestIdHeader,
  // Align with Hive Gateway's request id log label
  requestIdLogLabel: 'requestId',
  // Check the header first, then generate a new one if not found
  genReqId: (req) =>
    req.headers[requestIdHeader]?.toString() || crypto.randomUUID(),
});

export interface FastifyContext {
  req: FastifyRequest;
  reply: FastifyReply;
}

const gw = createGatewayRuntime<FastifyContext>({
  // Integrate Fastify's logger / Pino with the gateway logger
  logging: createLoggerFromPino(app.log),
  // Align with Fastify
  requestId: {
    // Use the same header name as Fastify
    headerName: requestIdHeader,
    // Use the request id from Fastify
    generateRequestId: ({ context }) => context.req.id,
  },
  // GraphOS configuration
  supergraph: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    upLink: `${upLink}/graphql`,
  },
  // Fetch the schema from the uplink every 10 seconds
  pollingInterval: 10_000,
  // Report usage to GraphOS
  reporting: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    endpoint: `${upLink}/usage`,
  },
  // Use OpenTelemetry to report traces
  plugins: (ctx) => [
    useOpenTelemetry({
      ...ctx,
      exporters: [
        createOtlpHttpExporter(
          {
            url: process.env['OTLP_EXPORTER_URL'],
          },
          {
            scheduledDelayMillis: 1,
          },
        ),
      ],
    }),
  ],
});

app.route({
  method: ['GET', 'POST', 'OPTIONS'],
  // "*" is recommendeded in order to handle landing page, readiness and other related endpoints
  url: '*',
  // Connect the gateway to Fastify route
  handler: (req, reply) =>
    gw.handleNodeRequestAndResponse(req, reply, { req, reply }),
});

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Gateway listening on port ${port}`);
});
