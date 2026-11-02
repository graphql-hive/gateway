import { makeExecutableSchema } from '@graphql-tools/schema';
import { print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { deferComputedFieldsTransformer } from '../src/subschemaConfigTransforms/deferComputedFieldsTransform.js';

describe('deferComputedFieldsTransformer', () => {
  it('injects nested merge-key selections when stripping computed fields', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Organization {
          id: ID!
        }
        type Product {
          organization: Organization
          shippingEstimate: Int
        }
        type Query {
          product: Product
          productByOrg(id: ID!): Product
        }
      `,
    });
    const [config] = deferComputedFieldsTransformer({
      schema,
      merge: {
        Product: {
          selectionSet: '{ organization { id } }',
          fieldName: 'productByOrg',
          fields: {
            shippingEstimate: {
              selectionSet: '{ organization { id } }',
              computed: true,
            },
          },
        },
      },
    });
    expect(config?.transforms?.length).toBe(1);
    const transform = config!.transforms![0] as {
      transformRequest: (
        req: { document: any },
        ctx: { fieldName: string },
      ) => { document: any };
    };
    const result = transform.transformRequest(
      {
        document: {
          kind: 'Document',
          definitions: [
            {
              kind: 'OperationDefinition',
              operation: 'query',
              selectionSet: {
                kind: 'SelectionSet',
                selections: [
                  {
                    kind: 'Field',
                    name: { kind: 'Name', value: 'product' },
                    selectionSet: {
                      kind: 'SelectionSet',
                      selections: [
                        {
                          kind: 'Field',
                          name: { kind: 'Name', value: 'shippingEstimate' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { fieldName: 'product' },
    );
    expect(print(result.document)).toContain('organization');
    expect(print(result.document)).toContain('id');
    expect(print(result.document)).not.toContain('shippingEstimate');
  });

  it('does not treat an aliased key field as the literal merge key', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          id: ID!
          shippingEstimate: Int
        }
        type Query {
          product: Product
          productById(id: ID!): Product
        }
      `,
    });
    const [config] = deferComputedFieldsTransformer({
      schema,
      merge: {
        Product: {
          selectionSet: '{ id }',
          fieldName: 'productById',
          fields: {
            shippingEstimate: {
              selectionSet: '{ id }',
              computed: true,
            },
          },
        },
      },
    });
    const transform = config!.transforms![0] as {
      transformRequest: (
        req: { document: any },
        ctx: { fieldName: string },
      ) => { document: any };
    };
    const result = transform.transformRequest(
      {
        document: {
          kind: 'Document',
          definitions: [
            {
              kind: 'OperationDefinition',
              operation: 'query',
              selectionSet: {
                kind: 'SelectionSet',
                selections: [
                  {
                    kind: 'Field',
                    name: { kind: 'Name', value: 'product' },
                    selectionSet: {
                      kind: 'SelectionSet',
                      selections: [
                        {
                          kind: 'Field',
                          alias: { kind: 'Name', value: 'aliasId' },
                          name: { kind: 'Name', value: 'id' },
                        },
                        {
                          kind: 'Field',
                          name: { kind: 'Name', value: 'shippingEstimate' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { fieldName: 'product' },
    );
    const printed = print(result.document);
    expect(printed).toContain('aliasId');
    // Literal `id` must still be injected for merge identity.
    expect(printed).toMatch(/\bid\b/);
    expect(printed).not.toContain('shippingEstimate');
  });
});
