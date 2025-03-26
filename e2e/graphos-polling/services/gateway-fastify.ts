import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { createLoggerFromPino } from '@graphql-hive/logger-pino';
import {
  createOtlpHttpExporter,
  useOpenTelemetry,
} from '@graphql-mesh/plugin-opentelemetry';
import { boolEnv, Opts } from '@internal/testing';
import fastify, { FastifyReply, FastifyRequest } from 'fastify';

const uplinkHost = String(process.env['E2E_GATEWAY_RUNNER']).includes('docker')
  ? boolEnv('CI')
    ? '172.17.0.1'
    : 'host.docker.internal'
  : '0.0.0.0';

const opts = Opts(process.argv);

const upLink = `http://${uplinkHost}:${opts.getServicePort('graphos')}`;

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
  genReqId(req) {
    if (req.headers[requestIdHeader]) {
      return req.headers[requestIdHeader].toString();
    }
    return crypto.randomUUID();
  },
});

export interface FastifyContext {
  req: FastifyRequest;
  reply: FastifyReply;
}

const gw = createGatewayRuntime<FastifyContext>({
  logging: createLoggerFromPino(app.log),
  supergraph: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    upLink: `${upLink}/graphql`,
  },
  reporting: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    endpoint: `${upLink}/usage`,
  },
  pollingInterval: 10_000,
  requestId: {
    headerName: requestIdHeader,
    generateRequestId({ context }) {
      return context.req.id;
    },
  },
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
  url: '*',
  handler: (req, reply) =>
    gw.handleNodeRequestAndResponse(req, reply, { req, reply }),
});

const port = opts.getServicePort('gateway-fastify');

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Gateway listening on port ${port}`);
});
