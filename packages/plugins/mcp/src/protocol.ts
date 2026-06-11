import type { ExecutionResult, GraphQLSchema } from 'graphql';
import type { DescriptionProviderContext } from './description-provider.js';
import {
  MCPMethodError,
  type MCPGraphQLOperation,
  type MCPMethodContext,
  type MCPMethodHandler,
  type MCPMethodTransport,
} from './method-handler.js';
import type {
  MCPIcon,
  ResolvedResource,
  ResolvedResourceTemplate,
  ToolHookContext,
} from './plugin.js';
import {
  getByPath,
  type RegisteredTool,
  type ToolRegistry,
} from './registry.js';
import type { JsonSchema } from './schema-converter.js';
import type { PluginContext } from './types.js';

export function dealiasArgs(
  args: Record<string, unknown>,
  aliases?: Record<string, string>,
): Record<string, unknown> {
  if (!aliases) return args;
  const dealiased: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    dealiased[aliases[key] || key] = value;
  }
  return dealiased;
}

export async function processExecutionResult(
  ctx: PluginContext,
  options: {
    id: number | string | null;
    toolName: string;
    args: Record<string, unknown>;
    tool: RegisteredTool;
    data: unknown;
    headers: Record<string, string>;
  },
): Promise<{
  jsonrpc: '2.0';
  id: number | string | null;
  result: Record<string, unknown>;
}> {
  const { tool } = options;

  try {
    let data = options.data;

    // Apply output.path extraction
    if (tool.outputPath) {
      const extracted = getByPath(data, tool.outputPath);
      if (extracted === undefined && data !== undefined) {
        ctx.log.error(
          `output.path "${tool.outputPath}" resolved to undefined for tool "${options.toolName}". ` +
            `Check your output.path configuration.`,
        );
        return {
          jsonrpc: '2.0',
          id: options.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `output.path "${tool.outputPath}" could not extract data from the result`,
                }),
              },
            ],
            isError: true,
          },
        };
      }
      data = extracted ?? null;
    }

    // Postprocess hook
    const hasHooks = !!tool.hooks?.preprocess || !!tool.hooks?.postprocess;
    let hookProducedResult = false;
    if (tool.hooks?.postprocess) {
      try {
        const hookContext: ToolHookContext = {
          toolName: options.toolName,
          headers: options.headers,
          query: tool.query,
        };
        data = await tool.hooks.postprocess(data, options.args, hookContext);
        hookProducedResult = true;
      } catch (hookError) {
        throw new Error(
          `postprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
        );
      }
    }

    return {
      jsonrpc: '2.0',
      id: options.id,
      result: formatToolCallResult(ctx, data, tool, {
        hookProducedResult,
        hasHooks,
      }),
    };
  } catch (error) {
    ctx.log.error(
      `tools/call failed for tool "${options.toolName}":`,
      error instanceof Error ? error.message : error,
    );
    return {
      jsonrpc: '2.0',
      id: options.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      },
    };
  }
}

export function formatToolCallResult(
  ctx: PluginContext,
  result: unknown,
  tool: RegisteredTool,
  opts: { hookProducedResult: boolean; hasHooks: boolean },
): Record<string, unknown> {
  const isMCPResult = opts.hookProducedResult && looksLikeMCPResult(result);
  if (isMCPResult) {
    return { isError: false, ...(result as Record<string, unknown>) };
  }
  let textValue: string;
  let serializationFailed = false;
  try {
    textValue = JSON.stringify(result ?? null, null, 2);
  } catch (err) {
    serializationFailed = true;
    ctx.log.error(
      `Failed to serialize tool result for "${tool.name}":`,
      err instanceof Error ? err.message : String(err),
    );
    textValue = JSON.stringify({
      error: 'Result could not be serialized to JSON',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  const textItem: Record<string, unknown> = {
    type: 'text',
    text: textValue,
  };
  if (tool.contentAnnotations)
    textItem['annotations'] = tool.contentAnnotations;
  const textContent = { content: [textItem], isError: false };
  return tool.outputSchema && !opts.hasHooks && !serializationFailed
    ? { structuredContent: result, ...textContent }
    : textContent;
}

/**
 * Check if a value looks like a raw MCP CallToolResult (object with a valid `content` array).
 * Each content item must have a `type` field matching a known MCP content type
 * and the required fields for that type per the MCP spec.
 */
export function looksLikeMCPResult(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const content = (value as Record<string, unknown>)['content'];
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const rec = item as Record<string, unknown>;
    const type = rec['type'];
    if (type === 'text') return typeof rec['text'] === 'string';
    if (type === 'image')
      return (
        typeof rec['data'] === 'string' && typeof rec['mimeType'] === 'string'
      );
    if (type === 'audio')
      return (
        typeof rec['data'] === 'string' && typeof rec['mimeType'] === 'string'
      );
    if (type === 'resource') {
      const resource = rec['resource'];
      return (
        typeof resource === 'object' &&
        resource !== null &&
        !Array.isArray(resource) &&
        typeof (resource as Record<string, unknown>)['uri'] === 'string'
      );
    }
    if (type === 'resource_link')
      return typeof rec['uri'] === 'string' && typeof rec['name'] === 'string';
    return false;
  });
}

export interface MCPHandlerOptions {
  serverName: string;
  serverVersion: string;
  serverTitle?: string;
  serverDescription?: string;
  serverIcons?: MCPIcon[];
  serverWebsiteUrl?: string;
  instructions?: string;
  protocolVersion?: string;
  suppressOutputSchema?: boolean;
  /** Page size for tools/list pagination. Defaults to returning all tools (no pagination). */
  toolsListPageSize?: number;
  registry: ToolRegistry;
  resolveToolDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, string>>;
  /** Resolve per-field descriptions from providers. Returns toolName -> fieldName -> description. */
  resolveFieldDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, Map<string, string>>>;
  /** Resolve per-output-field descriptions from providers. Returns toolName -> dotPath -> description. */
  resolveOutputFieldDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, Map<string, string>>>;
  /** Page size for resources/list pagination. Defaults to returning all resources (no pagination). */
  resourcesListPageSize?: number;
  resources?: Map<string, ResolvedResource>;
  resourceTemplates?: ResolvedResourceTemplate[];
  resolveResourceDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, string>>;
  resolveTemplateDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, string>>;
  /** Custom JSON-RPC methods dispatched after built-ins. Collisions with built-in method names are rejected at plugin startup. */
  customMethods?: Record<string, MCPMethodHandler>;
  /** Additional entries merged into the capabilities object advertised by `initialize`. Custom entries win on key collision. */
  customCapabilities?: Record<string, unknown>;
  /** Returns the current GraphQL schema for custom method handlers. */
  getSchema?: () => GraphQLSchema;
}

/**
 * Per-request inputs for dispatching custom methods: the transport
 * details exposed to handlers and a GraphQL executor bound to the
 * current request's headers and server context.
 */
export interface CustomMethodDispatchContext {
  transport?: MCPMethodTransport;
  executeGraphQL?: (operation: MCPGraphQLOperation) => Promise<ExecutionResult>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  /** Absent or null for notifications, which never receive a response. */
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export type JsonRpcResponse =
  | {
      jsonrpc: '2.0';
      id: number | string | null;
      result: unknown;
      error?: never;
    }
  | {
      jsonrpc: '2.0';
      id: number | string | null;
      error: { code: number; message: string; data?: unknown };
      result?: never;
    };

/**
 * Arguments passed to every built-in MCP method handler. Pure
 * dependency injection — handlers close over nothing and can be
 * tested in isolation.
 */
interface BuiltInHandlerArgs {
  ctx: PluginContext;
  body: JsonRpcRequest;
  options: MCPHandlerOptions;
  providerContext?: DescriptionProviderContext;
}

/**
 * A built-in MCP method handler. Returns the JSON-RPC response to
 * send, or `null` for notifications (no wire response).
 */
type BuiltInHandler = (
  args: BuiltInHandlerArgs,
) => Promise<JsonRpcResponse | null>;

async function handleInitialize({
  body,
  options,
}: BuiltInHandlerArgs): Promise<JsonRpcResponse> {
  const id = body.id ?? null;
  const protocolVersion = options.protocolVersion ?? '2025-11-25';
  const serverInfo: Record<string, unknown> = {
    name: options.serverName,
    version: options.serverVersion,
  };
  if (options.serverTitle) serverInfo['title'] = options.serverTitle;
  if (options.serverDescription)
    serverInfo['description'] = options.serverDescription;
  if (options.serverIcons) serverInfo['icons'] = options.serverIcons;
  if (options.serverWebsiteUrl)
    serverInfo['websiteUrl'] = options.serverWebsiteUrl;
  const capabilities: Record<string, unknown> = { tools: {} };
  const hasResources =
    (options.resources && options.resources.size > 0) ||
    (options.resourceTemplates && options.resourceTemplates.length > 0);
  if (hasResources) {
    capabilities['resources'] = {};
  }
  if (options.customCapabilities) {
    Object.assign(capabilities, options.customCapabilities);
  }
  const initResult: Record<string, unknown> = {
    protocolVersion,
    serverInfo,
    capabilities,
  };
  if (options.instructions) initResult['instructions'] = options.instructions;
  return { jsonrpc: '2.0', id, result: initResult };
}

async function handleToolsList({
  ctx,
  body,
  options,
  providerContext,
}: BuiltInHandlerArgs): Promise<JsonRpcResponse> {
  const id = body.id ?? null;
  const { params } = body;
  const { registry } = options;

  const allTools = registry.getMCPTools({
    suppressOutputSchema: options.suppressOutputSchema,
  });

  if (options.resolveToolDescriptions) {
    try {
      const descriptions =
        await options.resolveToolDescriptions(providerContext);
      for (const tool of allTools) {
        if (descriptions.has(tool.name)) {
          tool.description = descriptions.get(tool.name)!;
        }
      }
    } catch (err) {
      ctx.log.error(
        `Failed to resolve tool descriptions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (options.resolveFieldDescriptions) {
    try {
      const fieldDescs =
        await options.resolveFieldDescriptions(providerContext);
      for (const tool of allTools) {
        const fields = fieldDescs.get(tool.name);
        if (fields && tool.inputSchema.properties) {
          for (const [fieldName, description] of fields) {
            if (tool.inputSchema.properties[fieldName]) {
              tool.inputSchema.properties[fieldName].description = description;
            } else {
              ctx.log.warn(
                `Resolved field description for "${fieldName}" on tool "${tool.name}" but no matching input property exists. ` +
                  `Available properties: ${Object.keys(tool.inputSchema.properties).join(', ')}`,
              );
            }
          }
        }
      }
    } catch (err) {
      ctx.log.error(
        `Failed to resolve field descriptions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (options.resolveOutputFieldDescriptions) {
    try {
      const outputDescs =
        await options.resolveOutputFieldDescriptions(providerContext);
      for (const tool of allTools) {
        const fields = outputDescs.get(tool.name);
        if (fields && tool.outputSchema) {
          for (const [dotPath, description] of fields) {
            if (
              !setSchemaDescriptionByPath(
                tool.outputSchema,
                dotPath,
                description,
              )
            ) {
              ctx.log.warn(
                `Resolved output field description for "${dotPath}" on tool "${tool.name}" but no matching output property exists.`,
              );
            }
          }
        }
      }
    } catch (err) {
      ctx.log.error(
        `Failed to resolve output field descriptions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (options.toolsListPageSize !== undefined) {
    if (
      !Number.isInteger(options.toolsListPageSize) ||
      options.toolsListPageSize <= 0
    ) {
      throw new Error(
        `[MCP] toolsListPageSize must be a positive integer, got ${options.toolsListPageSize}`,
      );
    }
  }

  const listParams = params as { cursor?: unknown } | undefined;
  const cursor = listParams?.cursor;
  let startIndex = 0;
  if (cursor !== undefined && cursor !== '') {
    if (typeof cursor !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid cursor: expected a string',
        },
      };
    }
    startIndex = parseInt(cursor, 10);
    if (
      Number.isNaN(startIndex) ||
      startIndex < 0 ||
      (startIndex > 0 && startIndex >= allTools.length)
    ) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Invalid cursor: ${JSON.stringify(cursor)}`,
        },
      };
    }
  }
  const pageSize = options.toolsListPageSize ?? allTools.length;
  const page = allTools.slice(startIndex, startIndex + pageSize);
  const nextIndex = startIndex + pageSize;
  const result: Record<string, unknown> = { tools: page };
  if (nextIndex < allTools.length) {
    result['nextCursor'] = String(nextIndex);
  }

  return { jsonrpc: '2.0', id, result };
}

async function handleResourcesList({
  ctx,
  body,
  options,
  providerContext,
}: BuiltInHandlerArgs): Promise<JsonRpcResponse> {
  const id = body.id ?? null;
  const { params } = body;

  const allResources = options.resources
    ? Array.from(options.resources.values())
    : [];

  const resourceList = allResources.map((r) => {
    const entry: Record<string, unknown> = {
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
    };
    if (r.title) entry['title'] = r.title;
    if (r.size != null) entry['size'] = r.size;
    if (r.icons) entry['icons'] = r.icons;
    if (r.annotations) entry['annotations'] = r.annotations;
    const desc = r.description;
    if (desc) entry['description'] = desc;
    return entry;
  });

  if (options.resolveResourceDescriptions) {
    try {
      const descriptions =
        await options.resolveResourceDescriptions(providerContext);
      for (const resource of resourceList) {
        const providerDesc = descriptions.get(resource['uri'] as string);
        if (providerDesc) {
          resource['description'] = providerDesc;
        }
      }
    } catch (err) {
      ctx.log.error(
        `Failed to resolve resource descriptions (${resourceList.length} resources affected): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (options.resourcesListPageSize !== undefined) {
    if (
      !Number.isInteger(options.resourcesListPageSize) ||
      options.resourcesListPageSize <= 0
    ) {
      throw new Error(
        `[MCP] resourcesListPageSize must be a positive integer, got ${options.resourcesListPageSize}`,
      );
    }
  }

  const listParams = params as { cursor?: unknown } | undefined;
  const cursor = listParams?.cursor;
  let startIndex = 0;
  if (cursor !== undefined && cursor !== '') {
    if (typeof cursor !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid cursor: expected a string',
        },
      };
    }
    startIndex = parseInt(cursor, 10);
    if (
      Number.isNaN(startIndex) ||
      startIndex < 0 ||
      (startIndex > 0 && startIndex >= resourceList.length)
    ) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Invalid cursor: ${JSON.stringify(cursor)}`,
        },
      };
    }
  }
  const pageSize = options.resourcesListPageSize ?? resourceList.length;
  const page = resourceList.slice(startIndex, startIndex + pageSize);
  const nextIndex = startIndex + pageSize;
  const result: Record<string, unknown> = { resources: page };
  if (nextIndex < resourceList.length) {
    result['nextCursor'] = String(nextIndex);
  }

  return { jsonrpc: '2.0', id, result };
}

async function handleResourcesTemplatesList({
  ctx,
  body,
  options,
  providerContext,
}: BuiltInHandlerArgs): Promise<JsonRpcResponse> {
  const id = body.id ?? null;
  const allTemplates = options.resourceTemplates ?? [];

  const templateList = allTemplates.map((t) => {
    const entry: Record<string, unknown> = {
      uriTemplate: t.uriTemplate,
      name: t.name,
    };
    if (t.title) entry['title'] = t.title;
    if (t.mimeType) entry['mimeType'] = t.mimeType;
    if (t.icons) entry['icons'] = t.icons;
    if (t.annotations) entry['annotations'] = t.annotations;
    const desc = t.description;
    if (desc) entry['description'] = desc;
    return entry;
  });

  if (options.resolveTemplateDescriptions) {
    try {
      const descriptions =
        await options.resolveTemplateDescriptions(providerContext);
      for (const tmpl of templateList) {
        const providerDesc = descriptions.get(tmpl['uriTemplate'] as string);
        if (providerDesc) {
          tmpl['description'] = providerDesc;
        }
      }
    } catch (err) {
      ctx.log.error(
        `Failed to resolve template descriptions (${templateList.length} templates affected): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    result: { resourceTemplates: templateList },
  };
}

async function handleResourcesRead({
  ctx,
  body,
  options,
}: BuiltInHandlerArgs): Promise<JsonRpcResponse> {
  const id = body.id ?? null;
  const { params } = body;
  const readParams = (params ?? {}) as { uri?: string };
  if (!readParams.uri) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Missing required parameter: uri',
      },
    };
  }

  const resource = options.resources?.get(readParams.uri);
  if (resource) {
    if (resource.blob == null && resource.text == null) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Resource "${resource.name}" (${resource.uri}) has no content`,
        },
      };
    }

    const contentItem: Record<string, unknown> = {
      uri: resource.uri,
      mimeType: resource.mimeType,
    };
    if (resource.blob != null) {
      contentItem['blob'] = resource.blob;
    } else {
      contentItem['text'] = resource.text;
    }

    return {
      jsonrpc: '2.0',
      id,
      result: { contents: [contentItem] },
    };
  }

  if (options.resourceTemplates) {
    for (const tmpl of options.resourceTemplates) {
      const match = tmpl.pattern.exec(readParams.uri);
      if (!match) continue;

      const extractedParams: Record<string, string> = {};
      for (const name of tmpl.paramNames) {
        extractedParams[name] = match.groups?.[name] ?? '';
      }

      let handlerResult;
      try {
        handlerResult = await tmpl.handler(extractedParams);
      } catch (err) {
        ctx.log.error(
          `Resource template handler failed for "${tmpl.uriTemplate}" (uri: ${readParams.uri}):`,
          err instanceof Error ? err.message : err,
        );
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32002,
            message: 'Resource handler failed',
            data: {
              uri: readParams.uri,
              error: err instanceof Error ? err.message : String(err),
            },
          },
        };
      }

      const mimeType = handlerResult.mimeType ?? tmpl.mimeType ?? 'text/plain';
      const contentItem: Record<string, unknown> = {
        uri: readParams.uri,
        mimeType,
      };

      if ('blob' in handlerResult && handlerResult.blob != null) {
        contentItem['blob'] = handlerResult.blob;
      } else if ('text' in handlerResult && handlerResult.text != null) {
        contentItem['text'] = handlerResult.text;
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `Resource template handler for "${tmpl.uriTemplate}" returned neither text nor blob`,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: { contents: [contentItem] },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32002,
      message: 'Resource not found',
      data: { uri: readParams.uri },
    },
  };
}

async function handleNotificationsInitialized(): Promise<null> {
  return null;
}

/**
 * Built-in MCP methods, dispatched by name. The collision check at
 * plugin startup guarantees `customMethods` cannot shadow these entries.
 */
const defaultMethods: ReadonlyMap<string, BuiltInHandler> = new Map<
  string,
  BuiltInHandler
>([
  ['initialize', handleInitialize],
  ['tools/list', handleToolsList],
  ['resources/list', handleResourcesList],
  ['resources/templates/list', handleResourcesTemplatesList],
  ['resources/read', handleResourcesRead],
  ['notifications/initialized', handleNotificationsInitialized],
]);

/**
 * Method names handled by the plugin itself, including `tools/call`
 * which is dispatched at the HTTP layer before reaching
 * {@link handleMCPRequest}. `customMethods` entries with these names
 * are rejected at startup.
 */
export const builtInMethodNames: ReadonlySet<string> = new Set([
  ...defaultMethods.keys(),
  'tools/call',
]);

async function dispatchCustomMethod(
  ctx: PluginContext,
  body: JsonRpcRequest,
  options: MCPHandlerOptions,
  handler: MCPMethodHandler,
  dispatchContext?: CustomMethodDispatchContext,
): Promise<JsonRpcResponse | null> {
  const id = body.id ?? null;
  const { method } = body;
  const context: MCPMethodContext = {
    logger: ctx.log,
    method,
    requestId: id ?? null,
    executeGraphQL: (operation) => {
      if (!dispatchContext?.executeGraphQL) {
        throw new Error(
          `GraphQL execution is not available for method "${method}"`,
        );
      }
      return dispatchContext.executeGraphQL(operation);
    },
    getSchema: () => {
      if (!options.getSchema) {
        throw new Error(
          `Schema access is not available for method "${method}"`,
        );
      }
      return options.getSchema();
    },
    transport: dispatchContext?.transport,
  };

  // Methods under notifications/ follow notification semantics even if
  // a client mistakenly sends an id, matching the built-in
  // notifications/initialized behavior.
  const isNotification = id == null || method.startsWith('notifications/');

  try {
    const result = await handler(body.params, context);
    // Notifications never receive a response, regardless of handler outcome
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, result: result ?? null };
  } catch (err) {
    if (isNotification) {
      ctx.log.error(
        `Custom notification handler "${method}" failed:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
    if (err instanceof MCPMethodError) {
      const error: { code: number; message: string; data?: unknown } = {
        code: err.code,
        message: err.message,
      };
      if (err.data !== undefined) error.data = err.data;
      return { jsonrpc: '2.0', id, error };
    }
    throw err;
  }
}

