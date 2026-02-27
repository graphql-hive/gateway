import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GraphQLSchema } from 'graphql';
import {
  resolveDescriptions,
  resolveProviders,
  type DescriptionProvider,
  type DescriptionProviderConfig,
  type ProviderRegistry,
} from './description-provider.js';
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

export type MCPToolSource =
  | { type: 'inline'; query: string }
  | { type: 'graphql'; operationName: string; operationType: 'query' | 'mutation'; file?: string };

export interface MCPToolOverrides {
  title?: string;
  description?: string;
  descriptionProvider?: DescriptionProviderConfig;
}

export interface MCPInputOverrides {
  schema?: {
    properties?: Record<string, { description?: string; examples?: unknown[]; default?: unknown }>;
  };
}

export interface MCPToolConfig {
  name: string;
  source: MCPToolSource;
  tool?: MCPToolOverrides;   // metadata overrides
  input?: MCPInputOverrides; // field-level overrides
}

export interface MCPConfig {
  name: string;
  version?: string;
  path?: string;
  graphqlPath?: string;
  operationsPath?: string;
  operationsStr?: string;
  tools: MCPToolConfig[];
  providers?: Record<string, DescriptionProvider | Record<string, unknown>>;
}

export interface ResolvedToolConfig {
  name: string;
  query: string;
  tool?: MCPToolOverrides;
  input?: MCPInputOverrides;
  directiveDescription?: string;
  providerDescription?: string;
}

interface ResolveToolConfigsInput {
  tools: MCPToolConfig[];
  operationsSource?: string;
}

export function resolveToolConfigs(input: ResolveToolConfigsInput): ResolvedToolConfig[] {
  const { tools, operationsSource } = input;
  let parsedOps: ParsedOperation[] | undefined;

  if (operationsSource) {
    parsedOps = loadOperationsFromString(operationsSource);
  }

  // build base configs from @mcpTool directives
  const directiveTools = new Map();
  if (parsedOps) {
    for (const op of parsedOps) {
      if (!op.mcpDirective) continue;
      const toolOverrides: MCPToolOverrides = {};
      if (op.mcpDirective.title) toolOverrides.title = op.mcpDirective.title;
      directiveTools.set(op.mcpDirective.name, {
        name: op.mcpDirective.name,
        query: op.document,
        directiveDescription: op.mcpDirective.description,
        tool: Object.keys(toolOverrides).length > 0 ? toolOverrides : undefined,
      });
    }
  }

  // process explicit tools[] entries
  const configTools = new Map();
  for (const tool of tools) {
    const { source } = tool;
    let query: string;

    if (source.type === 'inline') {
      query = source.query;
    } else {
      const allOps = parsedOps || [];
      const op = resolveOperation(allOps, source.operationName, source.operationType);
      if (!op) {
        throw new Error(
          `Operation "${source.operationName}" (${source.operationType}) not found in loaded operations for tool "${tool.name}"`,
        );
      }
      query = op.document;
    }

    configTools.set(tool.name, { name: tool.name, query, tool: tool.tool, input: tool.input });
  }

  // merge: directive tools as base, config tools overlay (config wins for non-description fields)
  const merged = new Map<string, ResolvedToolConfig>(directiveTools);
  for (const [name, configTool] of configTools) {
    const base = merged.get(name);
    if (base) {
      merged.set(name, {
        name,
        query: configTool.query,
        directiveDescription: base.directiveDescription,
        tool: {
          ...base.tool,
          ...configTool.tool,
        },
        input: configTool.input || base.input,
      });
    } else {
      merged.set(name, configTool);
    }
  }

  return Array.from(merged.values());
}

function loadOperationsSource(config: MCPConfig): string | undefined {
  let operationsSource;

  // Load from top-level operations path
  if (config.operationsPath) {
    const opsPath = resolve(config.operationsPath);
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
        throw new Error(`Cannot read operations from "${config.operationsPath}"`);
      }
    }
  }

  // Load per-tool source files
  for (const tool of config.tools) {
    if (tool.source.type === 'graphql' && tool.source.file) {
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
  const operationsSource = config.operationsStr || loadOperationsSource(config);
  const resolvedTools = resolveToolConfigs({ tools: config.tools, operationsSource });

  // Validate that tools referencing providers have matching entries in config
  for (const tool of resolvedTools) {
    const providerType = tool.tool?.descriptionProvider?.type;
    if (providerType && !config.providers?.[providerType]) {
      throw new Error(`Unknown description provider type: "${providerType}" for tool "${tool.name}"`);
    }
  }

  // Resolved lazily on first use, then cached
  let resolvedProviders: ProviderRegistry | undefined;

  // Tools that use provider descriptions provider always wins over static config
  const providerToolConfigs = resolvedTools.filter(
    (t) => t.tool?.descriptionProvider,
  );

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
          resolveToolDescriptions: providerToolConfigs.length > 0
            ? async () => {
                if (!resolvedProviders) {
                  resolvedProviders = await resolveProviders(config.providers || {});
                }
                const resolved = await resolveDescriptions(providerToolConfigs, resolvedProviders, { isStartup: false });
                const map = new Map();
                for (const tool of resolved) {
                  if (tool.providerDescription) {
                    map.set(tool.name, tool.providerDescription);
                  }
                }
                return map;
              }
            : undefined,
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
