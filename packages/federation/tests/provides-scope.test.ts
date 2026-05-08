import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { ExecutionRequest } from '@graphql-tools/utils';
import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('@provides only fetches client-requested fields', () => {
  // Reproduces the exact scenario reported by users: when a subgraph declares
  // `@provides` on a field, the gateway should only fetch the @provides fields
  // the client actually requested, not every field listed in @provides.
  it('does not request @provides fields the client did not ask for', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `name from A for ${id}`,
              description: `description from A for ${id}`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'name from B',
              description: 'description from B',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `name from B for ${id}`,
              description: `description from B for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          entity {
            id
            name
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'name from B',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph)).toEqual(['b']);
    expect(subgraphCalls[0]?.query).not.toMatch(/\bdescription\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bname\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bid\b/);
  });

  it('requests every @provides field that was asked for and skips the rest', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
          extra: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
              extra: `A:extra`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          entity {
            id
            name
            description
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
          description: 'B:description',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph)).toEqual(['b']);
    expect(subgraphCalls[0]?.query).toMatch(/\bname\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bdescription\b/);
  });

  it('falls back to the owning subgraph when client requests a field outside of @provides', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
          extra: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
              extra: `A:extra`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          entity {
            id
            name
            extra
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
          extra: 'A:extra',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph).sort()).toEqual([
      'a',
      'b',
    ]);
    const bCall = subgraphCalls.find(({ subgraph }) => subgraph === 'b');
    expect(bCall?.query).toMatch(/\bname\b/);
    const aCall = subgraphCalls.find(({ subgraph }) => subgraph === 'a');
    expect(aCall?.query).toContain('extra');
    // The owning subgraph should not also be asked for `name`, since `b` is
    // expected to provide it via `@provides`.
    expect(aCall?.query).not.toMatch(/(?<!__type)\bname\b/);
  });

  it('only requests @provides fields when client uses an alias too', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          aliasedEntity: entity {
            id
            displayName: name
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        aliasedEntity: {
          id: '1',
          displayName: 'B:name',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph)).toEqual(['b']);
    expect(subgraphCalls[0]?.query).not.toMatch(/\bdescription\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bdisplayName\b/);
  });

  it('only injects @provides fields the client requested via a fragment spread', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        fragment EntitySummary on Entity {
          id
          name
        }

        query {
          entity {
            ...EntitySummary
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph)).toEqual(['b']);
    expect(subgraphCalls[0]?.query).not.toMatch(/\bdescription\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bname\b/);
  });

  it('preserves @include / @skip directives on the fragment wrapping a @provides field', async () => {
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    // `@skip(if: true)` removes the inner selection at execution time, so the
    // gateway must keep the wrapper intact - if the directive were dropped,
    // `name` would be eagerly fetched on every visit even though the client
    // explicitly opted out.
    const skipResult = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query Q($skip: Boolean!) {
          entity {
            id
            ... on Entity @skip(if: $skip) {
              name
            }
          }
        }
      `),
      variableValues: { skip: true },
    });

    expect(skipResult).toEqual({ data: { entity: { id: '1' } } });
    const skipCall = subgraphCalls.find(({ subgraph }) => subgraph === 'b');
    expect(skipCall?.query).toMatch(/@skip\(if:\s*\$skip\)/);
    expect(skipCall?.query).not.toMatch(/\bdescription\b/);

    subgraphCalls.length = 0;

    const includeResult = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query Q($includeName: Boolean!) {
          entity {
            id
            ... on Entity @include(if: $includeName) {
              name
            }
          }
        }
      `),
      variableValues: { includeName: true },
    });

    expect(includeResult).toEqual({
      data: { entity: { id: '1', name: 'B:name' } },
    });
    const includeCall = subgraphCalls.find(({ subgraph }) => subgraph === 'b');
    expect(includeCall?.query).toMatch(/@include\(if:\s*\$includeName\)/);
    expect(includeCall?.query).toMatch(/\bname\b/);
    expect(includeCall?.query).not.toMatch(/\bdescription\b/);
  });

  it('handles multiple sibling untyped inline fragments without losing requested @provides fields', async () => {
    // Reproduces the path-key collision risk for untyped inline fragments:
    // each `... { ... }` sibling lives at the same nominal path in the
    // original document but must still be fully considered when intersecting
    // with `@provides`.
    const a = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
          extra: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: 'A:name',
              description: 'A:description',
              extra: 'A:extra',
            };
          },
        },
      },
    });

    const b = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
            };
          },
        },
      },
    });

    const subgraphCalls: { subgraph: string; query: string }[] = [];
    const schema = await getStitchedSchemaFromLocalSchemas({
      localSchemas: { a, b },
      onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
        subgraphCalls.push({
          subgraph,
          query: print(executionRequest.document),
        });
      },
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          entity {
            id
            ... {
              name
            }
            ... {
              description
            }
          }
        }
      `),
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
          description: 'B:description',
        },
      },
    });

    expect(subgraphCalls.map(({ subgraph }) => subgraph)).toEqual(['b']);
    expect(subgraphCalls[0]?.query).toMatch(/\bname\b/);
    expect(subgraphCalls[0]?.query).toMatch(/\bdescription\b/);
  });
});
