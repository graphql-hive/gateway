import { createGatewayRuntime, Logger } from '@graphql-hive/gateway-runtime';
import { PinoLogWriter } from '@graphql-hive/logger/writers/pino';
import { useOpenTelemetry } from '@graphql-hive/plugin-opentelemetry';
import { openTelemetrySetup } from '@graphql-hive/plugin-opentelemetry/setup';
import { Opts } from '@internal/testing';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

/* --- E2E TEST SPECIFIC CONFIGURATION START---  */

const opts = Opts(process.argv);

const upLink = `http://0.0.0.0:${opts.getServicePort('graphos')}`;

const port = opts.getServicePort('gateway-fastify');

/*---  E2E TEST SPECIFIC CONFIGURATION END---  */

openTelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  traces: {
    exporter: new OTLPTraceExporter({ url: process.env['OTLP_EXPORTER_URL'] }),
    // Do not batch for test
    batching: false,
  },
});

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
  genReqId: (req): string =>
    req.headers[requestIdHeader]?.toString() || gw.fetchAPI.crypto.randomUUID(),
});

export interface FastifyContext {
  req: FastifyRequest;
  reply: FastifyReply;
}

const gw = createGatewayRuntime<FastifyContext>({
  logging: new Logger({ writers: [new PinoLogWriter(app.log)] }),
  // Align with Fastify
  requestId: {
    // Use the same header name as Fastify
    headerName: requestIdHeader,
    // Use the request id from Fastify
    generateRequestId: ({ context }) => context.req!.id,
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
      traces: true,
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
