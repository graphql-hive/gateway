import { parse, type GraphQLSchema } from 'graphql';
import type { MCPToolHooks, ResolvedToolConfig } from './plugin.js';
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
  /** Dot-notation path to extract from the GraphQL response data */
  outputPath?: string;
  /** Explicitly suppress outputSchema in tools/list */
  suppressOutputSchema?: boolean;
  hooks?: MCPToolHooks;
}

/** Walk a dot-notation path through an object, returning the value at that path. */
export function getByPath(obj: unknown, path: string): unknown {
  let current = obj;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Walk a dot-notation path through a JSON Schema, returning the sub-schema at that path. */
function getSchemaByPath(
  schema: JsonSchema,
  path: string,
): JsonSchema | undefined {
  let current = schema;
  for (const key of path.split('.')) {
    if (current.type === 'object' && current.properties?.[key]) {
      current = current.properties[key];
    } else if (current.type === 'array' && current.items) {
      // Walk into array items, then look for the key
      const items = current.items;
      if (items.type === 'object' && items.properties?.[key]) {
        current = items.properties[key];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return current;
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
          const { alias, descriptionProvider, ...schemaOverrides } =
            fieldOverrides;
          if (Object.keys(schemaOverrides).length > 0) {
            Object.assign(inputSchema.properties[fieldName], schemaOverrides);
          }

          // Handle alias: rename the property in the input schema
          if (alias !== undefined && alias !== fieldName) {
            if (typeof alias !== 'string' || alias.trim().length === 0) {
              throw new Error(
                `Alias for field "${fieldName}" in tool "${config.name}" must be a non-empty string.`,
              );
            }
            if (inputSchema.properties[alias]) {
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

      const outputPath = config.output?.path;

      // Validate output path format
      if (outputPath !== undefined) {
        if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
          throw new Error(
            `Tool "${config.name}": output.path must be a non-empty string.`,
          );
        }
        if (
          outputPath.startsWith('.') ||
          outputPath.endsWith('.') ||
          outputPath.includes('..')
        ) {
          throw new Error(
            `Tool "${config.name}": output.path "${outputPath}" is invalid. Use dot-notation like "search.items".`,
          );
        }
      }

      // Narrow output schema to match the extraction path
      if (outputPath && outputSchema) {
        const narrowed = getSchemaByPath(outputSchema, outputPath);
        if (narrowed) {
          outputSchema = narrowed;
        } else {
          throw new Error(
            `Tool "${config.name}": output.path "${outputPath}" does not match the output schema. ` +
              `Verify the path matches the GraphQL query's selection set.`,
          );
        }
      }

      // Validate hooks are functions
      if (config.hooks) {
        if (
          config.hooks.preprocess &&
          typeof config.hooks.preprocess !== 'function'
        ) {
          throw new Error(
            `Tool "${config.name}": hooks.preprocess must be a function, got ${typeof config.hooks.preprocess}`,
          );
        }
        if (
          config.hooks.postprocess &&
          typeof config.hooks.postprocess !== 'function'
        ) {
          throw new Error(
            `Tool "${config.name}": hooks.postprocess must be a function, got ${typeof config.hooks.postprocess}`,
          );
        }
      }

      this.tools.set(config.name, {
        name: config.name,
        description,
        title: config.tool?.title,
        query,
        inputSchema,
        outputSchema,
        argumentAliases,
        outputPath,
        suppressOutputSchema: config.output?.schema === false,
        hooks: config.hooks,
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
      const omitSchema =
        tool.suppressOutputSchema ||
        tool.hooks?.preprocess ||
        tool.hooks?.postprocess;
      if (tool.outputSchema && !omitSchema)
        mcpTool.outputSchema = tool.outputSchema;
      return mcpTool;
    });
  }
}
