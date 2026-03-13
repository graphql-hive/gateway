import { getByPath, type ToolRegistry } from './registry.js';

export interface MCPHandlerOptions {
  serverName: string;
  serverVersion: string;
  registry: ToolRegistry;
  execute: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveToolDescriptions?: () => Promise<Map<string, string>>;
  /** Resolve per-field descriptions from providers. Returns toolName -> fieldName -> description. */
  resolveFieldDescriptions?: () => Promise<Map<string, Map<string, string>>>;
  includeContentFallback?: boolean;
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
  const { serverName, serverVersion, registry } = options;

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
            protocolVersion: '2025-11-25',
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
        const tools = registry.getMCPTools();

        if (options.resolveToolDescriptions) {
          try {
            const descriptions = await options.resolveToolDescriptions();
            for (const tool of tools) {
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
            for (const tool of tools) {
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

        response = {
          jsonrpc: '2.0',
          id,
          result: { tools },
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
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `Unknown tool: ${callParams.name}`,
                  }),
                },
              ],
              isError: true,
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
          let result = await options.execute(callParams.name, args);
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
          const textContent = {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
          const callResult: Record<string, unknown> = tool.outputSchema
            ? {
                structuredContent: result,
                ...(options.includeContentFallback && textContent),
              }
            : textContent;
          response = {
            jsonrpc: '2.0',
            id,
            result: callResult,
          };
        } catch (error) {
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
