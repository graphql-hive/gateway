import { createTenv } from '@internal/e2e';
import { getIntrospectionQuery } from 'graphql';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should gateway a schema from a url without pathname', async () => {
  const cdn = await service('cdn');

  const { execute } = await gateway({
    supergraph: `http://0.0.0.0:${cdn.port}`,
  });

  await expect(
    execute({ query: getIntrospectionQuery() }),
  ).resolves.toMatchSnapshot();
});

it('should gateway a schema from a url with pathname', async () => {
  const cdn = await service('cdn');

  const { execute } = await gateway({
    supergraph: `http://0.0.0.0:${cdn.port}/schema`,
  });

  await expect(
    execute({ query: getIntrospectionQuery() }),
  ).resolves.toMatchSnapshot();
});

it('should gateway a schema from a url with pathname and extension', async () => {
  const cdn = await service('cdn');

  const { execute } = await gateway({
    supergraph: `http://0.0.0.0:${cdn.port}/schema.graphql`,
  });

  await expect(
    execute({ query: getIntrospectionQuery() }),
  ).resolves.toMatchSnapshot();
});
