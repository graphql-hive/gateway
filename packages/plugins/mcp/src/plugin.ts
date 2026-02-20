import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { GraphQLSchema } from 'graphql';
import { createGraphQLExecutor } from './executor.js';
import { createMCPHandler } from './protocol.js';
import { ToolRegistry } from './registry.js';

declare module '@graphql-hive/gateway-runtime' {
  interface GatewayConfigContext {
    dispatchRequest?: (req: Request) => Response | Promise<Response>;
  }
}

export interface MCPToolSource {
  type: 'graphql';
  operationName: string;
  operationType: 'query' | 'mutation';
  file?: string; // per-tool file override
}

export interface MCPToolOverrides {
  title?: string;
  description?: string;
}

export interface MCPInputOverrides {
  schema?: {
    properties?: Record<string, { description?: string; examples?: unknown[]; default?: unknown }>;
  };
}

export interface MCPToolConfig {
  name: string;
  description?: string;
  query?: string;            // inline query
  source?: MCPToolSource;    // file-based operation lookup
  tool?: MCPToolOverrides;   // metadata overrides
  input?: MCPInputOverrides; // field-level overrides
}

export interface MCPConfig {
  name: string;
  version?: string;
  path?: string;
  graphqlPath?: string;
  operations?: string; // glob or file path for .graphql files
  tools: MCPToolConfig[];
}

export function useMCP(config: MCPConfig): GatewayPlugin {
  const mcpPath = config.path || '/mcp';
  const graphqlPath = config.graphqlPath || '/graphql';
  let registry: ToolRegistry | null = null;
  let schema: GraphQLSchema | null = null;
  let schemaLoadingPromise: Promise<void> | null = null;

  return {
    onSchemaChange({ schema: newSchema }) {
      schema = newSchema;
      registry = new ToolRegistry(config.tools, newSchema);
    },

    onRequest({ request, url, endResponse, serverContext }) {
      if (url.pathname !== mcpPath) {
        return;
      }

      const graphqlEndpoint = `${url.protocol}//${url.host}${graphqlPath}`;
      const dispatch = (url: string, init: RequestInit) =>
        serverContext.dispatchRequest!(new Request(url, init));

      // Trigger schema introspection if not loaded
      const ensureSchema = async (): Promise<boolean> => {
        if (registry && schema) {
          return true;
        }

        // Avoid multiple concurrent introspection requests
        if (!schemaLoadingPromise) {
          schemaLoadingPromise = (async () => {
            try {
              await dispatch(graphqlEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '{ __typename }' }),
              });
            } finally {
              schemaLoadingPromise = null;
            }
          })();
        }

        await schemaLoadingPromise;
        return !!(registry && schema);
      };

      return ensureSchema().then((ready) => {
        if (!ready || !registry || !schema) {
          endResponse(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32000,
                  message: 'MCP server not ready. Schema introspection failed.',
                },
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
          return;
        }

        const execute = createGraphQLExecutor(
          registry,
          graphqlEndpoint,
          dispatch,
        );

        const handler = createMCPHandler({
          serverName: config.name,
          serverVersion: config.version || '1.0.0',
          registry,
          execute: async (toolName, args) => {
            const headers: Record<string, string> = {};
            const auth = request.headers.get('authorization');
            if (auth) {
              headers['authorization'] = auth;
            }
            return execute(toolName, args, { headers });
          },
        });

        return handler(request).then((response) => {
          endResponse(response);
        });
      });
    },
  };
}
