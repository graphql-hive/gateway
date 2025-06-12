import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { parse, validate } from 'graphql';
import { toGlobalId } from 'graphql-relay';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Global Object Identification', () => {
  it('should generate stitched schema with node interface', async () => {
    const { schema } = await getSchema();

    expect(printSchemaWithDirectives(schema)).toMatchInlineSnapshot(`
      "schema {
        query: Query
      }

      type Query {
        feed: [Story!]!
        people: [Person!]!
        organizations: [Organization!]!
        """Fetches an object given its globally unique \`ID\`."""
        node(
          """The globally unique \`ID\`."""
          nodeId: ID!
        ): Node
      }

      interface Actor {
        id: ID!
        name: String!
      }

      type Organization implements Actor & Node {
        id: ID!
        name: String!
        foundingDate: String!
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }

      type Person implements Actor & Node {
        id: ID!
        name: String!
        dateOfBirth: String!
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }

      type Story implements Node {
        title: String!
        publishedAt: String!
        actor: Actor!
        content: String!
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
    const { execute } = await getSchema();

    await expect(
      execute({
        query: /* GraphQL */ `
          {
            feed {
              title
              content
              actor {
                name
                ... on Person {
                  dateOfBirth
                }
                ... on Organization {
                  foundingDate
                }
              }
            }
          }
        `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "feed": [
            {
              "actor": {
                "dateOfBirth": "2001-01-01",
                "name": "John Doe",
              },
              "content": "Lorem ipsum dolor sit amet.",
              "title": "Personal Story 1",
            },
            {
              "actor": {
                "dateOfBirth": "2002-02-02",
                "name": "Jane Doe",
              },
              "content": "Lorem ipsum dolor sit amet.",
              "title": "Personal Story 2",
            },
            {
              "actor": {
                "foundingDate": "1993-03-03",
                "name": "Foo Inc.",
              },
              "content": "Lorem ipsum dolor sit amet.",
              "title": "Corporate Story 3",
            },
          ],
        },
      }
    `);
  });

  it('should resolve single field key object', async () => {
    const { data, execute } = await getSchema();

    await expect(
      execute({
        query: /* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Person', data.people[0].id)}") {
            nodeId
            ... on Person {
              name
              dateOfBirth
            }
          }
        }
      `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": {
            "dateOfBirth": "2001-01-01",
            "name": "John Doe",
            "nodeId": "UGVyc29uOnAx",
          },
        },
      }
    `);
  });

  it('should resolve multiple fields key object', async () => {
    const { data, execute } = await getSchema();

    await expect(
      execute({
        query: /* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Story', JSON.stringify(data.stories[1]))}") {
            ... on Story {
              nodeId
              title
              content
            }
          }
        }
      `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": {
            "content": "Lorem ipsum dolor sit amet.",
            "nodeId": "U3Rvcnk6eyJ0aXRsZSI6IlBlcnNvbmFsIFN0b3J5IDIiLCJwdWJsaXNoZWRBdCI6IjIwMTItMDItMDIifQ==",
            "title": "Personal Story 2",
          },
        },
      }
    `);
  });

  it('should resolve node id from object', async () => {
    const { execute } = await getSchema();

    await expect(
      execute({
        query: /* GraphQL */ `
          {
            people {
              nodeId # we omit the "id" key field making sure it's resolved internally
              name
              dateOfBirth
            }
          }
        `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "people": [
            {
              "dateOfBirth": "2001-01-01",
              "name": "John Doe",
              "nodeId": "UGVyc29uOnAx",
            },
            {
              "dateOfBirth": "2002-02-02",
              "name": "Jane Doe",
              "nodeId": "UGVyc29uOnAy",
            },
          ],
        },
      }
    `);

    await expect(
      execute({
        query: /* GraphQL */ `
          {
            feed {
              nodeId # we omit the "title" and "publishedAt" key fields making sure it's resolved internally
            }
          }
        `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "feed": [
            {
              "nodeId": "U3Rvcnk6eyJ0aXRsZSI6IlBlcnNvbmFsIFN0b3J5IDEiLCJwdWJsaXNoZWRBdCI6IjIwMTEtMDEtMDEifQ==",
            },
            {
              "nodeId": "U3Rvcnk6eyJ0aXRsZSI6IlBlcnNvbmFsIFN0b3J5IDIiLCJwdWJsaXNoZWRBdCI6IjIwMTItMDItMDIifQ==",
            },
            {
              "nodeId": "U3Rvcnk6eyJ0aXRsZSI6IkNvcnBvcmF0ZSBTdG9yeSAzIiwicHVibGlzaGVkQXQiOiIyMDEzLTAzLTAzIn0=",
            },
          ],
        },
      }
    `);
  });

  it('should not resolve when object doesnt exist', async () => {
    const { schema } = await getSchema();

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Person', 'IDontExist')}") {
            ... on Person {
              nodeId
              id
              name
              dateOfBirth
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

  it('should not resolve when invalid node id', async () => {
    const { schema } = await getSchema();

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
            {
              node(nodeId: "gibberish") {
                ... on Organization {
                  nodeId
                  id
                  name
                  foundingDate
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
});

async function getSchema() {
  const data = {
    people: [
      {
        id: 'p1',
        name: 'John Doe',
        dateOfBirth: '2001-01-01',
      },
      {
        id: 'p2',
        name: 'Jane Doe',
        dateOfBirth: '2002-02-02',
      },
    ] as const,
    organizations: [
      {
        id: 'o3',
        name: 'Foo Inc.',
        foundingDate: '1993-03-03',
      },
      {
        id: 'o4',
        name: 'Bar Inc.',
        foundingDate: '1994-04-04',
      },
    ] as const,
    stories: [
      {
        title: 'Personal Story 1',
        publishedAt: '2011-01-01',
        content: 'Lorem ipsum dolor sit amet.',
        actor: {
          id: 'p1',
        },
      },
      {
        title: 'Personal Story 2',
        publishedAt: '2012-02-02',
        content: 'Lorem ipsum dolor sit amet.',
        actor: {
          id: 'p2',
        },
      },
      {
        title: 'Corporate Story 3',
        publishedAt: '2013-03-03',
        content: 'Lorem ipsum dolor sit amet.',
        actor: {
          id: 'o3',
        },
      },
    ] as const,
  };

  const users = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        people: [Person!]!
        organizations: [Organization!]!
      }

      type Person @key(fields: "id") {
        id: ID!
        dateOfBirth: String!
      }

      type Organization @key(fields: "id") {
        id: ID!
        foundingDate: String!
      }
    `),
    resolvers: {
      Query: {
        people: () =>
          data.people.map((p) => ({
            id: p.id,
            dateOfBirth: p.dateOfBirth,
          })),
        organizations: () =>
          data.organizations.map((o) => ({
            id: o.id,
            foundingDate: o.foundingDate,
          })),
      },
      Person: {
        __resolveReference: (ref) => {
          const person = data.people.find((p) => p.id === ref.id);
          return person
            ? { id: person.id, dateOfBirth: person.dateOfBirth }
            : null;
        },
      },
      Organization: {
        __resolveReference: (ref) => {
          const org = data.organizations.find((o) => o.id === ref.id);
          return org ? { id: org.id, foundingDate: org.foundingDate } : null;
        },
      },
    },
  });

  const stories = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        feed: [Story!]!
      }

      type Story @key(fields: "title publishedAt") {
        title: String!
        publishedAt: String!
        actor: Actor!
        content: String!
      }

      interface Actor @key(fields: "id") {
        id: ID!
        name: String!
      }

      type Person implements Actor @key(fields: "id") {
        id: ID!
        name: String!
      }

      type Organization implements Actor @key(fields: "id") {
        id: ID!
        name: String!
      }
    `),
    resolvers: {
      Query: {
        feed: () => data.stories,
      },
      Actor: {
        __resolveType: (ref) => {
          if (data.people.find((p) => p.id === ref.id)) {
            return 'Person';
          }
          if (data.organizations.find((o) => o.id === ref.id)) {
            return 'Organization';
          }
          return null;
        },
      },
      Person: {
        __resolveReference(ref) {
          const person = data.people.find((p) => p.id === ref.id);
          return person ? { id: person.id, name: person.name } : null;
        },
        name(source) {
          const person = data.people.find((p) => p.id === source.id);
          return person ? person.name : null;
        },
      },
      Organization: {
        __resolveReference: (ref) => {
          const org = data.organizations.find((o) => o.id === ref.id);
          return org ? { id: org.id, name: org.name } : null;
        },
        name(source) {
          const org = data.organizations.find((o) => o.id === source.id);
          return org ? org.name : null;
        },
      },
      Story: {
        __resolveReference: (ref) =>
          data.stories.find(
            (s) => s.title === ref.title && s.publishedAt === ref.publishedAt,
          ),
      },
    },
  });

  const schema = await getStitchedSchemaFromLocalSchemas({
    globalObjectIdentification: true,
    localSchemas: {
      users,
      stories,
    },
  });

  return {
    data,
    schema,
    async execute({
      query,
      variables,
    }: {
      query: string;
      variables?: Record<string, unknown>;
    }) {
      const document = parse(query);
      const errs = validate(schema, document);
      if (errs.length === 1) {
        throw errs[0];
      } else if (errs.length) {
        throw new AggregateError(errs, errs.map((e) => e.message).join('; '));
      }
      return normalizedExecutor({
        schema,
        document,
        variableValues: variables,
      });
    },
  };
}
