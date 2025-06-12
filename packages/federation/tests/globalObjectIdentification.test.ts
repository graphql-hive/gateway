import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { toGlobalId } from 'graphql-relay';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Global Object Identification', () => {
  const data = {
    accounts: [
      {
        id: 'a1',
        name: 'John Doe',
        email: 'john@doe.com',
      },
    ],
    auth: [
      {
        id: 'a1',
        isVerified: true,
      },
    ],
    people: [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@doe.com',
      },
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@doe.com',
      },
    ],
  };

  const accounts = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        accounts: [Account!]!
      }
      type Account @key(fields: "id") {
        id: ID!
        name: String!
        email: String!
      }
    `),
    resolvers: {
      Query: {
        accounts: () => data.accounts,
      },
      Account: {
        __resolveReference: (ref) => data.accounts.find((a) => a.id === ref.id),
      },
    },
  });

  const auth = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Account @key(fields: "id") {
        id: ID!
        isVerified: Boolean!
      }
    `),
    resolvers: {
      Account: {
        __resolveReference: (ref) => data.auth.find((a) => a.id === ref.id),
      },
    },
  });

  const people = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        people: [Person!]!
      }
      type Person @key(fields: "firstName lastName") {
        firstName: String!
        lastName: String!
        email: String!
      }
    `),
    resolvers: {
      Query: {
        people: () => data.people,
      },
      Person: {
        __resolveReference: (ref) =>
          data.people.find(
            (a) => a.firstName === ref.firstName && a.lastName === ref.lastName,
          ),
      },
    },
  });

  it('should generate stitched schema with node interface', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
      },
    });

    expect(printSchemaWithDirectives(schema)).toMatchInlineSnapshot(`
      "schema {
        query: Query
      }

      type Query {
        accounts: [Account!]!
        """Fetches an object given its globally unique \`ID\`."""
        node(
          """The globally unique \`ID\`."""
          nodeId: ID!
        ): Node
      }

      type Account implements Node {
        id: ID!
        name: String!
        email: String!
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }

      interface Node {
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }"
    `);
  });

  it('should resolve without node as usual', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
        auth,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
            {
              accounts {
                id
                name
                email
                isVerified
              }
            }
          `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "accounts": [
            {
              "email": "john@doe.com",
              "id": "a1",
              "isVerified": true,
              "name": "John Doe",
            },
          ],
        },
      }
    `);
  });

  it('should resolve single field key object from globally unique node', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
        auth,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Account', 'a1')}") {
            nodeId
            ... on Account {
              id
              name
              email
              isVerified
            }
          }
        }
      `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": {
            "email": "john@doe.com",
            "id": "a1",
            "isVerified": true,
            "name": "John Doe",
            "nodeId": "QWNjb3VudDphMQ==",
          },
        },
      }
    `);
  });

  it('should not resolve single field key object from globally unique node when doesnt exist', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Account', 'dontexist1')}") {
            nodeId
            ... on Account {
              id
              name
              email
            }
          }
        }
      `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": null,
        },
      }
    `);
  });

  it('should resolve multiple fields key object from globally unique node', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        people,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Person', JSON.stringify({ firstName: 'John', lastName: 'Doe' }))}") {
            nodeId
            ... on Person {
              firstName
              lastName
            }
          }
        }
      `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": {
            "firstName": "John",
            "lastName": "Doe",
            "nodeId": "UGVyc29uOnsiZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn0=",
          },
        },
      }
    `);
  });

  it('should resolve node id from object', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
            {
              accounts {
                nodeId
                id
                name
                email
              }
            }
          `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "accounts": [
            {
              "email": "john@doe.com",
              "id": "a1",
              "name": "John Doe",
              "nodeId": "QWNjb3VudDphMQ==",
            },
          ],
        },
      }
    `);
  });
});
