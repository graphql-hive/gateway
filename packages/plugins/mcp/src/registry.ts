import { parse, type GraphQLSchema } from 'graphql';
import type { ResolvedToolConfig } from './plugin.js';
import {
  getToolDescriptionFromSchema,
  operationToInputSchema,
  selectionSetToOutputSchema,
  type JsonSchema,
} from './schema-converter.js';

export interface MCPTool {
  name: string;
  description: string;
  title?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
}

export interface RegisteredTool {
  name: string;
  description: string;
  title?: string;
  query: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor(configs: ResolvedToolConfig[], schema: GraphQLSchema) {
    for (const config of configs) {
      const query = config.query;
      let inputSchema = operationToInputSchema(query, schema);

      if (config.input?.schema?.properties) {
        const overrides = config.input.schema.properties;
        for (const [fieldName, fieldOverrides] of Object.entries(overrides)) {
          if (inputSchema.properties?.[fieldName]) {
            Object.assign(inputSchema.properties[fieldName], fieldOverrides);
          }
        }
      }

      // Description precedence:
      //   1. descriptionProvider (resolved at request time in protocol handler)
      //   2. config.tool.description (explicit config override)
      //   3. @mcpTool directive description
      //   4. GraphQL schema field description
      //   5. fallback: "Execute <toolName>"
      const description =
        config.tool?.description ||
        config.directiveDescription ||
        getToolDescriptionFromSchema(query, schema) ||
        `Execute ${config.name}`;

      // Generate output schema
      let outputSchema: JsonSchema | undefined;
      try {
        outputSchema = selectionSetToOutputSchema(parse(query), schema);
      } catch (err) {
        console.warn(
          `[MCP] Failed to generate output schema for tool "${config.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      this.tools.set(config.name, {
        name: config.name,
        description,
        title: config.tool?.title,
        query,
        inputSchema,
        outputSchema,
      });
    }
  }

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getMCPTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((tool) => {
      const mcpTool: MCPTool = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      if (tool.title) mcpTool.title = tool.title;
      if (tool.outputSchema) mcpTool.outputSchema = tool.outputSchema;
      return mcpTool;
    });
  }
}
