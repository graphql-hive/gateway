import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';
import { extractPercentageFromLabel } from '@graphql-tools/federation';

describe('Progressive Override', () => {
  describe('Label processing', () => {
    it('from the root level', async () => {
      const SUBGRAPHA = buildSubgraphSchema([
        {
          typeDefs: parse(/* GraphQL */ `
            type Query {
              foo: Foo
            }

            type Foo @key(fields: "id") {
              id: ID!
              value: String @override(from: "SUBGRAPHB", label: "take_a")
            }

            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.7"
                import: ["@key", "@override"]
              ) {
              query: Query
            }
          `),

          resolvers: {
            Query: {
              foo() {
                return {
                  id: '1',
                  value: 'Value from A for id: 1',
                };
              },
            },
          },
        },
      ]);
      const SUBGRAPHB = buildSubgraphSchema({
        typeDefs: parse(/* GraphQL */ `
          type Foo @key(fields: "id") {
            id: ID!
            value: String
          }
        `),
        resolvers: {
          Foo: {
            value(parent: any) {
              return `Value from B for id: ${parent.id}`;
            },
          },
        },
      });
      const supergraph = await getStitchedSchemaFromLocalSchemas({
        localSchemas: {
          SUBGRAPHA,
          SUBGRAPHB,
        },
        handleProgressiveOverride(label, context) {
          return !!context[label];
        },
      });
      const result = await normalizedExecutor({
        schema: supergraph,
        document: parse(/* GraphQL */ `
          query {
            foo {
              id
              value
            }
          }
        `),
        contextValue: {
          take_a: true,
        },
      });
      expect(result).toEqual({
        data: {
          foo: {
            id: '1',
            value: 'Value from A for id: 1',
          },
        },
      });
      const result2 = await normalizedExecutor({
        schema: supergraph,
        document: parse(/* GraphQL */ `
          query {
            foo {
              id
              value
            }
          }
        `),
        contextValue: {
          take_a: false,
        },
      });
      expect(result2).toEqual({
        data: {
          foo: {
            id: '1',
            value: 'Value from B for id: 1',
          },
        },
      });
    });
    describe('from a nested level', () => {
      const SUBGRAPHA = buildSubgraphSchema([
        {
          typeDefs: parse(/* GraphQL */ `
            type Query {
              foo: Foo
            }

            type Foo @key(fields: "id") {
              id: ID!
              bar: Bar
            }
            type Bar @key(fields: "id") {
              id: ID!
            }
          `),

          resolvers: {
            Query: {
              foo() {
                return {
                  id: '1',
                  bar: { id: '2' },
                };
              },
            },
          },
        },
      ]);
      const SUBGRAPHB = buildSubgraphSchema({
        typeDefs: parse(/* GraphQL */ `
          type Foo @key(fields: "id") {
            id: ID!
            bar: Bar
          }
          type Bar @key(fields: "id") {
            id: ID!
            bValue: String
            value: String
          }
        `),
        resolvers: {
          Foo: {
            bar(parent: any) {
              return {
                id: parent.bar.id,
              };
            },
          },
          Bar: {
            __resolveReference(parent: any) {
              return {
                id: parent.id,
              };
            },
            bValue(parent: any) {
              return `B Value from B for Bar id: ${parent.id}`;
            },
            value(parent: any) {
              return `Value from B for Bar id: ${parent.id}`;
            },
          },
        },
      });
      const SUBGRAPHC = buildSubgraphSchema({
        typeDefs: parse(/* GraphQL */ `
          type Query {
            _: Boolean
          }
          type Bar @key(fields: "id") {
            id: ID!
            cValue: String
            value: String @override(from: "SUBGRAPHB", label: "take_c")
          }
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.7"
              import: ["@key", "@override"]
            ) {
            query: Query
          }
        `),
        resolvers: {
          Bar: {
            __resolveReference(parent: any) {
              return {
                id: parent.id,
              };
            },
            cValue(parent: any) {
              return `C Value from C for Bar id: ${parent.id}`;
            },
            value(parent: any) {
              return `Value from C for Bar id: ${parent.id}`;
            },
          },
        },
      });
      const supergraph$ = getStitchedSchemaFromLocalSchemas({
        localSchemas: {
          SUBGRAPHA,
          SUBGRAPHB,
          SUBGRAPHC,
        },
        handleProgressiveOverride(label, context) {
          return !!context[label];
        },
      });
      it('overrides if the flag is true', async () => {
        const result = await normalizedExecutor({
          schema: await supergraph$,
          document: parse(/* GraphQL */ `
            query {
              foo {
                id
                bar {
                  id
                  bValue
                  cValue
                  value
                }
              }
            }
          `),
          contextValue: {
            take_c: true,
          },
        });
        expect(result).toEqual({
          data: {
            foo: {
              id: '1',
              bar: {
                id: '2',
                bValue: 'B Value from B for Bar id: 2',
                cValue: 'C Value from C for Bar id: 2',
                value: 'Value from C for Bar id: 2',
              },
            },
          },
        });
      });
      it('does not override if the flag is false', async () => {
        const result2 = await normalizedExecutor({
          schema: await supergraph$,
          document: parse(/* GraphQL */ `
            query {
              foo {
                id
                bar {
                  id
                  bValue
                  cValue
                  value
                }
              }
            }
          `),
          contextValue: {
            take_c: false,
          },
        });
        expect(result2).toEqual({
          data: {
            foo: {
              id: '1',
              bar: {
                id: '2',
                bValue: 'B Value from B for Bar id: 2',
                cValue: 'C Value from C for Bar id: 2',
                value: 'Value from B for Bar id: 2',
              },
            },
          },
        });
      });
    });
  });
  describe('percent(x) parsing', () => {
    it('support integers', () => {
      expect(extractPercentageFromLabel('percent(10)')).toBe(10);
    });
    it('support floats', () => {
      expect(extractPercentageFromLabel('percent(12.5)')).toBe(12.5);
    });
    it('returns undefined for non-matching labels', () => {
      expect(extractPercentageFromLabel('custom_label')).toBeUndefined();
      expect(extractPercentageFromLabel('percentile(10)')).toBeUndefined();
    });
    it('throws for out-of-bound numbers', () => {
      expect(() => extractPercentageFromLabel('percent(150)')).toThrowError(
        'Expected a percentage value between 0 and 100, got 150',
      );
    });
    it('throws for malformed percent labels', () => {
      expect(() => extractPercentageFromLabel('percent()')).toThrowError(
        'Expected a number in percent(x), got: percent()',
      );
      expect(() => extractPercentageFromLabel('percent(foo)')).toThrowError(
        'Expected a number in percent(x), got: percent(foo)',
      );
    });
  });
});
