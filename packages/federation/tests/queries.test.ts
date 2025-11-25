import { readFileSync } from 'fs';
import { join } from 'path';
import { execute } from '@graphql-tools/executor';
import { parse, print } from 'graphql';
import { expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

it('should not do a fragment spread on a union', () => {
  const queries: string[] = [];

  const schema = getStitchedSchemaFromSupergraphSdl({
    supergraphSdl: readFileSync(
      join(__dirname, 'fixtures', 'supergraphs', 'c.graphql'),
      'utf8',
    ),
    onSubschemaConfig(subschemaConfig) {
      subschemaConfig.executor = function executor(request) {
        queries.push(print(request.document));
        return {};
      };
    },
  });

  execute({
    schema,
    document: parse(/* GraphQL */ `
      {
        fooBar {
          ... on Foo {
            name
          }
          ... on Bar {
            name
          }
        }
        mustFooBar {
          ... on Foo {
            name
          }
          ... on Bar {
            name
          }
        }
      }
    `),
  });

  expect(queries[0]).toContain(`{
  fooBar {
    __typename
    ... on Foo {
      id
      name
    }
    ... on Bar {
      id
      name
    }
  }
}`);
  expect(queries[1]).toContain(`{
  mustFooBar {
    __typename
    ... on Foo {
      id
      name
    }
    ... on Bar {
      id
      name
    }
  }
}`);
});
