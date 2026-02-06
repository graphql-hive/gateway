import type { ToolRegistry } from './registry.js'

export interface ExecutorContext {
  headers?: Record<string, string>
}

export function createGraphQLExecutor(registry: ToolRegistry, graphqlEndpoint: string) {
  return async function executeToolCall(toolName: string, args: Record<string, unknown>, context?: ExecutorContext): Promise<unknown> {
    const tool = registry.getTool(toolName)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    const response = await fetch(graphqlEndpoint, {
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

    const result = await response.json()
    return result
  }
}
