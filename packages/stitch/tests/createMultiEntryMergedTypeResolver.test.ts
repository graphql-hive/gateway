import { Subschema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Kind, parse, type SelectionSetNode } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  createMultiEntryMergedTypeResolver,
  overlayMergedTypeEntryPoint,
} from '../src/createMergedTypeResolver.js';

const selectionSet: SelectionSetNode = {
  kind: Kind.SELECTION_SET,
  selections: [
    {
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: 'name' },
    },
  ],
};

describe('createMultiEntryMergedTypeResolver', () => {
  it('overlays parent merge defaults onto each entryPoint', () => {
    const overlay = overlayMergedTypeEntryPoint(
      {
        argsFromKeys: (keys) => ({ ids: keys }),
        valuesFromResults: (results) => results,
        dataLoaderOptions: { cache: false },
        entryPoints: [
          { selectionSet: '{ id }', fieldName: 'byId' },
          { selectionSet: '{ upc }', fieldName: 'byUpc' },
        ],
      },
      { selectionSet: '{ upc }', fieldName: 'byUpc' },
    );
    expect(overlay.fieldName).toBe('byUpc');
    expect(overlay.selectionSet).toBe('{ upc }');
    expect(overlay.argsFromKeys?.(['a'])).toEqual({ ids: ['a'] });
    expect(overlay.dataLoaderOptions).toEqual({ cache: false });
  });

  it('inherits parent argsFromKeys when building entry resolvers', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          id: ID!
          upc: String
          name: String
        }
        type Query {
          byId(ids: [ID!]!): [Product]!
          byUpc(upcs: [String!]!): [Product]!
        }
      `,
      resolvers: {
        Query: {
          byId: () => [{ id: '1', name: 'from-id' }],
          byUpc: () => [{ id: '1', upc: 'u1', name: 'from-upc' }],
        },
      },
    });
    const subschema = new Subschema({ schema });
    const resolver = createMultiEntryMergedTypeResolver({
      argsFromKeys: (keys) => ({ ids: keys }),
      entryPoints: [
        {
          selectionSet: '{ id }',
          fieldName: 'byId',
          key: (obj: { id?: string }) => obj.id,
        },
        {
          selectionSet: '{ upc }',
          fieldName: 'byUpc',
          // entry omits argsFromKeys on purpose - must inherit parent
          argsFromKeys: (keys) => ({ upcs: keys }),
          key: (obj: { upc?: string }) => obj.upc,
        },
      ],
    });
    expect(resolver).toBeDefined();
    const info = {
      returnType: schema.getType('Product'),
      schema,
      operation: parse('query { __typename }').definitions[0],
      fieldNodes: [],
      fragments: {},
      variableValues: {},
      parentType: schema.getQueryType()!,
      path: { key: 'product', typename: 'Query', prev: undefined },
      rootValue: undefined,
      fieldName: 'product',
    } as any;
    const result = await resolver!(
      { upc: 'u1' },
      {},
      info,
      subschema,
      selectionSet,
      undefined,
      schema.getType('Product') as any,
      true,
    );
    expect(result).toMatchObject({ name: 'from-upc' });
  });

  it('honors custom resolve on an entryPoint', async () => {
    const custom = vi.fn(async () => ({ id: '1', name: 'custom' }));
    const resolver = createMultiEntryMergedTypeResolver({
      entryPoints: [
        {
          selectionSet: '{ id }',
          resolve: custom,
        },
        {
          selectionSet: '{ upc }',
          fieldName: 'byUpc',
          key: (obj: { upc?: string }) => obj.upc,
          argsFromKeys: (keys) => ({ upcs: keys }),
        },
      ],
    });
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          id: ID!
          upc: String
          name: String
        }
        type Query {
          byUpc(upcs: [String!]!): [Product]!
        }
      `,
    });
    const subschema = new Subschema({ schema });
    const info = {
      returnType: schema.getType('Product'),
      schema,
      operation: parse('query { __typename }').definitions[0],
      fieldNodes: [],
      fragments: {},
      variableValues: {},
      parentType: schema.getQueryType()!,
      path: { key: 'product', typename: 'Query', prev: undefined },
      rootValue: undefined,
      fieldName: 'product',
    } as any;
    const result = await resolver!(
      { id: '1' },
      {},
      info,
      subschema,
      selectionSet,
      undefined,
      schema.getType('Product') as any,
      true,
    );
    expect(custom).toHaveBeenCalled();
    expect(result).toEqual({ id: '1', name: 'custom' });
  });
});
