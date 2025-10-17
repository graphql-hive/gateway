import { mergeDeep as expectedMergeDeep } from '@graphql-tools/utils';
import { expect, it } from 'vitest';
import { mergeDeep as actualMergeDeep } from '../src/utils/mergeDeep';

it('should merge arrays like graphql tools does', () => {
  const merge = [
    [{ a: 1 }, { b: 2 }, { c: 3 }],
    [{ a: 0, b: 1 }, { b: 3, c: 4 }, { d: 5 }],
  ];
  expect(actualMergeDeep(merge[0], merge[1])).toEqual(
    expectedMergeDeep(merge, undefined, true, true),
  );
});

it('should merge objects deeply like graphql tools does', () => {
  const merge = [
    {
      a: {
        b: 1,
        c: [{ a: 1 }, { b: 2 }, { c: 3 }],
        d: {
          e: 'hello',
        },
      },
      f: 42,
    },
    {
      a: {
        b: 2,
        c: [{ a: 0, b: 1 }, { b: 3, c: 4 }, { d: 5 }],
        d: {
          g: 'world',
        },
      },
      h: true,
    },
  ];
  expect(actualMergeDeep(merge[0], merge[1])).toEqual(
    expectedMergeDeep(merge, undefined, true, true),
  );
});

it.each([
  [
    { __typename: 'Product', upc: '1', name: 'Table', price: 899, weight: 100 },
    { shippingEstimate: 50, inStock: true },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      name: 'Couch',
      price: 1299,
      weight: 1000,
    },
    { shippingEstimate: 0, inStock: false },
  ],
  [
    { __typename: 'Product', upc: '3', name: 'Chair', price: 54, weight: 50 },
    { shippingEstimate: 25, inStock: true },
  ],
  [
    {
      __typename: 'Product',
      upc: '1',
      name: 'Table',
      price: 899,
      weight: 100,
      shippingEstimate: 50,
      inStock: true,
    },
    {
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: { __typename: 'Product', upc: '1' },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: { __typename: 'Product', upc: '2' },
              },
            ],
            username: '@ada',
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: { __typename: 'Product', upc: '3' },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: { __typename: 'Product', upc: '1' },
              },
            ],
            username: '@complete',
          },
        },
      ],
    },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      name: 'Couch',
      price: 1299,
      weight: 1000,
      shippingEstimate: 0,
      inStock: false,
    },
    {
      reviews: [
        {
          id: '2',
          body: 'Too expensive.',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: { __typename: 'Product', upc: '1' },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: { __typename: 'Product', upc: '2' },
              },
            ],
            username: '@ada',
          },
        },
      ],
    },
  ],
  [
    {
      __typename: 'Product',
      upc: '3',
      name: 'Chair',
      price: 54,
      weight: 50,
      shippingEstimate: 25,
      inStock: true,
    },
    {
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: { __typename: 'Product', upc: '3' },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: { __typename: 'Product', upc: '1' },
              },
            ],
            username: '@complete',
          },
        },
      ],
    },
  ],
  [
    { __typename: 'User', id: '1', username: '@ada', name: 'Ada Lovelace' },
    {
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: {
            __typename: 'Product',
            upc: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                author: {
                  __typename: 'User',
                  id: '1',
                  reviews: [
                    {
                      id: '1',
                      body: 'Love it!',
                      product: { __typename: 'Product', upc: '1' },
                    },
                    {
                      id: '2',
                      body: 'Too expensive.',
                      product: { __typename: 'Product', upc: '2' },
                    },
                  ],
                  username: '@ada',
                },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                author: {
                  __typename: 'User',
                  id: '2',
                  reviews: [
                    {
                      id: '3',
                      body: 'Could be better.',
                      product: { __typename: 'Product', upc: '3' },
                    },
                    {
                      id: '4',
                      body: 'Prefer something else.',
                      product: { __typename: 'Product', upc: '1' },
                    },
                  ],
                  username: '@complete',
                },
              },
            ],
          },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: {
            __typename: 'Product',
            upc: '2',
            reviews: [
              {
                id: '2',
                body: 'Too expensive.',
                author: {
                  __typename: 'User',
                  id: '1',
                  reviews: [
                    {
                      id: '1',
                      body: 'Love it!',
                      product: { __typename: 'Product', upc: '1' },
                    },
                    {
                      id: '2',
                      body: 'Too expensive.',
                      product: { __typename: 'Product', upc: '2' },
                    },
                  ],
                  username: '@ada',
                },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    { __typename: 'User', id: '2', username: '@complete', name: 'Alan Turing' },
    {
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: {
            __typename: 'Product',
            upc: '3',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                author: {
                  __typename: 'User',
                  id: '2',
                  reviews: [
                    {
                      id: '3',
                      body: 'Could be better.',
                      product: { __typename: 'Product', upc: '3' },
                    },
                    {
                      id: '4',
                      body: 'Prefer something else.',
                      product: { __typename: 'Product', upc: '1' },
                    },
                  ],
                  username: '@complete',
                },
              },
            ],
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: {
            __typename: 'Product',
            upc: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                author: {
                  __typename: 'User',
                  id: '1',
                  reviews: [
                    {
                      id: '1',
                      body: 'Love it!',
                      product: { __typename: 'Product', upc: '1' },
                    },
                    {
                      id: '2',
                      body: 'Too expensive.',
                      product: { __typename: 'Product', upc: '2' },
                    },
                  ],
                  username: '@ada',
                },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                author: {
                  __typename: 'User',
                  id: '2',
                  reviews: [
                    {
                      id: '3',
                      body: 'Could be better.',
                      product: { __typename: 'Product', upc: '3' },
                    },
                    {
                      id: '4',
                      body: 'Prefer something else.',
                      product: { __typename: 'Product', upc: '1' },
                    },
                  ],
                  username: '@complete',
                },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    {
      __typename: 'User',
      id: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: { __typename: 'Product', upc: '1' },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: { __typename: 'Product', upc: '2' },
        },
      ],
      username: '@ada',
    },
    { name: 'Ada Lovelace' },
  ],
  [
    {
      __typename: 'User',
      id: '2',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: { __typename: 'Product', upc: '3' },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: { __typename: 'Product', upc: '1' },
        },
      ],
      username: '@complete',
    },
    { name: 'Alan Turing' },
  ],
  [
    {
      __typename: 'User',
      id: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: { __typename: 'Product', upc: '1' },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: { __typename: 'Product', upc: '2' },
        },
      ],
      username: '@ada',
    },
    { name: 'Ada Lovelace' },
  ],
  [
    {
      __typename: 'User',
      id: '2',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: { __typename: 'Product', upc: '3' },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: { __typename: 'Product', upc: '1' },
        },
      ],
      username: '@complete',
    },
    { name: 'Alan Turing' },
  ],
  [
    {
      __typename: 'User',
      id: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: { __typename: 'Product', upc: '1' },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: { __typename: 'Product', upc: '2' },
        },
      ],
      username: '@ada',
    },
    { name: 'Ada Lovelace' },
  ],
  [
    {
      __typename: 'User',
      id: '2',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: { __typename: 'Product', upc: '3' },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: { __typename: 'Product', upc: '1' },
        },
      ],
      username: '@complete',
    },
    { name: 'Alan Turing' },
  ],
  [
    {
      __typename: 'User',
      id: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: { __typename: 'Product', upc: '1' },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: { __typename: 'Product', upc: '2' },
        },
      ],
      username: '@ada',
    },
    { name: 'Ada Lovelace' },
  ],
  [
    {
      __typename: 'User',
      id: '2',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: { __typename: 'Product', upc: '3' },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: { __typename: 'Product', upc: '1' },
        },
      ],
      username: '@complete',
    },
    { name: 'Alan Turing' },
  ],
  [
    {
      __typename: 'User',
      id: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          product: { __typename: 'Product', upc: '1' },
        },
        {
          id: '2',
          body: 'Too expensive.',
          product: { __typename: 'Product', upc: '2' },
        },
      ],
      username: '@ada',
    },
    { name: 'Ada Lovelace' },
  ],
  [
    {
      __typename: 'User',
      id: '2',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          product: { __typename: 'Product', upc: '3' },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          product: { __typename: 'Product', upc: '1' },
        },
      ],
      username: '@complete',
    },
    { name: 'Alan Turing' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    {
      __typename: 'Product',
      upc: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: { __typename: 'Product', upc: '1' },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: { __typename: 'Product', upc: '2' },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: { __typename: 'Product', upc: '3' },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: { __typename: 'Product', upc: '1' },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
    },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      reviews: [
        {
          id: '2',
          body: 'Too expensive.',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: { __typename: 'Product', upc: '1' },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: { __typename: 'Product', upc: '2' },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
      ],
    },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '2' },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '3' },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '2' },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '3' },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    {
      __typename: 'Product',
      upc: '3',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: { __typename: 'Product', upc: '3' },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: { __typename: 'Product', upc: '1' },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
    },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    {
      __typename: 'Product',
      upc: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: { __typename: 'Product', upc: '1' },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: { __typename: 'Product', upc: '2' },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: { __typename: 'Product', upc: '3' },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: { __typename: 'Product', upc: '1' },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
    },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '2' },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '3' },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '2' },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '3' },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '2' },
    { price: 1299, weight: 1000, name: 'Couch' },
  ],
  [
    { __typename: 'Product', upc: '3' },
    { price: 54, weight: 50, name: 'Chair' },
  ],
  [
    { __typename: 'Product', upc: '1' },
    { price: 899, weight: 100, name: 'Table' },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    { __typename: 'Product', upc: '3', price: 54, weight: 50, name: 'Chair' },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    { __typename: 'Product', upc: '3', price: 54, weight: 50, name: 'Chair' },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: {
                  __typename: 'Product',
                  upc: '2',
                  price: 1299,
                  weight: 1000,
                  name: 'Couch',
                },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: {
                  __typename: 'Product',
                  upc: '3',
                  price: 54,
                  weight: 50,
                  name: 'Chair',
                },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
      price: 899,
      weight: 100,
      name: 'Table',
    },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      reviews: [
        {
          id: '2',
          body: 'Too expensive.',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: {
                  __typename: 'Product',
                  upc: '2',
                  price: 1299,
                  weight: 1000,
                  name: 'Couch',
                },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
      ],
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    {
      __typename: 'Product',
      upc: '3',
      reviews: [
        {
          id: '3',
          body: 'Could be better.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: {
                  __typename: 'Product',
                  upc: '3',
                  price: 54,
                  weight: 50,
                  name: 'Chair',
                },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
      price: 54,
      weight: 50,
      name: 'Chair',
    },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    {
      __typename: 'Product',
      upc: '1',
      reviews: [
        {
          id: '1',
          body: 'Love it!',
          author: {
            __typename: 'User',
            id: '1',
            reviews: [
              {
                id: '1',
                body: 'Love it!',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
              {
                id: '2',
                body: 'Too expensive.',
                product: {
                  __typename: 'Product',
                  upc: '2',
                  price: 1299,
                  weight: 1000,
                  name: 'Couch',
                },
              },
            ],
            username: '@ada',
            name: 'Ada Lovelace',
          },
        },
        {
          id: '4',
          body: 'Prefer something else.',
          author: {
            __typename: 'User',
            id: '2',
            reviews: [
              {
                id: '3',
                body: 'Could be better.',
                product: {
                  __typename: 'Product',
                  upc: '3',
                  price: 54,
                  weight: 50,
                  name: 'Chair',
                },
              },
              {
                id: '4',
                body: 'Prefer something else.',
                product: {
                  __typename: 'Product',
                  upc: '1',
                  price: 899,
                  weight: 100,
                  name: 'Table',
                },
              },
            ],
            username: '@complete',
            name: 'Alan Turing',
          },
        },
      ],
      price: 899,
      weight: 100,
      name: 'Table',
    },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    { __typename: 'Product', upc: '3', price: 54, weight: 50, name: 'Chair' },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    { __typename: 'Product', upc: '3', price: 54, weight: 50, name: 'Chair' },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
  [
    {
      __typename: 'Product',
      upc: '2',
      price: 1299,
      weight: 1000,
      name: 'Couch',
    },
    { inStock: false, shippingEstimate: 0 },
  ],
  [
    { __typename: 'Product', upc: '3', price: 54, weight: 50, name: 'Chair' },
    { inStock: true, shippingEstimate: 25 },
  ],
  [
    { __typename: 'Product', upc: '1', price: 899, weight: 100, name: 'Table' },
    { inStock: true, shippingEstimate: 50 },
  ],
])('should merge federation case %$ like graphql tools does', (a, b) => {
  expect(actualMergeDeep(a, b)).toEqual(
    expectedMergeDeep([a, b], undefined, true, true),
  );
});
