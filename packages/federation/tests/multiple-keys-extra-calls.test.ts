import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { parse, print } from 'graphql';
import { expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

it('does not refetch fields when an unrelated type has multiple keys', async () => {
  let getAccountTicketsCalls = 0;

  const CRM = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        account(id: ID!): Account
      }

      type Account @key(fields: "id") {
        id: ID!
        tickets: TicketConnection
      }

      type TicketConnection {
        edges: [TicketEdge!]!
      }

      type TicketEdge {
        node: Ticket!
      }

      type Ticket @key(fields: "id") {
        id: ID!
        account: Account
      }

      # Not referenced by the query, and nothing else refers to it. Its second
      # @key is enough to split the whole CRM subgraph into two subschemas, the
      # second of which can only merge Service.
      type Service @key(fields: "id") @key(fields: "reference") {
        id: ID!
        reference: String!
      }
    `),
    resolvers: {
      Query: {
        account: (_: unknown, args: { id: string }) => {
          return { id: args.id };
        },
      },
      Account: {
        // Stands in for an expensive backend call that returns the whole page.
        tickets: (account: { id: string }) => {
          getAccountTicketsCalls++;
          return {
            edges: [1, 2].map((n) => ({
              node: { id: `t${n}`, account: { id: account.id } },
            })),
          };
        },
      },
      Ticket: {
        __resolveReference(reference: { id: string }) {
          return { id: reference.id, account: { id: 'a1' } };
        },
      },
    },
  });

  const ENERGY = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        _: Boolean
      }

      type Account @key(fields: "id") {
        id: ID!
        energy: String
      }
    `),
    resolvers: {
      Account: {
        __resolveReference(reference: { id: string }) {
          return { id: reference.id };
        },
        energy() {
          return 'COMPLETED';
        },
      },
    },
  });

  const subgraphCalls: {
    subgraphName: string;
    query: string;
  }[] = [];

  const schema = await getStitchedSchemaFromLocalSchemas({
    localSchemas: {
      CRM,
      ENERGY,
    },
    onSubgraphExecute(subgraphName, executionRequest) {
      subgraphCalls.push({
        subgraphName,
        query: print(executionRequest.document),
      });
    },
  });

  const result = await normalizedExecutor({
    schema,
    document: parse(/* GraphQL */ `
      query {
        account(id: "a1") {
          tickets {
            edges {
              node {
                id
                account {
                  energy
                }
              }
            }
          }
        }
      }
    `),
  });

  expect(result).toEqual({
    data: {
      account: {
        tickets: {
          edges: [
            { node: { id: 't1', account: { energy: 'COMPLETED' } } },
            { node: { id: 't2', account: { energy: 'COMPLETED' } } },
          ],
        },
      },
    },
  });

  // CRM can resolve the whole tree, including the Account key needed for the
  // energy hop. ENERGY then adds `energy` in a single _entities call.
  expect(subgraphCalls.map(({ subgraphName }) => subgraphName)).toEqual([
    'CRM',
    'ENERGY',
  ]);

  // CRM already returned every ticket, so it must not be asked again.
  expect(getAccountTicketsCalls).toBe(1);
});
