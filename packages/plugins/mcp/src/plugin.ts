import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { ExecutionResult, GraphQLSchema } from 'graphql';
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
import {
  loadOperationsFromString,
  resolveOperation,
  type ParsedOperation,
} from './operation-loader.js';
import {
  dealiasArgs,
  formatToolCallResult,
  handleMCPRequest,
  processExecutionResult,
  type JsonRpcRequest,
  type MCPHandlerOptions,
} from './protocol.js';
import type { LangfuseGetPromptOptions } from './providers/langfuse.js';
import { ToolRegistry, type RegisteredTool } from './registry.js';

interface MCPToolCallContext {
  jsonrpcId: number | string;
  toolName: string;
  args: Record<string, unknown>;
  tool: RegisteredTool;
  headers: Record<string, string>;
}

export type MCPToolSource =
  | { type: 'inline'; query: string }
  | {
      type: 'graphql';
      operationName: string;
      operationType: 'query' | 'mutation';
      file?: string;
    };

export interface MCPToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: string;
}

export interface MCPToolExecution {
  taskSupport?: 'forbidden' | 'optional' | 'required';
}

export interface MCPToolOverrides {
  title?: string;
  description?: string;
  annotations?: MCPToolAnnotations;
  icons?: MCPIcon[];
  execution?: MCPToolExecution;
  _meta?: Record<string, unknown>;
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

export interface MCPContentAnnotations {
  audience?: Array<'user' | 'assistant'>;
  priority?: number;
  lastModified?: string;
}

export interface MCPOutputOverrides {
  /** Dot-notation path to extract from the GraphQL response data, e.g. "search.items" */
  path?: string;
  /** Set to false to suppress outputSchema in tools/list */
  schema?: false;
  /** Annotations to attach to content items in tool responses (audience, priority) */
  contentAnnotations?: MCPContentAnnotations;
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
   *
   * To return a raw MCP result, return an object with a `content` array of MCP content items
   * (each with `type: "text" | "image" | "audio" | "resource" | "resource_link"`). This will be passed through directly
   * as the MCP response, allowing custom fields like `_metadata` or `isError`.
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
   *
   * To return a raw MCP result, return an object with a `content` array of MCP content items
   * (each with `type: "text" | "image" | "audio" | "resource" | "resource_link"`). This will be passed through directly
   * as the MCP response, allowing custom fields like `_metadata` or `isError`.
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
  title?: string;
  description?: string;
  icons?: MCPIcon[];
  websiteUrl?: string;
  instructions?: string;
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
  if (!config.operationsPath) return undefined;

  const opsPath = resolve(config.operationsPath);
  let stat;
  try {
    stat = statSync(opsPath);
  } catch (err) {
    throw new Error(
      `Cannot access operations path "${config.operationsPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (stat.isFile()) {
    return readFileSync(opsPath, 'utf-8');
  }

  if (stat.isDirectory()) {
    const files = readdirSync(opsPath).filter((f) => f.endsWith('.graphql'));
    if (files.length === 0) {
      throw new Error(
        `Operations directory "${config.operationsPath}" contains no .graphql files`,
      );
    }
    return files.map((f) => readFileSync(join(opsPath, f), 'utf-8')).join('\n');
  }

  throw new Error(
    `Operations path "${config.operationsPath}" is neither a file nor a directory`,
  );
}

export function useMCP(config: MCPConfig): GatewayPlugin {
  const mcpPath = config.path || '/mcp';
  const graphqlPath = config.graphqlPath || '/graphql';
  let registry: ToolRegistry | null = null;
  let schema: GraphQLSchema | null = null;

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
  const mcpToolCalls = new WeakMap<Request, MCPToolCallContext>();
  let mcpHandlerOptions: MCPHandlerOptions | null = null;

  function buildHandlerOptions(): MCPHandlerOptions {
    return {
      serverName: config.name,
      serverVersion: config.version || '1.0.0',
      serverTitle: config.title,
      serverDescription: config.description,
      serverIcons: config.icons,
      serverWebsiteUrl: config.websiteUrl,
      instructions: config.instructions,
      protocolVersion: config.protocolVersion,
      suppressOutputSchema: config.suppressOutputSchema,
      registry: registry!,
      resolveToolDescriptions:
        providerToolConfigs.length > 0
          ? async (ctx) => {
              if (!resolvedProviders) {
                resolvedProviders = await resolveProviders(
                  config.providers || {},
                );
              }
              const resolved = await resolveDescriptions(
                providerToolConfigs,
                resolvedProviders,
                { isStartup: false, context: ctx },
              );
              const map = new Map<string, string>();
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
          ? async (ctx) => {
              if (!resolvedProviders) {
                resolvedProviders = await resolveProviders(
                  config.providers || {},
                );
              }
              const fieldDescs = await resolveFieldDescriptions(
                fieldProviderToolConfigs,
                resolvedProviders,
                { isStartup: false, context: ctx },
              );
              for (const tool of fieldProviderToolConfigs) {
                const toolDescs = fieldDescs.get(tool.name);
                if (!toolDescs) continue;
                const aliases = tool.input?.schema?.properties;
                if (!aliases) continue;
                for (const [origName, overrides] of Object.entries(aliases)) {
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
      execute: () => {
        throw new Error(
          'tools/call must be routed through the Yoga hook pipeline. ' +
            'Ensure the MCP plugin is registered as a gateway plugin.',
        );
      },
    };
  }

  function mcpErrorResponse(id: number | string, message: string) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  return {
    onSchemaChange({ schema: newSchema }) {
      schema = newSchema;
      registry = new ToolRegistry(resolvedTools, newSchema);
      mcpHandlerOptions = buildHandlerOptions();
    },

    async onRequest({
      request,
      url,
      endResponse,
      setRequest,
      requestHandler,
      serverContext,
    }) {
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

      // Schema bootstrap: one-time dispatch to trigger schema loading
      if (!registry || !schema) {
        try {
          const bootstrapReq = new Request(`http://localhost${graphqlPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
          });
          if (config.disableGraphQLEndpoint) internalRequests.add(bootstrapReq);
          await requestHandler(bootstrapReq, serverContext);
        } catch (bootstrapError) {
          console.error(
            `[MCP] Schema bootstrap failed:`,
            bootstrapError instanceof Error
              ? bootstrapError.message
              : bootstrapError,
          );
        }

