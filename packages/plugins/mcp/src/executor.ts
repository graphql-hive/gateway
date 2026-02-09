import type { ToolRegistry } from './registry.js'

export interface ExecutorContext {
  headers?: Record<string, string>
}

export function createGraphQLExecutor(registry: ToolRegistry, graphqlEndpoint: string, dispatch: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return async function executeToolCall(toolName: string, args: Record<string, unknown>, context?: ExecutorContext): Promise<unknown> {
    const tool = registry.getTool(toolName)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    const response = await dispatch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...context?.headers,
      },
      body: JSON.stringify({
        query: tool.query,
        variables: args,
      }),
    })

    return response.json()
  }
}
