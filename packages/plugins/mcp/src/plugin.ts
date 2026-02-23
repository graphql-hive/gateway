import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GraphQLSchema } from 'graphql';
import { createGraphQLExecutor } from './executor.js';
import {
  loadOperationsFromString,
  resolveOperation,
  type ParsedOperation,
} from './operation-loader.js';
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

interface ResolveToolConfigsInput {
  tools: MCPToolConfig[];
  operationsSource?: string;
}

export function resolveToolConfigs(input: ResolveToolConfigsInput): MCPToolConfig[] {
  const { tools, operationsSource } = input;
  let parsedOps: ParsedOperation[] | undefined;

  if (operationsSource) {
    parsedOps = loadOperationsFromString(operationsSource);
  }

  return tools.map((tool) => {
    if (tool.source) {
      const allOps = parsedOps || [];
      const op = resolveOperation(allOps, tool.source.operationName, tool.source.operationType);
      if (!op) {
        throw new Error(
          `Operation "${tool.source.operationName}" (${tool.source.operationType}) not found in loaded operations for tool "${tool.name}"`,
        );
      }
      return { ...tool, query: op.document };
    }

    if (tool.query) {
      return tool;
    }

    throw new Error(
      `Tool "${tool.name}" must have either "query" or "source" defined`,
    );
  });
}

function loadOperationsSource(config: MCPConfig): string | undefined {
  let operationsSource;

  // Load from top-level operations path
  if (config.operations) {
    const opsPath = resolve(config.operations);
    try {
      const stat = readFileSync(opsPath);
      // If it's a file, read it directly
      operationsSource = stat.toString('utf-8');
    } catch {
      // Try as directory
      try {
        const files = readdirSync(opsPath)
          .filter((f) => f.endsWith('.graphql'))
          .map((f) => readFileSync(join(opsPath, f), 'utf-8'));
        operationsSource = files.join('\n');
      } catch {
        throw new Error(`Cannot read operations from "${config.operations}"`);
      }
    }
  }

  // Load per-tool source files
  for (const tool of config.tools) {
    if (tool.source?.file) {
      const fileContent = readFileSync(resolve(tool.source.file), 'utf-8');
      operationsSource = (operationsSource || '') + '\n' + fileContent;
    }
  }

  return operationsSource;
}

export function useMCP(config: MCPConfig): GatewayPlugin {
  const mcpPath = config.path || '/mcp';
  const graphqlPath = config.graphqlPath || '/graphql';
  let registry: ToolRegistry | null = null;
  let schema: GraphQLSchema | null = null;
  let schemaLoadingPromise: Promise<void> | null = null;

  // Resolve operations from files at startup
  const operationsSource = loadOperationsSource(config);
  const resolvedTools = resolveToolConfigs({ tools: config.tools, operationsSource });

  return {
    onSchemaChange({ schema: newSchema }) {
      schema = newSchema;
      registry = new ToolRegistry(resolvedTools, newSchema);
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
