import type { ToolRegistry } from './registry.js'

export interface MCPHandlerOptions {
  serverName: string
  serverVersion: string
  registry: ToolRegistry
  execute: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export function createMCPHandler(options: MCPHandlerOptions) {
  const { serverName, serverVersion, registry } = options

  return async function handleMCPRequest(request: Request): Promise<Response> {
    const body = await request.json() as JsonRpcRequest
    const { id, method, params } = body

    let response: JsonRpcResponse

    switch (method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-11-25',
            serverInfo: {
              name: serverName,
              version: serverVersion
            },
            capabilities: {
              tools: {}
            }
          }
        }
        break

      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            tools: registry.getMCPTools()
          }
        }
        break

      case 'notifications/initialized':
        // Client notification, no response needed but we return empty for simplicity
        return new Response(null, { status: 204 })

      case 'tools/call': {
        const callParams = params as { name: string; arguments?: Record<string, unknown> }
        const tool = registry.getTool(callParams.name)

        if (!tool) {
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: `Unknown tool: ${callParams.name}` })
              }],
              isError: true
            }
          }
          break
        }

        try {
          const result = await options.execute(callParams.name, callParams.arguments || {})
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            }
          }
        } catch (error) {
          response = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : 'Unknown error'
                })
              }],
              isError: true
            }
          }
        }
        break
      }

      default:
        response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        }
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
