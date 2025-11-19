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
      id
      username
      name
    }",
            "subgraphName": "accounts",
            "variables": {},
          },
          {
            "query": "query TestQuery($_args__entities_representations: [_Any!]!) {
      _entities(representations: $_args__entities_representations) {
        __typename
        ... on Product {
          upc
          name
          price
          price
          weight
          weight
        }
      }
    }",
            "subgraphName": "products",
            "variables": {
              "_args__entities_representations": [
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
            "query": "query TestQuery($_args__entities_representations: [_Any!]!) {
      _entities(representations: $_args__entities_representations) {
        __typename
        ... on Product {
          upc
          reviews {
            __typename
            ...Review
            id
            author {
              username
              __typename
              __typename
              ...User
              id
              reviews {
                __typename
                ...Review
                id
                product {
                  ...Product
                }
              }
            }
          }
        }
      }
    }

    fragment Product on Product {
      __typename
      upc
      upc
    }

    fragment User on User {
      __typename
      id
      id
    }

    fragment Review on Review {
      __typename
      id
      id
      body
    }",
            "subgraphName": "reviews",
            "variables": {
              "_args__entities_representations": [
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
            "query": "query TestQuery($_args__entities_representations: [_Any!]!) {
      _entities(representations: $_args__entities_representations) {
        __typename
        ... on User {
          id
          name
        }
      }
    }",
            "subgraphName": "accounts",
            "variables": {
              "_args__entities_representations": [
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
            "query": "query TestQuery($_args__entities_representations: [_Any!]!) {
      _entities(representations: $_args__entities_representations) {
        __typename
        ... on User {
          id
          reviews {
            __typename
            ...Review
            id
            product {
              __typename
              ...Product
              upc
              reviews {
                __typename
                ...Review
                id
                author {
                  username
                  __typename
                  __typename
                  ...User
                  id
                  reviews {
                    __typename
                    ...Review
                    id
                    product {
                      ...Product
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    fragment User on User {
      __typename
      id
      id
    }

    fragment Product on Product {
      __typename
      upc
      upc
    }

    fragment Review on Review {
      __typename
      id
      id
      body
    }",
            "subgraphName": "reviews",
            "variables": {
              "_args__entities_representations": [
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
            "query": "query TestQuery($_args_topProducts_first: Int) {
      topProducts(first: $_args_topProducts_first) {
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
      price
      weight
      upc
      weight
    }",
            "subgraphName": "products",
            "variables": {
              "_args_topProducts_first": 5,
            },
          },
          {
            "query": "query TestQuery($_v0__args__entities_representations: [_Any!]!, $_v1__args__entities_representations: [_Any!]!) {
      _v0__entities: _entities(representations: $_v0__args__entities_representations) {
        __typename
        ... on Product {
          upc
          inStock
        }
      }
      _v1__entities: _entities(representations: $_v1__args__entities_representations) {
        __typename
        ... on Product {
          upc
          shippingEstimate
        }
      }
    }",
            "subgraphName": "inventory",
            "variables": {
              "_v0__args__entities_representations": [
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
              "_v1__args__entities_representations": [
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
        ],
      },
    }
  `);
});
