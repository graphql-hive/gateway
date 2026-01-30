import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query } = createExampleSetup(__dirname);
it('should consistently explain the query plan', async () => {
  const { execute } = await gateway({
    supergraph: await supergraph(),
  });
  await expect(
    execute({
      query,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "topProducts": [
          {
            "inStock": true,
            "name": "Table",
            "price": 899,
            "reviews": [
              {
                "author": {
                  "id": "1",
                  "name": "Ada Lovelace",
                  "reviews": [
                    {
                      "body": "Love it!",
                      "id": "1",
                      "product": {
                        "inStock": true,
                        "name": "Table",
                        "price": 899,
                        "shippingEstimate": 50,
                        "upc": "1",
                        "weight": 100,
                      },
                    },
                    {
                      "body": "Too expensive.",
                      "id": "2",
                      "product": {
                        "inStock": false,
                        "name": "Couch",
                        "price": 1299,
                        "shippingEstimate": 0,
                        "upc": "2",
                        "weight": 1000,
                      },
                    },
                  ],
                  "username": "@ada",
                },
                "body": "Love it!",
                "id": "1",
              },
              {
                "author": {
                  "id": "2",
                  "name": "Alan Turing",
                  "reviews": [
                    {
                      "body": "Could be better.",
                      "id": "3",
                      "product": {
                        "inStock": true,
                        "name": "Chair",
                        "price": 54,
                        "shippingEstimate": 25,
                        "upc": "3",
                        "weight": 50,
                      },
                    },
                    {
                      "body": "Prefer something else.",
                      "id": "4",
                      "product": {
                        "inStock": true,
                        "name": "Table",
                        "price": 899,
                        "shippingEstimate": 50,
                        "upc": "1",
                        "weight": 100,
                      },
                    },
                  ],
                  "username": "@complete",
                },
                "body": "Prefer something else.",
                "id": "4",
              },
            ],
            "shippingEstimate": 50,
            "upc": "1",
            "weight": 100,
          },
          {
            "inStock": false,
            "name": "Couch",
            "price": 1299,
            "reviews": [
              {
                "author": {
                  "id": "1",
                  "name": "Ada Lovelace",
                  "reviews": [
                    {
                      "body": "Love it!",
                      "id": "1",
                      "product": {
                        "inStock": true,
                        "name": "Table",
                        "price": 899,
                        "shippingEstimate": 50,
                        "upc": "1",
                        "weight": 100,
                      },
                    },
                    {
                      "body": "Too expensive.",
                      "id": "2",
                      "product": {
                        "inStock": false,
                        "name": "Couch",
                        "price": 1299,
                        "shippingEstimate": 0,
                        "upc": "2",
                        "weight": 1000,
                      },
                    },
                  ],
                  "username": "@ada",
                },
                "body": "Too expensive.",
                "id": "2",
              },
            ],
            "shippingEstimate": 0,
            "upc": "2",
            "weight": 1000,
          },
          {
            "inStock": true,
            "name": "Chair",
            "price": 54,
            "reviews": [
              {
                "author": {
                  "id": "2",
                  "name": "Alan Turing",
                  "reviews": [
                    {
                      "body": "Could be better.",
                      "id": "3",
                      "product": {
                        "inStock": true,
                        "name": "Chair",
                        "price": 54,
                        "shippingEstimate": 25,
                        "upc": "3",
                        "weight": 50,
                      },
                    },
                    {
                      "body": "Prefer something else.",
                      "id": "4",
                      "product": {
                        "inStock": true,
                        "name": "Table",
                        "price": 899,
                        "shippingEstimate": 50,
                        "upc": "1",
                        "weight": 100,
                      },
                    },
                  ],
                  "username": "@complete",
                },
                "body": "Could be better.",
                "id": "3",
              },
            ],
            "shippingEstimate": 25,
            "upc": "3",
            "weight": 50,
          },
        ],
        "users": [
          {
            "id": "1",
            "name": "Ada Lovelace",
            "reviews": [
              {
                "body": "Love it!",
                "id": "1",
                "product": {
                  "inStock": true,
                  "name": "Table",
                  "price": 899,
                  "reviews": [
                    {
                      "author": {
                        "id": "1",
                        "name": "Ada Lovelace",
                        "reviews": [
                          {
                            "body": "Love it!",
                            "id": "1",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                          {
                            "body": "Too expensive.",
                            "id": "2",
                            "product": {
                              "inStock": false,
                              "name": "Couch",
                              "price": 1299,
                              "shippingEstimate": 0,
                              "upc": "2",
                              "weight": 1000,
                            },
                          },
                        ],
                        "username": "@ada",
                      },
                      "body": "Love it!",
                      "id": "1",
                    },
                    {
                      "author": {
                        "id": "2",
                        "name": "Alan Turing",
                        "reviews": [
                          {
                            "body": "Could be better.",
                            "id": "3",
                            "product": {
                              "inStock": true,
                              "name": "Chair",
                              "price": 54,
                              "shippingEstimate": 25,
                              "upc": "3",
                              "weight": 50,
                            },
                          },
                          {
                            "body": "Prefer something else.",
                            "id": "4",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                        ],
                        "username": "@complete",
                      },
                      "body": "Prefer something else.",
                      "id": "4",
                    },
                  ],
                  "shippingEstimate": 50,
                  "upc": "1",
                  "weight": 100,
                },
              },
              {
                "body": "Too expensive.",
                "id": "2",
                "product": {
                  "inStock": false,
                  "name": "Couch",
                  "price": 1299,
                  "reviews": [
                    {
                      "author": {
                        "id": "1",
                        "name": "Ada Lovelace",
                        "reviews": [
                          {
                            "body": "Love it!",
                            "id": "1",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                          {
                            "body": "Too expensive.",
                            "id": "2",
                            "product": {
                              "inStock": false,
                              "name": "Couch",
                              "price": 1299,
                              "shippingEstimate": 0,
                              "upc": "2",
                              "weight": 1000,
                            },
                          },
                        ],
                        "username": "@ada",
                      },
                      "body": "Too expensive.",
                      "id": "2",
                    },
                  ],
                  "shippingEstimate": 0,
                  "upc": "2",
                  "weight": 1000,
                },
              },
            ],
            "username": "@ada",
          },
          {
            "id": "2",
            "name": "Alan Turing",
            "reviews": [
              {
                "body": "Could be better.",
                "id": "3",
                "product": {
                  "inStock": true,
                  "name": "Chair",
                  "price": 54,
                  "reviews": [
                    {
                      "author": {
                        "id": "2",
                        "name": "Alan Turing",
                        "reviews": [
                          {
                            "body": "Could be better.",
                            "id": "3",
                            "product": {
                              "inStock": true,
                              "name": "Chair",
                              "price": 54,
                              "shippingEstimate": 25,
                              "upc": "3",
                              "weight": 50,
                            },
                          },
                          {
                            "body": "Prefer something else.",
                            "id": "4",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                        ],
                        "username": "@complete",
                      },
                      "body": "Could be better.",
                      "id": "3",
                    },
                  ],
                  "shippingEstimate": 25,
                  "upc": "3",
                  "weight": 50,
                },
              },
              {
                "body": "Prefer something else.",
                "id": "4",
                "product": {
                  "inStock": true,
                  "name": "Table",
                  "price": 899,
                  "reviews": [
                    {
                      "author": {
                        "id": "1",
                        "name": "Ada Lovelace",
                        "reviews": [
                          {
                            "body": "Love it!",
                            "id": "1",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                          {
                            "body": "Too expensive.",
                            "id": "2",
                            "product": {
                              "inStock": false,
                              "name": "Couch",
                              "price": 1299,
                              "shippingEstimate": 0,
                              "upc": "2",
                              "weight": 1000,
                            },
                          },
                        ],
                        "username": "@ada",
                      },
                      "body": "Love it!",
                      "id": "1",
                    },
                    {
                      "author": {
                        "id": "2",
                        "name": "Alan Turing",
                        "reviews": [
                          {
                            "body": "Could be better.",
                            "id": "3",
                            "product": {
                              "inStock": true,
                              "name": "Chair",
                              "price": 54,
                              "shippingEstimate": 25,
                              "upc": "3",
                              "weight": 50,
                            },
                          },
                          {
                            "body": "Prefer something else.",
                            "id": "4",
                            "product": {
                              "inStock": true,
                              "name": "Table",
                              "price": 899,
                              "shippingEstimate": 50,
                              "upc": "1",
                              "weight": 100,
                            },
                          },
                        ],
                        "username": "@complete",
                      },
                      "body": "Prefer something else.",
                      "id": "4",
                    },
                  ],
                  "shippingEstimate": 50,
                  "upc": "1",
                  "weight": 100,
                },
              },
            ],
            "username": "@complete",
          },
        ],
      },
      "extensions": {
        "plan": [
          {
            "query": "query TestQuery {
      users {
        __typename
        ...User
        id
      }
    }

    fragment User on User {
      __typename
      id
      username
      name
    }",
            "subgraphName": "accounts",
            "variables": {},
          },
          {
            "query": "query TestQuery($_v0_representations: [_Any!]!, $_v1_representations: [_Any!]!) {
      _v0__entities: _entities(representations: $_v0_representations) {
        __typename
        ... on Product {
          inStock
          upc
        }
      }
      _v1__entities: _entities(representations: $_v1_representations) {
        __typename
        ... on Product {
          shippingEstimate
          upc
        }
      }
    }",
            "subgraphName": "inventory",
            "variables": {
              "_v0_representations": [
                {
                  "__typename": "Product",
                  "price": 899,
                  "upc": "1",
                  "weight": 100,
                },
                {
                  "__typename": "Product",
                  "price": 1299,
                  "upc": "2",
                  "weight": 1000,
                },
                {
                  "__typename": "Product",
                  "price": 54,
                  "upc": "3",
                  "weight": 50,
                },
              ],
              "_v1_representations": [
                {
                  "__typename": "Product",
                  "price": 899,
                  "upc": "1",
                  "weight": 100,
                },
                {
                  "__typename": "Product",
                  "price": 1299,
                  "upc": "2",
                  "weight": 1000,
                },
                {
                  "__typename": "Product",
                  "price": 54,
                  "upc": "3",
                  "weight": 50,
                },
              ],
            },
          },
          {
            "query": "query TestQuery($first: Int) {
      topProducts(first: $first) {
        __typename
        ...Product
        upc
      }
    }

    fragment Product on Product {
      __typename
      upc
      name
      price
      weight
    }",
            "subgraphName": "products",
            "variables": {
              "first": 5,
            },
          },
          {
            "query": "query TestQuery($representations: [_Any!]!) {
      _entities(representations: $representations) {
        __typename
        ... on Product {
          name
          upc
          price
          weight
        }
      }
    }",
            "subgraphName": "products",
            "variables": {
              "representations": [
                {
                  "__typename": "Product",
                  "upc": "1",
                },
                {
                  "__typename": "Product",
                  "upc": "2",
                },
                {
                  "__typename": "Product",
                  "upc": "3",
                },
              ],
            },
          },
          {
            "query": "query TestQuery($representations: [_Any!]!) {
      _entities(representations: $representations) {
        __typename
        ... on Product {
          reviews {
            __typename
            ...Review
            author {
              username
              __typename
              __typename
              ...User
              reviews {
                __typename
                ...Review
                product {
                  ...Product
                }
                id
              }
              id
            }
            id
          }
          upc
        }
      }
    }

    fragment Product on Product {
      __typename
      upc
    }

    fragment User on User {
      __typename
      id
    }

    fragment Review on Review {
      __typename
      id
      body
    }",
            "subgraphName": "reviews",
            "variables": {
              "representations": [
                {
                  "__typename": "Product",
                  "upc": "1",
                },
                {
                  "__typename": "Product",
                  "upc": "2",
                },
                {
                  "__typename": "Product",
                  "upc": "3",
                },
              ],
            },
          },
          {
            "query": "query TestQuery($representations: [_Any!]!) {
      _entities(representations: $representations) {
        __typename
        ... on User {
          name
          id
        }
      }
    }",
            "subgraphName": "accounts",
            "variables": {
              "representations": [
                {
                  "__typename": "User",
                  "id": "1",
                },
                {
                  "__typename": "User",
                  "id": "2",
                },
              ],
            },
          },
          {
            "query": "query TestQuery($representations: [_Any!]!) {
      _entities(representations: $representations) {
        __typename
        ... on User {
          reviews {
            __typename
            ...Review
            product {
              __typename
              ...Product
              reviews {
                __typename
                ...Review
                author {
                  username
                  __typename
                  __typename
                  ...User
                  reviews {
                    __typename
                    ...Review
                    product {
                      ...Product
                    }
                    id
                  }
                  id
                }
                id
              }
              upc
            }
            id
          }
          id
        }
      }
    }

    fragment User on User {
      __typename
      id
    }

    fragment Product on Product {
      __typename
      upc
    }

    fragment Review on Review {
      __typename
      id
      body
    }",
            "subgraphName": "reviews",
            "variables": {
              "representations": [
                {
                  "__typename": "User",
                  "id": "1",
                },
                {
                  "__typename": "User",
                  "id": "2",
                },
              ],
            },
          },
        ],
      },
    }
  `);
});
