import { createTenv } from '@internal/e2e';
import {
  buildClientSchema,
  getIntrospectionQuery,
  IntrospectionQuery,
  printSchema,
} from 'graphql';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it.each([
  ['without pathname', ''],
  ['with pathname', '/schema'],
  ['with pathname and extension', '/schema.graphql'],
])('should gateway a schema from a url %s', async (_, pathname) => {
  const cdn = await service('cdn');

  const { execute } = await gateway({
    supergraph: `http://0.0.0.0:${cdn.port}${pathname}`,
  });

  const result = await execute({ query: getIntrospectionQuery() });
  // print the schema instead of the introspection result because built-in
  // directives and introspection types differ between graphql versions
  expect(printSchema(buildClientSchema(result.data as IntrospectionQuery)))
    .toMatchInlineSnapshot(`
    "type Query {
      hello: String!
    }"
  `);
});

it('should set the default polling interval to 10 seconds', async () => {
  const cdn = await service('cdn');

  const { execute, getStd } = await gateway({
    supergraph: `http://0.0.0.0:${cdn.port}`,
    env: {
      DEBUG: 1,
    },
  });

  await expect(execute({ query: `{ __typename }` })).resolves.toEqual({
    data: {
      __typename: 'Query',
    },
  });

  const logs = getStd('both');

  expect(logs).toContain(
    'Starting polling to Supergraph with interval 10 seconds',
  );
});
