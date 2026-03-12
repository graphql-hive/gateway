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
  /** Maps alias name -> original GraphQL variable name */
  argumentAliases?: Record<string, string>;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor(configs: ResolvedToolConfig[], schema: GraphQLSchema) {
    for (const config of configs) {
      const query = config.query;
      let inputSchema = operationToInputSchema(query, schema);
      let argumentAliases: Record<string, string> | undefined;

      if (config.input?.schema?.properties) {
        const overrides = config.input.schema.properties;
        for (const [fieldName, fieldOverrides] of Object.entries(overrides)) {
          if (!inputSchema.properties?.[fieldName]) {
            throw new Error(
              `Tool "${config.name}" has override for field "${fieldName}" but this field does not exist in the operation's variables. ` +
                `Available variables: ${Object.keys(inputSchema.properties || {}).join(', ')}`,
            );
          }

          // Apply non-alias overrides (description, examples, default)
          const { alias, descriptionProvider, ...schemaOverrides } = fieldOverrides;
          if (Object.keys(schemaOverrides).length > 0) {
            Object.assign(
              inputSchema.properties[fieldName],
              schemaOverrides,
            );
          }

          // Handle alias: rename the property in the input schema
          if (alias !== undefined && alias !== fieldName) {
            if (typeof alias !== 'string' || alias.trim().length === 0) {
              throw new Error(
                `Alias for field "${fieldName}" in tool "${config.name}" must be a non-empty string.`,
              );
            }
            if (
              inputSchema.properties[alias]
            ) {
              throw new Error(
                `Alias "${alias}" for field "${fieldName}" in tool "${config.name}" collides with existing field "${alias}". Choose a different alias name.`,
              );
            }
            argumentAliases ??= {};
            if (argumentAliases[alias]) {
              throw new Error(
                `Alias "${alias}" is used for both field "${argumentAliases[alias]}" and field "${fieldName}" in tool "${config.name}". Each alias must be unique.`,
              );
            }
            argumentAliases[alias] = fieldName;
            inputSchema.properties[alias] = inputSchema.properties[fieldName];
            delete inputSchema.properties[fieldName];

            // Update required array
            if (inputSchema.required) {
              const idx = inputSchema.required.indexOf(fieldName);
              if (idx !== -1) {
                inputSchema.required[idx] = alias;
              }
            }
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
        argumentAliases,
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
