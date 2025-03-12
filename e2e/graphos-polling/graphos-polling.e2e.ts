import { createTenv } from '@internal/e2e';
import { afterAll, expect, it } from 'vitest';

const { service, gateway, composeWithApollo } = createTenv(__dirname);

let interval: ReturnType<typeof setInterval> | undefined;

afterAll(() => {
  if (interval) {
    clearInterval(interval);
  }
});

it('refreshes the schema, and retries the request when the schema reloads', async () => {
  const graphos = await service('graphos');
  const upstreamStuck = await service('upstreamStuck');
  const upstreamGood = await service('upstreamGood');
  function pushSchema(schema: string) {
    return fetch(`http://localhost:${graphos.port}/graphql`, {
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
  const compositionWithStuck = await composeWithApollo([upstreamStuck]);
  await pushSchema(compositionWithStuck.result);
  const gw = await gateway({
    args: [
      'supergraph',
      `--apollo-graph-ref=mygraphref@myvariant`,
      `--apollo-key=mykey`,
      `--apollo-uplink=http://localhost:${graphos.port}/graphql`,
    ],
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
  const compositionWithGood = await composeWithApollo([upstreamGood]);
  await pushSchema(compositionWithGood.result);
  await expect(result$).resolves.toMatchObject({
    data: {
      foo: 'bar',
    },
  });
  const upstreamStuckStd = upstreamStuck.getStd('both');
  expect(upstreamStuckStd).toContain('foo on upstreamStuck');
  const upstreamGoodStd = upstreamGood.getStd('both');
  expect(upstreamGoodStd).toContain('foo on upstreamGood');
});
