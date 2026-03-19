import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { GraphQLSchema } from 'graphql';
import type { LangfuseOptions } from 'langfuse';
import {
  resolveDescriptions,
  resolveFieldDescriptions,
  resolveProviders,
  type DescriptionProvider,
  type DescriptionProviderConfig,
  type DescriptionProviderContext,
  type ProviderRegistry,
} from './description-provider.js';
import { createGraphQLExecutor } from './executor.js';
import {
  loadOperationsFromString,
  resolveOperation,
  type ParsedOperation,
} from './operation-loader.js';
import { createMCPHandler } from './protocol.js';
import type { LangfuseGetPromptOptions } from './providers/langfuse.js';
import { ToolRegistry } from './registry.js';

declare module '@graphql-hive/gateway-runtime' {
  interface GatewayConfigContext {
    dispatchRequest?: (req: Request) => Response | Promise<Response>;
  }
}

export type MCPToolSource =
  | { type: 'inline'; query: string }
  | {
      type: 'graphql';
      operationName: string;
      operationType: 'query' | 'mutation';
      file?: string;
    };

export interface MCPToolOverrides {
  title?: string;
  description?: string;
  descriptionProvider?:
    | {
        type: 'langfuse';
        prompt: string;
        version?: number;
        options?: LangfuseGetPromptOptions;
      }
    | DescriptionProviderConfig;
}

export interface MCPInputOverrides {
  schema?: {
    properties?: Record<
      string,
      {
        description?: string;
        examples?: unknown[];
        default?: unknown;
        alias?: string;
        descriptionProvider?: DescriptionProviderConfig;
      }
    >;
  };
}

export interface MCPOutputOverrides {
  /** Dot-notation path to extract from the GraphQL response data, e.g. "search.items" */
  path?: string;
  /** Set to false to suppress outputSchema in tools/list */
  schema?: false;
}

export interface ToolHookContext {
  toolName: string;
  headers: Record<string, string>;
  query: string;
}

export interface MCPToolHooks {
  /**
   * Called before GraphQL execution. Receives de-aliased arguments
   * (original GraphQL variable names, not MCP alias names).
   * Return a non-undefined value to short-circuit execution and use that value as the tool result.
   * Return undefined (or void) to continue with normal GraphQL execution.
   * When preprocess short-circuits, postprocess is NOT called.
   */
  preprocess?: (
    args: Record<string, unknown>,
    context: ToolHookContext,
  ) => unknown | Promise<unknown>;
  /**
   * Called after GraphQL execution (and output.path extraction) to transform the result.
   * Not called when preprocess short-circuits.
   * When a postprocess hook is registered, the response uses text content
   * instead of structuredContent since the hook may change the result shape.
   */
  postprocess?: (
    result: unknown,
    args: Record<string, unknown>,
    context: ToolHookContext,
  ) => unknown | Promise<unknown>;
}

export interface MCPToolConfig {
  name: string;
  source: MCPToolSource;
  tool?: MCPToolOverrides; // metadata overrides
  input?: MCPInputOverrides; // field-level overrides
  output?: MCPOutputOverrides; // output extraction
  hooks?: MCPToolHooks;
}

export interface MCPConfig {
  name: string;
  version?: string;
  protocolVersion?: string;
  path?: string;
  graphqlPath?: string;
  operationsPath?: string;
  operationsStr?: string;
  tools: MCPToolConfig[];
  providers?: {
    langfuse?: LangfuseOptions & {
      defaults?: Partial<LangfuseGetPromptOptions>;
    };
    [key: string]: DescriptionProvider | Record<string, unknown> | undefined;
  };
  suppressOutputSchema?: boolean;
  disableGraphQLEndpoint?: boolean;
}

export interface ResolvedToolConfig {
  name: string;
  query: string;
  tool?: MCPToolOverrides;
  input?: MCPInputOverrides;
  output?: MCPOutputOverrides;
  hooks?: MCPToolHooks;
  directiveDescription?: string;
  providerDescription?: string;
}

