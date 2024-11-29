import { createTenv, createTjaeger, getAvailablePort } from '@internal/e2e';
import { getLocalhost, isDebug } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { describe, expect, it } from 'vitest';

const { spawn, gatewayRunner } = createTenv(__dirname);
const jaeger = createTjaeger(__dirname);

describe.skipIf(gatewayRunner !== 'node')('Cloudflare Workers', () => {
  const TEST_QUERY = /* GraphQL */ `
    query TestQuery {
      language(code: "en") {
        name
      }
    }
  `;

  async function wrangler(env: {
    OTLP_EXPORTER_URL: string;
    OTLP_SERVICE_NAME: string;
  }) {
    const port = await getAvailablePort();
    await spawn('yarn wrangler', {
      args: [
        'dev',
        '--port',
        port.toString(),
        '--var',
        'OTLP_EXPORTER_URL:' + env.OTLP_EXPORTER_URL,
        '--var',
        'OTLP_SERVICE_NAME:' + env.OTLP_SERVICE_NAME,
        ...(isDebug() ? ['--var', 'DEBUG:1'] : []),
      ],
    });
    const hostname = await getLocalhost(port);
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
        return r.json();
      },
    };
  }

  it('should report telemetry metrics correctly to jaeger', async () => {
    const { env, getTraces } = await jaeger.start();
    const { execute } = await wrangler(env);

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

    const traces = await getTraces();
    expect(traces.data.length).toBe(2);
    const relevantTraces = traces.data.filter((trace) =>
      trace.spans.some((span) => span.operationName === 'POST /graphql'),
    );
    expect(relevantTraces.length).toBe(1);
    const relevantTrace = relevantTraces[0];
    expect(relevantTrace).toBeDefined();
    expect(relevantTrace?.spans.length).toBe(5);

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
    const { env, getTraces } = await jaeger.start();
    const { url } = await wrangler(env);

    await fetch(`${url}/non-existing`).catch(() => {});
    const traces = await getTraces();
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
    const { env, getTraces } = await jaeger.start();
    const { url, execute } = await wrangler(env);

    const traceId = '0af7651916cd43dd8448eb211c80319c';
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

    const traces = await getTraces();
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
});
