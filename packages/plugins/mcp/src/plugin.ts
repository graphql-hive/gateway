import type { GraphQLSchema } from 'graphql'
import type { GatewayPlugin } from '@graphql-hive/gateway-runtime'
import { ToolRegistry } from './registry.js'
import { createMCPHandler } from './protocol.js'
import { createGraphQLExecutor } from './executor.js'

export interface MCPToolConfig {
  name: string
  description?: string
  query: string
}

export interface MCPConfig {
  name: string
  version?: string
  path?: string
  graphqlPath?: string
  tools: MCPToolConfig[]
}

export function useMCP(config: MCPConfig): GatewayPlugin {
  const mcpPath = config.path || '/mcp'
  const graphqlPath = config.graphqlPath || '/graphql'
  let registry: ToolRegistry | null = null
  let schema: GraphQLSchema | null = null
  let schemaLoadingPromise: Promise<void> | null = null

  return {
    onSchemaChange({ schema: newSchema }) {
      schema = newSchema
      registry = new ToolRegistry(config.tools, newSchema)
    },

    onRequest({ request, url, endResponse, requestHandler, serverContext }) {
      if (url.pathname !== mcpPath) {
        return
      }

      const graphqlEndpoint = `${url.protocol}//${url.host}${graphqlPath}`
      const dispatch = (url: string, init: RequestInit) => requestHandler(new Request(url, init), serverContext)

      // Trigger schema introspection if not loaded
      const ensureSchema = async (): Promise<boolean> => {
        if (registry && schema) {
          return true
        }

        // Avoid multiple concurrent introspection requests
        if (!schemaLoadingPromise) {
          schemaLoadingPromise = (async () => {
            try {
              await dispatch(graphqlEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '{ __typename }' })
              })
            } finally {
              schemaLoadingPromise = null
            }
          })()
        }

        await schemaLoadingPromise
        return !!(registry && schema)
      }

      return ensureSchema().then(ready => {
        if (!ready || !registry || !schema) {
          endResponse(new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32000,
              message: 'MCP server not ready. Schema introspection failed.'
            }
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }))
          return
        }

        const execute = createGraphQLExecutor(registry, graphqlEndpoint, dispatch)

        const handler = createMCPHandler({
          serverName: config.name,
          serverVersion: config.version || '1.0.0',
          registry,
          execute: async (toolName, args) => {
            const headers: Record<string, string> = {}
            const auth = request.headers.get('authorization')
            if (auth) {
              headers['authorization'] = auth
            }
            return execute(toolName, args, { headers })
          }
        })

        return handler(request).then(response => {
          endResponse(response)
        })
      })
    }
  }
}
