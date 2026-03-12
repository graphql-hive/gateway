import type { ToolRegistry } from './registry.js';

export interface ExecutorContext {
  headers?: Record<string, string>;
}

export function createGraphQLExecutor(
  registry: ToolRegistry,
  graphqlEndpoint: string,
  dispatch: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context?: ExecutorContext,
  ): Promise<unknown> {
    const tool = registry.getTool(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const response = await dispatch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...context?.headers,
        'x-mcp-internal': '1',
      },
      body: JSON.stringify({
        query: tool.query,
        variables: args,
      }),
    });

    const body = (await response.json()) as {
      data?: unknown;
      errors?: unknown[];
    };

    if (body.errors?.length) {
      throw new Error(
        (body.errors[0] as { message?: string })?.message ||
          'GraphQL execution error',
      );
    }

    return body.data;
  };
}
