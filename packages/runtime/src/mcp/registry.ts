import type { GraphQLSchema } from 'graphql'
import type { MCPToolConfig } from '../plugins/useMCP.js'
import { operationToInputSchema, type JsonSchema } from './schema-converter.js'

export interface MCPTool {
  name: string
  description: string
  inputSchema: JsonSchema
}

export interface RegisteredTool {
  name: string
  description: string
  query: string
  inputSchema: JsonSchema
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map()

  constructor(configs: MCPToolConfig[], schema: GraphQLSchema) {
    for (const config of configs) {
      const inputSchema = operationToInputSchema(config.query, schema)
      const description = config.description || `Execute ${config.name}`

      this.tools.set(config.name, {
        name: config.name,
        description,
        query: config.query,
        inputSchema
      })
    }
  }

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  getMCPTools(): MCPTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }
}
