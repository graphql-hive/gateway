import { platform } from 'os';
import { Container, createTenv, dockerHostName } from '@internal/e2e';
import { boolEnv, getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { afterAll, beforeAll, expect, it } from 'vitest';

const { service, composeWithApollo, gatewayRunner, container } =
  createTenv(__dirname);

let interval: ReturnType<typeof setInterval> | undefined;

let jaeger: Container;

beforeAll(async () => {
  jaeger = await container({
    name: `jaeger-http`,
    image:
      platform().toLowerCase() === 'win32'
        ? 'johnnyhuy/jaeger-windows:1809'
        : 'jaegertracing/all-in-one:1.56',
    env: {
      COLLECTOR_OTLP_ENABLED: 'true',
    },
    containerPort: 4318,
    additionalContainerPorts: [16686, 4317],
    healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:14269'],
  });
});

afterAll(() => {
  if (interval) {
    clearInterval(interval);
  }
});

const JAEGER_HOSTNAME =
  gatewayRunner === 'docker' || gatewayRunner === 'bun-docker'
    ? boolEnv('CI')
      ? '172.17.0.1'
      : 'host.docker.internal'
    : '0.0.0.0';

/**
 * First supergraph has a subgraph never returns a value,
 * and in the meanwhile the schema reloads then we expect it to retry the request
 * and send the request to the new subgraph that returns a value.
 */
it('refreshes the schema, and retries the request when the schema reloads', async () => {
  const graphos = await service('graphos');
  const upstreamStuck = await service('upstream_stuck');
  const upstreamGood = await service('upstream_good');
  const hostname = gatewayRunner.includes('docker')
    ? `http://${dockerHostName}`
    : await getLocalhost(graphos.port);
  function pushSchema(schema: string) {
    return fetch(`${hostname}:${graphos.port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          mutation SetSupergraphSDL($sdl: String!) {
            setSupergraphSDL(sdl: $sdl)
          }
        `,
        variables: {
          sdl: schema,
        },
      }),
    });
  }
  const compositionWithStuck = await composeWithApollo({
    services: [upstreamStuck],
  });
  await pushSchema(compositionWithStuck.result);
  const gw = await service('gateway-fastify', {
    env: {
      OTLP_EXPORTER_URL: `http://${JAEGER_HOSTNAME}:${jaeger.port}/v1/traces`,
    },
    services: [graphos],
  });
  interval = setInterval(() => {
    fetch(`http://0.0.0.0:${gw.port}/readiness`).then((res) => res.text());
  }, 1_000);

  const result$ = fetch(`http://0.0.0.0:${gw.port}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: /* GraphQL */ `
        query Foo {
          foo
        }
      `,
    }),
  }).then((resp) => resp.json());
  const compositionWithGood = await composeWithApollo({
    services: [upstreamGood],
  });
  await pushSchema(compositionWithGood.result);
  await expect(result$).resolves.toEqual({
    data: {
      foo: 'bar',
    },
  });
  const upstreamStuckStd = upstreamStuck.getStd('both');
  expect(upstreamStuckStd).toContain('foo on upstreamStuck');
  const upstreamGoodStd = upstreamGood.getStd('both');
  expect(upstreamGoodStd).toContain('foo on upstreamGood');
});
