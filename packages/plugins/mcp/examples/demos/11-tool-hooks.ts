// Step 11: Transform tool inputs and outputs with hooks.
//
// Hooks intercept the tool call lifecycle without changing the GraphQL query:
//   preprocess: runs before execution. Return a value to short-circuit (skip GraphQL entirely).
//   postprocess: runs after execution. Transform the result before returning to the MCP client.
//
// This example shows two patterns:
//   1. Preprocess gate: cancel_order requires a confirmation round-trip before executing.
//   2. Postprocess transform: search_docs formats results as a markdown table.
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cancel_order","arguments":{"orderId":"ORD-42"}}}' | jq '.result'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cancel_order","arguments":{"orderId":"ORD-42","confirmationId":"confirm-ORD-42"}}}' | jq '.result'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_docs","arguments":{"q":"billing"}}}' | jq '.result'

import { createServer } from 'node:http';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP } from '@graphql-hive/plugin-mcp';
import { createSchema, createYoga } from 'graphql-yoga';

const mcpOptions = {
  name: 'my-api',
  version: '1.0.0',
  tools: [
    // Pattern 1: Preprocess confirmation gate
    // First call returns a confirmation prompt; second call (with confirmationId) executes the mutation.
    {
      name: 'cancel_order',
      source: {
        type: 'inline',
        query: `mutation CancelOrder($orderId: String!, $confirmationId: String) {
          cancelOrder(orderId: $orderId, confirmationId: $confirmationId) { success message }
        }`,
      },
      tool: {
        title: 'Cancel Order',
        description:
          'Cancel an order. Call once to get a confirmation prompt, then again with confirmationId.',
      },
      output: { path: 'cancelOrder' },
      hooks: {
        preprocess: (args: Record<string, unknown>) => {
          if (!args['confirmationId']) {
            // Short-circuit: return a confirmation prompt without executing the mutation
            return {
              needsConfirmation: true,
              message: `Cancel order "${args['orderId']}"? Call again with confirmationId: "confirm-${args['orderId']}"`,
              confirmationId: `confirm-${args['orderId']}`,
            };
          }
          return undefined; // Continue to GraphQL execution
        },
      },
    },
    // Pattern 2: Postprocess transform
    // The postprocess hook receives the GraphQL result (after output.path extraction) and can reshape it.
    // Here we format search results as a markdown table and add metadata.
    {
      name: 'search_docs',
      source: {
        type: 'inline',
        query: `query SearchDocs($q: String!, $pageSize: Int = 3) {
          search(q: $q, pageSize: $pageSize) { items { path topic description score } }
        }`,
      },
      tool: { title: 'Search Documentation' },
      output: { path: 'search.items' },
      hooks: {
        postprocess: (result: unknown, args: Record<string, unknown>) => {
          const items = result as Array<{
            path: string;
            topic: string;
            description: string;
            score: number;
          }>;
          if (!Array.isArray(items) || items.length === 0) return result;
          const header =
            '| Topic | Description | Score | Link |\n|-------|-------------|-------|------|';
          const rows = items.map(
            (i) => `| ${i.topic} | ${i.description} | ${i.score} | ${i.path} |`,
          );
          // Return a raw MCP result with content array + custom _metadata
          return {
            content: [{ type: 'text', text: `${header}\n${rows.join('\n')}` }],
            _metadata: { query: args['q'], timestamp: Date.now() },
          };
        },
      },
    },
  ],
};

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      search(q: String!, pageSize: Int = 3): SearchResult!
    }
    type Mutation {
      cancelOrder(orderId: String!, confirmationId: String): CancelResult!
    }
    type SearchResult {
      items: [SearchItem!]!
    }
    type SearchItem {
      path: String!
      topic: String!
      description: String!
      score: Float!
    }
    type CancelResult {
      success: Boolean!
      message: String!
    }
  `,
  resolvers: {
    Query: {
      search: (
        _: unknown,
        { q, pageSize = 3 }: { q: string; pageSize?: number },
      ) => ({
        items: Array.from({ length: Math.min(pageSize, 5) }, (_, i) => ({
          path: `/articles/${q.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
          topic: `${q} - Article ${i + 1}`,
          description: `Documentation about ${q} (result ${i + 1})`,
          score: +(1 - i * 0.1).toFixed(2),
        })),
      }),
    },
    Mutation: {
      cancelOrder: (
        _: unknown,
        {
          orderId,
          confirmationId,
        }: { orderId: string; confirmationId?: string },
      ) => {
        if (!confirmationId)
          return { success: false, message: 'Confirmation required' };
        return { success: true, message: `Order ${orderId} cancelled` };
      },
    },
  },
});

const subgraphYoga = createYoga({ schema });
const subgraphServer = createServer(subgraphYoga);
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql');
});

const gateway = createGatewayRuntime({
  proxy: { endpoint: 'http://localhost:4001/graphql' },
  plugins: (ctx) => [useMCP(ctx, mcpOptions)],
});

const gatewayServer = createServer(gateway);
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql');
  console.log('MCP endpoint at http://localhost:4000/mcp');
});