/**
 * Parse a directive descriptionProvider string into a DescriptionProviderConfig.
 * Format: "type:prompt" or "type:prompt:version"
 * Example: "langfuse:my_prompt" or "langfuse:my_prompt:3"
 */
function parseDescriptionProviderDirective(
  value: string,
): DescriptionProviderConfig {
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid descriptionProvider directive format: "${value}". Expected "type:prompt" or "type:prompt:version" (e.g., "langfuse:my_prompt" or "langfuse:my_prompt:3")`,
    );
  }
  const [type, prompt, versionStr] = parts;
  if (parts.length === 3 && !versionStr) {
    throw new Error(
      `Invalid descriptionProvider directive format: "${value}". Trailing colon with no version. Expected "type:prompt" or "type:prompt:version".`,
    );
  }
  const config: DescriptionProviderConfig = { type, prompt };
  if (versionStr) {
    const version = Number(versionStr);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        `Invalid version "${versionStr}" in descriptionProvider directive "${value}". Version must be a positive integer.`,
      );
    }
    config['version'] = version;
  }
  return config;
}

interface ResolveToolConfigsInput {
  tools: MCPToolConfig[];
  operationsSource?: string;
}

export function resolveToolConfigs(
  input: ResolveToolConfigsInput,
): ResolvedToolConfig[] {
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
      if (op.mcpDirective.descriptionProvider) {
        toolOverrides.descriptionProvider = parseDescriptionProviderDirective(
          op.mcpDirective.descriptionProvider,
        );
      }
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
      const opsPool = source.file
        ? loadOperationsFromString(readFileSync(resolve(source.file), 'utf-8'))
        : parsedOps || [];
      const op = resolveOperation(
        opsPool,
        source.operationName,
        source.operationType,
      );
      if (!op) {
        throw new Error(
          `Operation "${source.operationName}" (${source.operationType}) not found in loaded operations for tool "${tool.name}"`,
        );
      }
      query = op.document;
    }

    configTools.set(tool.name, {
      name: tool.name,
      query,
      tool: tool.tool,
      input: tool.input,
      output: tool.output,
      hooks: tool.hooks,
    });
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
        output: configTool.output || base.output,
        hooks: configTool.hooks || base.hooks,
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
        throw new Error(
          `Cannot read operations from "${config.operationsPath}"`,
        );
      }
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
  const resolvedTools = resolveToolConfigs({
    tools: config.tools,
    operationsSource,
  });

  // Validate that tools referencing providers have matching entries in config
  for (const tool of resolvedTools) {
    const providerType = tool.tool?.descriptionProvider?.type;
    if (providerType && !config.providers?.[providerType]) {
      throw new Error(
        `Unknown description provider type: "${providerType}" for tool "${tool.name}"`,
      );
    }
    // Validate field-level providers
    if (tool.input?.schema?.properties) {
      for (const [fieldName, fieldOverrides] of Object.entries(
        tool.input.schema.properties,
      )) {
        const fieldProviderType = fieldOverrides.descriptionProvider?.type;
        if (fieldProviderType && !config.providers?.[fieldProviderType]) {
          throw new Error(
            `Unknown description provider type: "${fieldProviderType}" for tool "${tool.name}" field "${fieldName}"`,
          );
        }
      }
    }
  }

  // Resolved lazily on first use, then cached
  let resolvedProviders: ProviderRegistry | undefined;

  // Tools that use provider descriptions (provider wins over config)
  const providerToolConfigs = resolvedTools.filter(
    (t) => t.tool?.descriptionProvider,
  );

  // Tools that have per-field description providers
  const fieldProviderToolConfigs = resolvedTools.filter((t) =>
    Object.values(t.input?.schema?.properties || {}).some(
      (p) => p.descriptionProvider,
    ),
  );

  const internalRequests = new WeakSet<Request>();

  return {
    onSchemaChange({ schema: newSchema }) {
      schema = newSchema;
      registry = new ToolRegistry(resolvedTools, newSchema);
    },

    onRequest({ request, url, endResponse, serverContext }) {
      // Block external GraphQL access when disableGraphQLEndpoint is set
      if (
        config.disableGraphQLEndpoint &&
        url.pathname === graphqlPath &&
        !internalRequests.has(request)
      ) {
        endResponse(new Response(null, { status: 404 }));
        return;
      }

      if (url.pathname !== mcpPath) {
        return;
      }

      if (!serverContext.dispatchRequest) {
        endResponse(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32000,
                message:
                  'MCP plugin requires dispatchRequest in server context. Ensure it is used within createGatewayRuntime.',
              },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        return;
      }

      const graphqlEndpoint = `${url.protocol}//${url.host}${graphqlPath}`;
      const dispatch = (url: string, init: RequestInit) => {
        const req = new Request(url, init);
        if (config.disableGraphQLEndpoint) internalRequests.add(req);
        return serverContext.dispatchRequest!(req);
      };

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
                headers: {
                  'Content-Type': 'application/json',
                  'x-mcp-internal': '1',
                },
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

        const rawPromptLabel = url.searchParams.get('promptLabel');
        const promptLabel =
          rawPromptLabel &&
          rawPromptLabel.length <= 256 &&
          /^[\w-]+$/.test(rawPromptLabel)
            ? rawPromptLabel
            : undefined;
        if (rawPromptLabel && !promptLabel) {
          console.warn(
            `[MCP] Invalid "promptLabel" query parameter ignored. Must be alphanumeric/hyphens/underscores, max 256 chars.`,
          );
        }
        if (
          promptLabel &&
          providerToolConfigs.length === 0 &&
          fieldProviderToolConfigs.length === 0
        ) {
          console.warn(
            `[MCP] "promptLabel" query parameter was provided but no tools use description providers. The parameter has no effect.`,
          );
        }
        const providerContext: DescriptionProviderContext | undefined =
          promptLabel ? { label: promptLabel } : undefined;

        // Extract headers once for both requestContext and execute
        const forwardedHeaders: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          if (
            key !== 'host' &&
            key !== 'content-type' &&
            key !== 'content-length'
          ) {
            forwardedHeaders[key] = value;
          }
        });

        const handler = createMCPHandler({
          serverName: config.name,
          serverVersion: config.version || '1.0.0',
          protocolVersion: config.protocolVersion,
          suppressOutputSchema: config.suppressOutputSchema,
          registry,
          requestContext: {
            headers: forwardedHeaders,
          },
          resolveToolDescriptions:
            providerToolConfigs.length > 0
              ? async () => {
                  if (!resolvedProviders) {
                    resolvedProviders = await resolveProviders(
                      config.providers || {},
                    );
                  }
                  const resolved = await resolveDescriptions(
                    providerToolConfigs,
                    resolvedProviders,
                    { isStartup: false, context: providerContext },
                  );
                  const map = new Map();
                  for (const tool of resolved) {
                    if (tool.providerDescription) {
                      map.set(tool.name, tool.providerDescription);
                    }
                  }
                  return map;
                }
              : undefined,
          resolveFieldDescriptions:
            fieldProviderToolConfigs.length > 0
              ? async () => {
                  if (!resolvedProviders) {
                    resolvedProviders = await resolveProviders(
                      config.providers || {},
                    );
                  }
                  const fieldDescs = await resolveFieldDescriptions(
                    fieldProviderToolConfigs,
                    resolvedProviders,
                    { isStartup: false, context: providerContext },
                  );
                  // Remap original field names to alias names
                  for (const tool of fieldProviderToolConfigs) {
                    const toolDescs = fieldDescs.get(tool.name);
                    if (!toolDescs) continue;
                    const aliases = tool.input?.schema?.properties;
                    if (!aliases) continue;
                    for (const [origName, overrides] of Object.entries(
                      aliases,
                    )) {
                      if (overrides.alias && toolDescs.has(origName)) {
                        const desc = toolDescs.get(origName)!;
                        toolDescs.delete(origName);
                        toolDescs.set(overrides.alias, desc);
                      }
                    }
                  }
                  return fieldDescs;
                }
              : undefined,
          execute: async (toolName, args) => {
            return execute(toolName, args, { headers: forwardedHeaders });
          },
        });

        return handler(request).then((response) => {
          endResponse(response);
        });
      });
    },
  };
}