        if (!registry || !schema) {
          endResponse(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32000,
                  message: 'MCP server not ready. Schema loading failed.',
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
      }

      // Parse JSON-RPC body
      let bodyText: string;
      let body: JsonRpcRequest;
      try {
        bodyText = await request.text();
        body = JSON.parse(bodyText);
      } catch (parseError) {
        console.warn(
          `[MCP] Failed to parse JSON-RPC request body:`,
          parseError instanceof Error ? parseError.message : parseError,
        );
        endResponse(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error: Invalid JSON' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        return;
      }

      // tools/call: route through Yoga's pipeline via onRequestParse -> execute -> onResultProcess
      if (body.method === 'tools/call') {
        if (
          !body.params ||
          typeof body.params !== 'object' ||
          Array.isArray(body.params)
        ) {
          endResponse(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                error: {
                  code: -32602,
                  message:
                    'Invalid params: expected an object with "name" field',
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
          );
          return;
        }

        const callParams = body.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const tool = registry.getTool(callParams.name);

        if (!tool) {
          endResponse(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                error: {
                  code: -32602,
                  message: `Unknown tool: ${callParams.name}`,
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
          );
          return;
        }

        const args = dealiasArgs(
          callParams.arguments || {},
          tool.argumentAliases,
        );

        // Extract forwarded headers
        const forwardedHeaders: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          forwardedHeaders[key] = value;
        });

        const hookContext: ToolHookContext = {
          toolName: callParams.name,
          headers: forwardedHeaders,
          query: tool.query,
        };

        // Preprocess hook can short-circuit execution
        if (tool.hooks?.preprocess) {
          try {
            const preprocessResult = await tool.hooks.preprocess(
              args,
              hookContext,
            );
            if (preprocessResult !== undefined) {
              const callResult = formatToolCallResult(preprocessResult, tool, {
                hookProducedResult: true,
                hasHooks: true,
              });
              endResponse(
                new Response(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id,
                    result: callResult,
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              );
              return;
            }
          } catch (hookError) {
            console.error(
              `[MCP] tools/call failed for tool "${callParams.name}":`,
              `preprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
            );
            endResponse(
              new Response(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id,
                  result: {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify({
                          error: `preprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
                        }),
                      },
                    ],
                    isError: true,
                  },
                }),
                { headers: { 'Content-Type': 'application/json' } },
              ),
            );
            return;
          }
        }

        // Normal path: rewrite request to /graphql and let Yoga execute
        const graphqlUrl = `${url.protocol}//${url.host}${graphqlPath}`;
        const newRequest = new Request(graphqlUrl, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({ query: tool.query, variables: args }),
        });

        if (config.disableGraphQLEndpoint) internalRequests.add(newRequest);
        mcpToolCalls.set(newRequest, {
          jsonrpcId: body.id,
          toolName: callParams.name,
          args,
          tool,
          headers: forwardedHeaders,
        });

        setRequest(newRequest);
        return; // Don't endResponse, request flows to onRequestParse
      }

      // All other MCP methods (initialize, tools/list, etc.)
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

      const result = await handleMCPRequest(
        body,
        mcpHandlerOptions!,
        providerContext,
      );

      if (result === null) {
        // notifications/initialized: no response
        endResponse(new Response(null, { status: 204 }));
      } else {
        endResponse(
          new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    },

    // Transform GraphQL execution result into MCP JSON-RPC response
    onResultProcess({ request, setResultProcessor }: any) {
      const ctx = mcpToolCalls.get(request);
      if (!ctx) return;

      mcpToolCalls.delete(request);

      setResultProcessor(async (executionResult: unknown) => {
        try {
          // Validate execution result shape
          if (
            executionResult == null ||
            typeof executionResult !== 'object' ||
            Array.isArray(executionResult)
          ) {
            console.error(
              `[MCP] Unexpected execution result for tool "${ctx.toolName}":`,
              typeof executionResult,
            );
            return mcpErrorResponse(
              ctx.jsonrpcId,
              'Unexpected execution result format',
            );
          }

          const execResult = executionResult as ExecutionResult;

          // Check for GraphQL errors
          if (execResult.errors?.length) {
            const errorMessage =
              (execResult.errors[0] as { message?: string })?.message ||
              'GraphQL execution error';
            console.error(
              `[MCP] tools/call failed for tool "${ctx.toolName}":`,
              errorMessage,
            );
            return mcpErrorResponse(ctx.jsonrpcId, errorMessage);
          }

          // Post-execution: output.path, postprocess, format
          const response = await processExecutionResult({
            id: ctx.jsonrpcId,
            toolName: ctx.toolName,
            args: ctx.args,
            tool: ctx.tool,
            data: execResult.data,
            headers: ctx.headers,
          });

          return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error(
            `[MCP] tools/call result processing failed for tool "${ctx.toolName}":`,
            error instanceof Error ? error.message : error,
          );
          return mcpErrorResponse(
            ctx.jsonrpcId,
            error instanceof Error ? error.message : String(error),
          );
        }
      }, 'application/json');
    },
  };
}
