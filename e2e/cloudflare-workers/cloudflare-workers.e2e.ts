import {
  createTenv,
  createTjaeger,
  getAvailablePort,
  waitForPort,
} from '@internal/e2e';
import { isDebug } from '@internal/testing';
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
    const [proc] = await spawn('yarn wrangler', {
      pipeLogs: true, // TODO: remove
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
    const signal = AbortSignal.timeout(3_000);
    await waitForPort(port, signal);
    return {
      proc,
      url: `http://0.0.0.0:${port}`,
      async execute({
        query,
        headers,
      }: {
        query: string;
        headers?: HeadersInit;
      }): Promise<ExecutionResult> {
        const r = await fetch(`http://0.0.0.0:${port}/graphql`, {
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
    const { execute, proc } = await wrangler(env);
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
    await proc[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

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
    const { url, proc } = await wrangler(env);
    await fetch(`${url}/non-existing`);
    await proc[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

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
    const { url, execute, proc } = await wrangler(env);
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
    await proc[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

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
