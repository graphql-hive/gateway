import os from 'os';
import { createTenv, getAvailablePort, type Container } from '@internal/e2e';
import { getLocalhost, isDebug } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';

const { spawn, container, gatewayRunner } = createTenv(__dirname);

describe.skipIf(gatewayRunner !== 'node' || process.version.startsWith('v1'))(
  'Cloudflare Workers',
  () => {
    let jaeger: Container;
    let jaegerHostname: string;

    const TEST_QUERY = /* GraphQL */ `
      query TestQuery {
        language(code: "en") {
          name
        }
      }
    `;

    beforeAll(async () => {
      jaeger = await container({
        name: 'jaeger',
        image:
          os.platform().toLowerCase() === 'win32'
            ? 'johnnyhuy/jaeger-windows:1809'
            : 'jaegertracing/all-in-one:1.56',
        env: {
          COLLECTOR_OTLP_ENABLED: 'true',
        },
        containerPort: 4318,
        additionalContainerPorts: [16686],
        healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:14269'],
      });
      try {
        jaegerHostname = await getLocalhost(jaeger.port);
      } catch {
        throw new Error(`Jaeger unavailable\n${jaeger.getStd('both')}`);
      }
    });

    type JaegerTracesApiResponse = {
      data: Array<{
        traceID: string;
        spans: JaegerTraceSpan[];
      }>;
    };

    type JaegerTraceSpan = {
      traceID: string;
      spanID: string;
      operationName: string;
      tags: Array<{ key: string; value: string; type: string }>;
      references: Array<{ refType: string; spanID: string; traceID: string }>;
    };

    async function getJaegerTraces(
      service: string,
      expectedDataLength: number,
      path = '/graphql',
    ): Promise<JaegerTracesApiResponse> {
      const url = `http://0.0.0.0:${jaeger.additionalPorts[16686]}/api/traces?service=${service}`;

      let res!: JaegerTracesApiResponse;
      const signal = AbortSignal.timeout(2_000);
      while (!signal.aborted) {
        try {
          res = await fetch(url).then((r) => r.json());
          if (
            res.data.length >= expectedDataLength &&
            res.data.some((trace) =>
              trace.spans.some((span) => span.operationName === 'POST ' + path),
            )
          ) {
            return res;
          }
        } catch {}
      }
      return res;
    }

    async function wrangler(env: {
      OTLP_EXPORTER_URL: string;
      OTEL_SERVICE_NAME: string;
    }) {
      const port = await getAvailablePort();
      const [proc] = await spawn([
        'yarn',
        'wrangler',
        'dev',
        '--port',
        port.toString(),
        '--var',
        'OTLP_EXPORTER_URL:' + env.OTLP_EXPORTER_URL,
        '--var',
        'OTEL_SERVICE_NAME:' + env.OTEL_SERVICE_NAME,
        '--var',
        'OTEL_LOG_LEVEL:debug',
        ...(isDebug() ? ['--var', 'DEBUG:1'] : []),
      ]);
      let hostname: string;
      try {
        hostname = await getLocalhost(port);
      } catch {
        throw new Error(`Wrangler unavailable\n${proc.getStd('both')}`);
      }
      return {
        url: `${hostname}:${port}`,
        async execute({
          query,
          headers,
        }: {
          query: string;
          headers?: HeadersInit;
        }): Promise<ExecutionResult> {
          const r = await fetch(`${hostname}:${port}/graphql`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({ query }),
          });
          if (r.headers.get('content-type')?.includes('json')) {
            return r.json();
          }
          throw new Error(await r.text());
        },
      };
    }

    it('should report telemetry metrics correctly to jaeger', async () => {
      const serviceName = 'mesh-e2e-test-1';
      const { execute } = await wrangler({
        OTLP_EXPORTER_URL: `${jaegerHostname}:${jaeger.port}/v1/traces`,
        OTEL_SERVICE_NAME: serviceName,
      });

      await expect(execute({ query: TEST_QUERY })).resolves
        .toMatchInlineSnapshot(`
      {
        "data": {
          "language": {
            "name": "English",
          },
        },
      }
    `);

      const traces = await getJaegerTraces(serviceName, 2);
      expect(traces.data.length).toBe(2);
      const relevantTraces = traces.data.filter((trace) =>
        trace.spans.some((span) => span.operationName === 'POST /graphql'),
      );
      expect(relevantTraces.length).toBe(1);
      const relevantTrace = relevantTraces[0];
      expect(relevantTrace).toBeDefined();
      expect(relevantTrace?.spans.length).toBe(8);

      expect(relevantTrace?.spans).toContainEqual(
        expect.objectContaining({ operationName: 'POST /graphql' }),
      );
      expect(relevantTrace?.spans).toContainEqual(
        expect.objectContaining({ operationName: 'graphql.parse' }),
      );
      expect(relevantTrace?.spans).toContainEqual(
        expect.objectContaining({ operationName: 'graphql.validate' }),
      );
      expect(relevantTrace?.spans).toContainEqual(
        expect.objectContaining({ operationName: 'graphql.execute' }),
      );
      expect(
        relevantTrace?.spans.filter((r) =>
          r.operationName.includes('subgraph.execute'),
        ).length,
      ).toBe(1);
    });

    it('should report http failures', async () => {
      const serviceName = 'mesh-e2e-test-4';
      const { url } = await wrangler({
        OTLP_EXPORTER_URL: `${jaegerHostname}:${jaeger.port}/v1/traces`,
        OTEL_SERVICE_NAME: serviceName,
      });

      await fetch(`${url}/non-existing`).catch(() => {});
      const traces = await getJaegerTraces(serviceName, 2, '/non-existing');
      expect(traces.data.length).toBe(2);
      const relevantTrace = traces.data.find((trace) =>
        trace.spans.some((span) => span.operationName === 'GET /non-existing'),
      );
      expect(relevantTrace).toBeDefined();
      expect(relevantTrace?.spans.length).toBe(1);

      expect(relevantTrace?.spans).toContainEqual(
        expect.objectContaining({
          operationName: 'GET /non-existing',
          tags: expect.arrayContaining([
            expect.objectContaining({
              key: 'otel.status_code',
              value: 'ERROR',
            }),
            expect.objectContaining({
              key: 'error',
              value: true,
            }),
            expect.objectContaining({
              key: 'http.status_code',
              value: 404,
            }),
          ]),
        }),
      );
    });

    it('context propagation should work correctly', async () => {
      const traceId = '0af7651916cd43dd8448eb211c80319c';
      const serviceName = 'mesh-e2e-test-5';
      const { url, execute } = await wrangler({
        OTLP_EXPORTER_URL: `${jaegerHostname}:${jaeger.port}/v1/traces`,
        OTEL_SERVICE_NAME: serviceName,
      });

      await expect(
        execute({
          query: TEST_QUERY,
          headers: {
            traceparent: `00-${traceId}-b7ad6b7169203331-01`,
          },
        }),
      ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "language": {
                "name": "English",
              },
            },
          }
        `);

      const upstreamHttpCalls = await fetch(`${url}/upstream-fetch`).then(
        (r) =>
          r.json() as unknown as Array<{
            url: string;
            headers?: Record<string, string>;
          }>,
      );

      const traces = await getJaegerTraces(serviceName, 3);
      expect(traces.data.length).toBe(3);

      const relevantTraces = traces.data.filter((trace) =>
        trace.spans.some((span) => span.operationName === 'POST /graphql'),
      );
      expect(relevantTraces.length).toBe(1);
      const relevantTrace = relevantTraces[0]!;
      expect(relevantTrace).toBeDefined();

      // Check for extraction of the otel context
      expect(relevantTrace.traceID).toBe(traceId);
      for (const span of relevantTrace.spans) {
        expect(span.traceID).toBe(traceId);
      }

      expect(upstreamHttpCalls.length).toBe(2);

      for (const call of upstreamHttpCalls) {
        if (call.headers?.['x-request-id']) {
          const transparentHeader = (call.headers || {})['traceparent'];
          expect(transparentHeader).toBeDefined();
          expect(transparentHeader?.length).toBeGreaterThan(1);
          expect(transparentHeader).toContain(traceId);
        }
      }
    });
  },
);
