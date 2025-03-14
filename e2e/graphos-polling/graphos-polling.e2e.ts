import { createTenv, dockerHostName } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { afterAll, expect, it } from 'vitest';

const { service, gateway, composeWithApollo, gatewayRunner } =
  createTenv(__dirname);

let interval: ReturnType<typeof setInterval> | undefined;

afterAll(() => {
  if (interval) {
    clearInterval(interval);
  }
});

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
  const gw = await gateway({
    args: [
      'supergraph',
      `mygraphref@myvariant`,
      `--apollo-key=mykey`,
      `--apollo-uplink=${hostname}:${graphos.port}/graphql`,
    ],
    services: [graphos],
  });
  interval = setInterval(() => {
    gw.execute({
      query: /* GraphQL */ `
        {
          __typename
        }
      `,
    });
  }, 100);
  const result$ = gw.execute({
    query: /* GraphQL */ `
      query Foo {
        foo
      }
    `,
  });
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
