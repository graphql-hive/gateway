import type { ToolHookContext } from './plugin.js';
import { getByPath, type ToolRegistry } from './registry.js';

/**
 * Check if a value looks like a raw MCP CallToolResult (object with a valid `content` array).
 * Each content item must have a `type` field matching a known MCP content type
 * and the required fields for that type per the MCP spec.
 */
function looksLikeMCPResult(value: unknown): value is Record<string, unknown> {
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
  protocolVersion?: string;
  suppressOutputSchema?: boolean;
  /** Page size for tools/list pagination. Defaults to returning all tools (no pagination). */
  toolsListPageSize?: number;
  registry: ToolRegistry;
  execute: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveToolDescriptions?: () => Promise<Map<string, string>>;
  /** Resolve per-field descriptions from providers. Returns toolName -> fieldName -> description. */
  resolveFieldDescriptions?: () => Promise<Map<string, Map<string, string>>>;
  requestContext?: {
    headers: Record<string, string>;
  };
}

interface JsonRpcRequest {
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

export function createMCPHandler(options: MCPHandlerOptions) {
  if (
    options.toolsListPageSize !== undefined &&
    (!Number.isInteger(options.toolsListPageSize) ||
      options.toolsListPageSize <= 0)
  ) {
    throw new Error(
      `[MCP] toolsListPageSize must be a positive integer, got ${options.toolsListPageSize}`,
    );
  }

  const {
    serverName,
    serverVersion,
    protocolVersion = '2025-11-25',
    registry,
  } = options;

  return async function handleMCPRequest(request: Request): Promise<Response> {
    let body: JsonRpcRequest;
    try {
      body = (await request.json()) as JsonRpcRequest;
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: Invalid JSON' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const { id, method, params } = body;

    let response: JsonRpcResponse;

    switch (method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion,
            serverInfo: {
              name: serverName,
              version: serverVersion,
            },
            capabilities: {
              tools: {},
            },
          },
        };
        break;

      case 'tools/list': {
        const allTools = registry.getMCPTools({
          suppressOutputSchema: options.suppressOutputSchema,
        });

        if (options.resolveToolDescriptions) {
          try {
            const descriptions = await options.resolveToolDescriptions();
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
            const fieldDescs = await options.resolveFieldDescriptions();
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
            response = {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: `Invalid cursor: ${JSON.stringify(cursor)}`,
              },
            };
            break;
          }
        }
        const pageSize = options.toolsListPageSize ?? allTools.length;
        const page = allTools.slice(startIndex, startIndex + pageSize);
        const nextIndex = startIndex + pageSize;
        const result: Record<string, unknown> = { tools: page };
        if (nextIndex < allTools.length) {
          result['nextCursor'] = String(nextIndex);
        }

        response = {
          jsonrpc: '2.0',
          id,
          result,
        };
        break;
      }

      case 'notifications/initialized':
        // Client notification, no response needed but we return empty for simplicity
        return new Response(null, { status: 204 });

      case 'tools/call': {
        const callParams = params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const tool = registry.getTool(callParams.name);

        if (!tool) {
          response = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Unknown tool: ${callParams.name}`,
            },
          };
          break;
        }

        try {
          // De-alias arguments: map MCP alias names back to GraphQL variable names
          let args = callParams.arguments || {};
          if (tool.argumentAliases) {
            const dealiased: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(args)) {
              const originalName = tool.argumentAliases[key] || key;
              dealiased[originalName] = value;
            }
            args = dealiased;
          }

          const hookContext: ToolHookContext = {
            toolName: callParams.name,
            headers: options.requestContext?.headers ?? {},
            query: tool.query,
          };

          // Preprocess hook can short-circuit by returning non-undefined
          let result: unknown;
          let shortCircuited = false;
          if (tool.hooks?.preprocess) {
            try {
              const preprocessResult = await tool.hooks.preprocess(
                args,
                hookContext,
              );
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
            result = await options.execute(callParams.name, args);
            if (tool.outputPath) {
              const extracted = getByPath(result, tool.outputPath);
              if (extracted === undefined && result !== undefined) {
                console.warn(
                  `[MCP] output.path "${tool.outputPath}" resolved to undefined for tool "${callParams.name}". ` +
                    `Check your output.path configuration.`,
                );
              }
              result = extracted ?? null;
            }
          }

          // Postprocess hook transforms result (skipped when preprocess short-circuits)
          if (!shortCircuited && tool.hooks?.postprocess) {
            try {
              result = await tool.hooks.postprocess(result, args, hookContext);
            } catch (hookError) {
              throw new Error(
                `postprocess hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
              );
            }
          }

          const hasHooks =
            !!tool.hooks?.preprocess || !!tool.hooks?.postprocess;
          const hookProducedResult =
            shortCircuited || !!tool.hooks?.postprocess;

          // If a hook returned a raw MCP result (object with valid `content` array),
          // pass it through directly. Only checked when a hook actually produced the result
          // to avoid false positives on GraphQL data that happens to have a `content` field.
          const isMCPResult = hookProducedResult && looksLikeMCPResult(result);

          let callResult: Record<string, unknown>;
          if (isMCPResult) {
            callResult = {
              isError: false,
              ...(result as Record<string, unknown>),
            };
          } else {
            const textContent = {
              content: [
                { type: 'text', text: JSON.stringify(result, null, 2) },
              ],
              isError: false,
            };
            // Hooks can transform the result shape, so structuredContent
            // (which relies on outputSchema) may not match. Suppress it
            // whenever any hook is configured, consistent with tools/list.
            callResult =
              tool.outputSchema && !hasHooks
                ? {
                    structuredContent: result,
                    ...textContent,
                  }
                : textContent;
          }
          response = {
            jsonrpc: '2.0',
            id,
            result: callResult,
          };
        } catch (error) {
          console.error(
            `[MCP] tools/call failed for tool "${callParams.name}":`,
            error instanceof Error ? error.message : error,
          );
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  }),
                },
              ],
              isError: true,
            },
          };
        }
        break;
      }

      default:
        response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