export async function handleMCPRequest(
  ctx: PluginContext,
  body: JsonRpcRequest,
  options: MCPHandlerOptions,
  providerContext?: DescriptionProviderContext,
  dispatchContext?: CustomMethodDispatchContext,
): Promise<JsonRpcResponse | null> {
  const id = body.id ?? null;
  const { method } = body;

  // Validate JSON-RPC structure
  if (body.jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request: missing or invalid "jsonrpc" field',
      },
    };
  }
  if (!method || typeof method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request: missing or invalid "method" field',
      },
    };
  }
  if (id == null && !method.startsWith('notifications/')) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request: missing "id" field' },
    };
  }

  const handler = defaultMethods.get(method);
  if (!handler) {
    // Own-property check: bracket access on a plain object would also
    // resolve inherited prototype members (`constructor`, `toString`),
    // letting clients dispatch them as handlers.
    const customHandler =
      options.customMethods && Object.hasOwn(options.customMethods, method)
        ? options.customMethods[method]
        : undefined;
    if (customHandler) {
      return dispatchCustomMethod(
        ctx,
        body,
        options,
        customHandler,
        dispatchContext,
      );
    }
    // Per JSON-RPC 2.0 §4.1, notifications never receive a response.
    // Methods under notifications/ get the same treatment even when a
    // client mistakenly sends an id, matching the custom-method
    // dispatch behavior.
    if (id == null || method.startsWith('notifications/')) {
      ctx.log.debug(`Ignoring unknown notification method: ${method}`);
      return null;
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  return handler({ ctx, body, options, providerContext });
}

function setSchemaDescriptionByPath(
  schema: JsonSchema,
  path: string,
  description: string,
): boolean {
  const keys = path.split('.');
  let current = schema;
  for (const key of keys) {
    if (current.type === 'object' && current.properties?.[key]) {
      current = current.properties[key];
    } else if (current.type === 'array' && current.items) {
      const items = current.items;
      if (items.type === 'object' && items.properties?.[key]) {
        current = items.properties[key];
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  current.description = description;
  return true;
}
