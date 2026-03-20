import type { DescriptionProviderContext } from './description-provider.js';
import type { MCPIcon, ToolHookContext } from './plugin.js';
import {
  getByPath,
  type RegisteredTool,
  type ToolRegistry,
} from './registry.js';

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

export async function handleToolCall(options: {
  id: number | string;
  toolName: string;
  arguments: Record<string, unknown>;
  registry: ToolRegistry;
  execute: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  headers: Record<string, string>;
}): Promise<{
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}> {
  const tool = options.registry.getTool(options.toolName);

  if (!tool) {
    return {
      jsonrpc: '2.0',
      id: options.id,
      error: { code: -32602, message: `Unknown tool: ${options.toolName}` },
    };
  }

  const args = dealiasArgs(options.arguments, tool.argumentAliases);
  const hookContext: ToolHookContext = {
    toolName: options.toolName,
    headers: options.headers,
    query: tool.query,
  };

  try {
    // Preprocess hook can short-circuit
    let result: unknown;
    let shortCircuited = false;
    if (tool.hooks?.preprocess) {
      try {
        const preprocessResult = await tool.hooks.preprocess(args, hookContext);
        if (preprocessResult !== undefined) {
          result = preprocessResult;
          shortCircuited = true;
        }
      } catch (hookError) {
        throw new Error(
          `preprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
        );
      }
    }

    if (!shortCircuited) {
      result = await options.execute(options.toolName, args);
      if (tool.outputPath) {
        const extracted = getByPath(result, tool.outputPath);
        if (extracted === undefined && result !== undefined) {
          console.warn(
            `[MCP] output.path "${tool.outputPath}" resolved to undefined for tool "${options.toolName}". ` +
              `Check your output.path configuration.`,
          );
        }
        result = extracted ?? null;
      }
    }

    // Postprocess hook (skipped when preprocess short-circuits)
    if (!shortCircuited && tool.hooks?.postprocess) {
      try {
        result = await tool.hooks.postprocess(result, args, hookContext);
      } catch (hookError) {
        throw new Error(
          `postprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
        );
      }
    }

    const hasHooks = !!tool.hooks?.preprocess || !!tool.hooks?.postprocess;
    const hookProducedResult = shortCircuited || !!tool.hooks?.postprocess;

    return {
      jsonrpc: '2.0',
      id: options.id,
      result: formatToolCallResult(result, tool, {
        hookProducedResult,
        hasHooks,
      }),
    };
  } catch (error) {
    console.error(
      `[MCP] tools/call failed for tool "${options.toolName}":`,
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

export async function processExecutionResult(options: {
  id: number | string;
  toolName: string;
  args: Record<string, unknown>;
  tool: RegisteredTool;
  data: unknown;
  headers: Record<string, string>;
}): Promise<{
  jsonrpc: '2.0';
  id: number | string;
  result: Record<string, unknown>;
}> {
  const { tool } = options;

  try {
    let data = options.data;

    // Apply output.path extraction
    if (tool.outputPath) {
      const extracted = getByPath(data, tool.outputPath);
      if (extracted === undefined && data !== undefined) {
        console.warn(
          `[MCP] output.path "${tool.outputPath}" resolved to undefined for tool "${options.toolName}". ` +
            `Check your output.path configuration.`,
        );
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
      result: formatToolCallResult(data, tool, {
        hookProducedResult,
        hasHooks,
      }),
    };
  } catch (error) {
    console.error(
      `[MCP] tools/call failed for tool "${options.toolName}":`,
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
  result: unknown,
  tool: RegisteredTool,
  opts: { hookProducedResult: boolean; hasHooks: boolean },
): Record<string, unknown> {
  const isMCPResult = opts.hookProducedResult && looksLikeMCPResult(result);
  if (isMCPResult) {
    return { isError: false, ...(result as Record<string, unknown>) };
  }
  const textItem: Record<string, unknown> = {
    type: 'text',
    text: JSON.stringify(result, null, 2),
  };
  if (tool.contentAnnotations)
    textItem['annotations'] = tool.contentAnnotations;
  const textContent = { content: [textItem], isError: false };
  return tool.outputSchema && !opts.hasHooks
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
  execute: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveToolDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, string>>;
  /** Resolve per-field descriptions from providers. Returns toolName -> fieldName -> description. */
  resolveFieldDescriptions?: (
    context?: DescriptionProviderContext,
  ) => Promise<Map<string, Map<string, string>>>;
  requestContext?: {
    headers: Record<string, string>;
  };
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export async function handleMCPRequest(
  body: JsonRpcRequest,
  options: MCPHandlerOptions,
  providerContext?: DescriptionProviderContext,
): Promise<JsonRpcResponse | null> {
  const {
    serverName,
    serverVersion,
    protocolVersion = '2025-11-25',
    registry,
  } = options;

  const { id, method, params } = body;

  switch (method) {
    case 'initialize': {
      const serverInfo: Record<string, unknown> = {
        name: serverName,
        version: serverVersion,
      };
      if (options.serverTitle) serverInfo['title'] = options.serverTitle;
      if (options.serverDescription)
        serverInfo['description'] = options.serverDescription;
      if (options.serverIcons) serverInfo['icons'] = options.serverIcons;
      if (options.serverWebsiteUrl)
        serverInfo['websiteUrl'] = options.serverWebsiteUrl;
      const initResult: Record<string, unknown> = {
        protocolVersion,
        serverInfo,
        capabilities: { tools: {} },
      };
      if (options.instructions)
        initResult['instructions'] = options.instructions;
      return { jsonrpc: '2.0', id, result: initResult };
    }

    case 'tools/list': {
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
          console.warn(
            `[MCP] Failed to resolve tool descriptions: ${err instanceof Error ? err.message : String(err)}`,
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
                  tool.inputSchema.properties[fieldName].description =
                    description;
                } else {
                  console.warn(
                    `[MCP] Resolved field description for "${fieldName}" on tool "${tool.name}" but no matching input property exists. ` +
                      `Available properties: ${Object.keys(tool.inputSchema.properties).join(', ')}`,
                  );
                }
              }
            }
          }
        } catch (err) {
          console.warn(
            `[MCP] Failed to resolve field descriptions: ${err instanceof Error ? err.message : String(err)}`,
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

      const listParams = params as { cursor?: string } | undefined;
      const cursor = listParams?.cursor;
      let startIndex = 0;
      if (cursor !== undefined && cursor !== '') {
        startIndex = parseInt(cursor, 10);
        if (
          Number.isNaN(startIndex) ||
          startIndex < 0 ||
          startIndex >= allTools.length
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

    case 'notifications/initialized':
      return null;

    case 'tools/call': {
      const callParams = params as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      return handleToolCall({
        id,
        toolName: callParams.name,
        arguments: callParams.arguments || {},
        registry,
        execute: options.execute,
        headers: options.requestContext?.headers ?? {},
      });
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}
