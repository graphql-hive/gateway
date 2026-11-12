import { makeExecutableSchema } from '@graphql-tools/schema';
import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { deferComputedFieldsTransformer } from '../src/subschemaConfigTransforms/deferComputedFieldsTransform.js';

type TransformLike = {
  transformRequest: (
    req: { document: any },
    ctx: { fieldName: string; skipTypeMerging?: boolean },
  ) => { document: any };
};

function productDoc(productSelections: string) {
  return parse(/* GraphQL */ `
    {
      product {
        ${productSelections}
      }
    }
  `);
}

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
    const transform = config!.transforms![0] as TransformLike;
    const result = transform.transformRequest(
      { document: productDoc('shippingEstimate') },
      { fieldName: 'product' },
    );
    expect(print(result.document)).toContain('organization');
    expect(print(result.document)).toContain('id');
    expect(print(result.document)).not.toContain('shippingEstimate');
  });

  it('merges nested merge-key children into an already-selected parent field', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Organization {
          id: ID!
          name: String
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
    const transform = config!.transforms![0] as TransformLike;
    const result = transform.transformRequest(
      { document: productDoc('organization { name } shippingEstimate') },
      { fieldName: 'product' },
    );
    const printed = print(result.document);
    expect(printed).toContain('name');
    expect(printed).toContain('id');
    expect(printed).not.toContain('shippingEstimate');
  });

  it('still defers computed fields when a client calls the merge entry field', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          id: ID!
          price: Int
          weight: Int
          shippingEstimate: Int
        }
        type Query {
          _products(representations: [ID!]!): [Product]
        }
      `,
    });
    const [config] = deferComputedFieldsTransformer({
      schema,
      merge: {
        Product: {
          selectionSet: '{ id }',
          fieldName: '_products',
          fields: {
            shippingEstimate: {
              selectionSet: '{ price weight }',
              computed: true,
            },
          },
        },
      },
    });
    const transform = config!.transforms![0] as TransformLike;
    const clientCall = transform.transformRequest(
      {
        document: parse(/* GraphQL */ `
          {
            _products(representations: ["1"]) {
              shippingEstimate
            }
          }
        `),
      },
      { fieldName: '_products', skipTypeMerging: false },
    );
    expect(print(clientCall.document)).not.toContain('shippingEstimate');
    expect(print(clientCall.document)).toContain('id');

    const mergeHop = transform.transformRequest(
      {
        document: parse(/* GraphQL */ `
          {
            _products(representations: ["1"]) {
              shippingEstimate
            }
          }
        `),
      },
      { fieldName: '_products', skipTypeMerging: true },
    );
    expect(print(mergeHop.document)).toContain('shippingEstimate');
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
    const transform = config!.transforms![0] as TransformLike;
    const result = transform.transformRequest(
      {
        document: parse(/* GraphQL */ `
          {
            product {
              aliasId: id
              shippingEstimate
            }
          }
        `),
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
