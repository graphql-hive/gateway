import { createTenv } from '@internal/e2e';

type ServiceName = 'accounts' | 'inventory' | 'products' | 'reviews';

// BEWARE: keep in sync with @internal/examples converter
const SERVICES: ServiceName[] = [
  'accounts',
  'inventory',
  'products',
  'reviews',
];

export function createExampleSetup(
  testDirName: string,
  PRODUCTS_SIZE = process.env['PRODUCTS_SIZE'] || 3,
) {
  const { service } = createTenv(__dirname);
  const { composeWithApollo } = createTenv(testDirName);
  function exampleService(name: ServiceName) {
    return service(name, {
      env: {
        PRODUCTS_SIZE,
      },
    });
  }
  async function supergraph() {
    const services = await Promise.all(SERVICES.map(exampleService));
    return composeWithApollo({
      services,
    }).then((composition) => composition.output);
  }
  return {
    service: exampleService,
    supergraph,
    query: exampleOperation.query,
    result: exampleOperation.result,
    operationName: exampleOperation.operationName,
  };
}

const exampleOperation = {
  query: /* GraphQL */ `
    fragment User on User {
      id
      username
      name
    }

    fragment Review on Review {
      id
      body
    }

    fragment Product on Product {
      inStock
      name
      price
      shippingEstimate
      upc
      weight
    }

    query TestQuery {
      users {
        ...User
        reviews {
          ...Review
          product {
            ...Product
            reviews {
              ...Review
              author {
                ...User
                reviews {
                  ...Review
                  product {
                    ...Product
                  }
                }
              }
            }
          }
        }
      }
      topProducts {
        ...Product
        reviews {
          ...Review
          author {
            ...User
            reviews {
              ...Review
              product {
                ...Product
              }
            }
          }
        }
      }
    }
  `,
  result: {
    data: {
      topProducts: [
        {
          inStock: true,
          name: 'Table',
          price: 899,
          reviews: [
            {
              author: {
                id: '1',
                name: 'Ada Lovelace',
                reviews: [
                  {
                    body: 'Love it!',
                    id: '1',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                  {
                    body: 'Too expensive.',
                    id: '2',
                    product: {
                      inStock: false,
                      name: 'Couch',
                      price: 1299,
                      shippingEstimate: 0,
                      upc: '2',
                      weight: 1000,
                    },
                  },
                ],
                username: '@ada',
              },
              body: 'Love it!',
              id: '1',
            },
            {
              author: {
                id: '2',
                name: 'Alan Turing',
                reviews: [
                  {
                    body: 'Could be better.',
                    id: '3',
                    product: {
                      inStock: true,
                      name: 'Chair',
                      price: 54,
                      shippingEstimate: 25,
                      upc: '3',
                      weight: 50,
                    },
                  },
                  {
                    body: 'Prefer something else.',
                    id: '4',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                ],
                username: '@complete',
              },
              body: 'Prefer something else.',
              id: '4',
            },
          ],
          shippingEstimate: 50,
          upc: '1',
          weight: 100,
        },
        {
          inStock: false,
          name: 'Couch',
          price: 1299,
          reviews: [
            {
              author: {
                id: '1',
                name: 'Ada Lovelace',
                reviews: [
                  {
                    body: 'Love it!',
                    id: '1',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                  {
                    body: 'Too expensive.',
                    id: '2',
                    product: {
                      inStock: false,
                      name: 'Couch',
                      price: 1299,
                      shippingEstimate: 0,
                      upc: '2',
                      weight: 1000,
                    },
                  },
                ],
                username: '@ada',
              },
              body: 'Too expensive.',
              id: '2',
            },
          ],
          shippingEstimate: 0,
          upc: '2',
          weight: 1000,
        },
        {
          inStock: true,
          name: 'Chair',
          price: 54,
          reviews: [
            {
              author: {
                id: '2',
                name: 'Alan Turing',
                reviews: [
                  {
                    body: 'Could be better.',
                    id: '3',
                    product: {
                      inStock: true,
                      name: 'Chair',
                      price: 54,
                      shippingEstimate: 25,
                      upc: '3',
                      weight: 50,
                    },
                  },
                  {
                    body: 'Prefer something else.',
                    id: '4',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                ],
                username: '@complete',
              },
              body: 'Could be better.',
              id: '3',
            },
          ],
          shippingEstimate: 25,
          upc: '3',
          weight: 50,
        },
      ],
      users: [
        {
          id: '1',
          name: 'Ada Lovelace',
          reviews: [
            {
              body: 'Love it!',
              id: '1',
              product: {
                inStock: true,
                name: 'Table',
                price: 899,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Love it!',
                    id: '1',
                  },
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Prefer something else.',
                    id: '4',
                  },
                ],
                shippingEstimate: 50,
                upc: '1',
                weight: 100,
              },
            },
            {
              body: 'Too expensive.',
              id: '2',
              product: {
                inStock: false,
                name: 'Couch',
                price: 1299,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Too expensive.',
                    id: '2',
                  },
                ],
                shippingEstimate: 0,
                upc: '2',
                weight: 1000,
              },
            },
          ],
          username: '@ada',
        },
        {
          id: '2',
          name: 'Alan Turing',
          reviews: [
            {
              body: 'Could be better.',
              id: '3',
              product: {
                inStock: true,
                name: 'Chair',
                price: 54,
                reviews: [
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Could be better.',
                    id: '3',
                  },
                ],
                shippingEstimate: 25,
                upc: '3',
                weight: 50,
              },
            },
            {
              body: 'Prefer something else.',
              id: '4',
              product: {
                inStock: true,
                name: 'Table',
                price: 899,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Love it!',
                    id: '1',
                  },
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Prefer something else.',
                    id: '4',
                  },
                ],
                shippingEstimate: 50,
                upc: '1',
                weight: 100,
              },
            },
          ],
          username: '@complete',
        },
      ],
    },
  },
  operationName: 'TestQuery',
};
