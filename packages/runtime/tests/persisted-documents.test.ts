import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  getGraphQLWSOptions,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { createClient as createWSClient } from 'graphql-ws';
import { useServer } from 'graphql-ws/use/ws';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { WebSocketServer } from 'ws';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

describe('Persisted Documents', () => {
  const store: Record<string, string> = {
    '1': 'query { foo }',
  };
  const subgraphSchema = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        foo: String
      }
    `),
    resolvers: {
      Query: {
        foo: () => 'bar',
      },
    },
  });

  const subgraphServer = createYoga({
    schema: subgraphSchema,
  });
  
  let gatewayServer: ReturnType<typeof createServer>;
  let wsServer: any;
  let wsUrl: string;
  let gateway: ReturnType<typeof createGatewayRuntime>;
  
  // Use AsyncDisposableStack for proper resource management
  const disposableStack = new AsyncDisposableStack();

  beforeAll(async () => {
    gateway = createGatewayRuntime({
      supergraph: getUnifiedGraphGracefully([
        {
          name: 'foo',
          schema: subgraphSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error
        useCustomFetch(subgraphServer.fetch),
      ],
      persistedDocuments: {
        getPersistedOperation(id) {
          return store[id] || null;
        },
      },
    });

    gatewayServer = createServer(gateway);
    
    // Wait for server to be ready
    await new Promise<void>((resolve) => gatewayServer.listen(0, resolve));
    
    const port = (gatewayServer.address() as AddressInfo).port;
    const graphqlEndpoint = '/graphql';
    wsUrl = `ws://localhost:${port}${graphqlEndpoint}`;

    // Create WebSocket server AFTER the HTTP server is listening
    wsServer = new WebSocketServer({
      path: graphqlEndpoint,
      server: gatewayServer,
    });

    useServer(getGraphQLWSOptions(gateway, () => ({})), wsServer);
    
    // Add cleanup to disposable stack - WebSocket server first
    disposableStack.use({
      [Symbol.asyncDispose]: async () => {
        // Small delay to let pending operations complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (wsServer) {
          await new Promise<void>((resolve) => {
            wsServer.close((err?: Error) => {
              if (err) {
                console.warn('WebSocket server close error:', err);
              }
              resolve();
            });
          });
        }
      }
    });
    
    // Add HTTP server cleanup to disposable stack
    disposableStack.use({
      [Symbol.asyncDispose]: async () => {
        // Small delay before closing HTTP server
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (gatewayServer) {
          await new Promise<void>((resolve) => {
            gatewayServer.close((err?: Error) => {
              if (err) {
                console.warn('HTTP server close error:', err);
              }
              resolve();
            });
          });
        }
      }
    });
  });
  
  afterAll(async () => {
    // Use AsyncDisposableStack for proper cleanup
    await disposableStack.disposeAsync();
  });

  describe('HTTP Tests', () => {
    it('supports Apollo Spec', async () => {
      const response = await gateway.fetch('http://gateway/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: '1',
            },
          },
        }),
      });
      const result = await response.json();
      expect(result).toEqual({
        data: {
          foo: 'bar',
        },
      });
    });

    it('supports Hive spec with JSON body', async () => {
      const response = await gateway.fetch('http://gateway/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: '1',
        }),
      });
      const result = await response.json();
      expect(result).toEqual({
        data: {
          foo: 'bar',
        },
      });
    });

    it('supports Hive spec with GET request', async () => {
      const response = await gateway.fetch(
        'http://gateway/graphql?documentId=1',
        {
          method: 'GET',
        },
      );
      const result = await response.json();
      expect(result).toEqual({
        data: {
          foo: 'bar',
        },
      });
    });

    it('supports `allowArbitraryDocuments` option with custom store', async () => {
      const gatewayWithArbitraryDocs = createGatewayRuntime({
        supergraph: getUnifiedGraphGracefully([
          {
            name: 'foo',
            schema: subgraphSchema,
            url: 'http://localhost:4001/graphql',
          },
        ]),
        plugins: () => [
          // @ts-expect-error
          useCustomFetch(subgraphServer.fetch),
        ],
        persistedDocuments: {
          allowArbitraryDocuments: true,
          getPersistedOperation(id) {
            return store[id] || null;
          },
        },
      });
      const response = await gatewayWithArbitraryDocs.fetch(
        'http://gateway/graphql',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: '{ foo }',
          }),
        },
      );
      const result = await response.json();
      expect(result).toEqual({
        data: {
          foo: 'bar',
        },
      });
    });
  });

  describe('WebSocket Tests', () => {
    it('supports Apollo Spec over WebSocket', async () => {
      const wsClient = createWSClient({
        url: wsUrl,
      });
      
      try {
        await wsClient.subscribe({
          query: '',
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: '1',
            },
          },
        }, {
          next: (value) => {
            expect(value).toEqual({
              data: {
                foo: 'bar',
              },
            });
          },
          error: (err) => {
            throw err;
          },
          complete: () => {},
        });
      } finally {
        wsClient.dispose();
      }
    });

    it('supports Hive spec over WebSocket', async () => {
      const wsClient = createWSClient({
        url: wsUrl,
      });
      
      try {
        await wsClient.subscribe({
          query: '',
          variables: {},
          extensions: {
            documentId: '1',
          },
        }, {
          next: (value) => {
            expect(value).toEqual({
              data: {
                foo: 'bar',
              },
            });
          },
          error: (err) => {
            throw err;
          },
          complete: () => {},
        });
      } finally {
        wsClient.dispose();
      }
    });

    it('supports arbitrary documents with Hive spec over WebSocket', async () => {
      const wsClient = createWSClient({
        url: wsUrl,
      });
      
      try {
        await wsClient.subscribe({
          query: '{ foo }',
          variables: {},
          extensions: {
            documentId: '1',
          },
        }, {
          next: (value) => {
            expect(value).toEqual({
              data: {
                foo: 'bar',
              },
            });
          },
          error: (err) => {
            throw err;
          },
          complete: () => {},
        });
      } finally {
        wsClient.dispose();
      }
    });
  });

  describe('WebSocket Failure Cases', () => {
    describe('Document ID Issues', () => {
      it('should handle missing documentId in extensions', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {},
          }, {
            next: (value) => {
              // Should get a GraphQL error for missing document
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle non-existent documentId', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              documentId: 'non-existent-id',
            },
          }, {
            next: (value) => {
              // Should get an error for non-existent document
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle malformed documentId', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              documentId: null, // malformed - null instead of string
            },
          }, {
            next: (value) => {
              // Should get an error for malformed document ID
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle empty documentId string', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              documentId: '', // empty string
            },
          }, {
            next: (value) => {
              // Should get an error for empty document ID
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });
    });

    describe('PersistedQuery Issues', () => {
      it('should handle invalid persistedQuery format in extensions', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              persistedQuery: {
                version: 'invalid', // should be a number
                // missing sha256Hash
              },
            },
          }, {
            next: (value) => {
              // Should get an error for invalid persisted query format
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle non-existent persistedQuery hash', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: 'non-existent-hash',
              },
            },
          }, {
            next: (value) => {
              // Should get an error for non-existent hash
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle invalid persistedQuery version', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              persistedQuery: {
                version: 2, // unsupported version
                sha256Hash: '1',
              },
            },
          }, {
            next: (value) => {
              // Should get an error for unsupported version
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });
    });

    describe('Configuration Issues', () => {
      it('should handle both query and documentId when allowArbitraryDocuments is false', async () => {
        // The main gateway instance has allowArbitraryDocuments set to false by default
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '{ foo }', // providing both query and documentId
            variables: {},
            extensions: {
              documentId: '1',
            },
          }, {
            next: (value) => {
              // Should get an error when both query and documentId are provided without allowArbitraryDocuments
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });

      it('should handle invalid extensions format', async () => {
        const wsClient = createWSClient({
          url: wsUrl,
        });
        
        try {
          await wsClient.subscribe({
            query: '',
            variables: {},
            extensions: {
              invalidKey: 'invalidValue', // should be an object, not a string
            } as any, // Type assertion to test invalid format
          }, {
            next: (value) => {
              // Should get an error for invalid extensions format
              expect(value).toHaveProperty('errors');
              expect(value.errors).toBeDefined();
              expect(value.errors?.[0]).toHaveProperty('message');
            },
            error: (err) => {
              throw err;
            },
            complete: () => {},
          });
        } finally {
          wsClient.dispose();
        }
      });
    });
  });
});
