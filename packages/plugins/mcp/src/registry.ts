import { parse, type GraphQLSchema } from 'graphql';
import type {
  MCPContentAnnotations,
  MCPIcon,
  MCPToolAnnotations,
  MCPToolExecution,
  MCPToolHooks,
  ResolvedToolConfig,
} from './plugin.js';
import {
  getToolDescriptionFromSchema,
  operationToInputSchema,
  selectionSetToOutputSchema,
  type JsonSchema,
} from './schema-converter.js';
import type { PluginContext } from './types.js';

/** Wire format for tools returned by `tools/list` responses per the MCP spec. */
export interface MCPTool {
  /** Unique tool identifier used in `tools/call` requests */
  name: string;
  /** Human-readable description for LLM tool selection */
  description: string;
  /** Optional display title (may differ from name) */
  title?: string;
  /** JSON Schema describing the tool's input parameters */
  inputSchema: JsonSchema;
  /** JSON Schema describing the tool's output shape (omitted when hooks are present or suppressOutputSchema is configured) */
  outputSchema?: JsonSchema;
  /** Behavioral hints for clients (readOnly, destructive, idempotent, openWorld) */
  annotations?: MCPToolAnnotations;
  /** Icon URLs for client UIs */
  icons?: MCPIcon[];
  /** Task support configuration (forbidden, optional, required) */
  execution?: MCPToolExecution;
  /** Opaque metadata passed through to clients */
  _meta?: Record<string, unknown>;
}

/**
 * Internal representation of a tool after registration.
 * Includes all MCP-visible fields plus internal execution metadata
 * (query, aliases, hooks, output path) that are not exposed to clients.
 */
export interface RegisteredTool {
  /** Unique tool identifier used in `tools/call` requests */
  name: string;
  /** Resolved description (from provider, config, directive, schema, or fallback) */
  description: string;
  /** Optional display title (may differ from name) */
  title?: string;
  /** The GraphQL operation source to execute when this tool is called */
  query: string;
  /** JSON Schema describing the tool's input parameters (with aliases applied) */
  inputSchema: JsonSchema;
  /** JSON Schema describing the tool's output shape, narrowed by output.path if configured */
  outputSchema?: JsonSchema;
  /** Behavioral hints for clients (readOnly, destructive, idempotent, openWorld) */
  annotations?: MCPToolAnnotations;
  /** Icon URLs for client UIs */
  icons?: MCPIcon[];
  /** Task support configuration (forbidden, optional, required) */
  execution?: MCPToolExecution;
  /** Opaque metadata passed through to clients */
  _meta?: Record<string, unknown>;
  /** Maps alias name -> original GraphQL variable name for argument de-aliasing */
  argumentAliases?: Record<string, string>;
  /** Dot-notation path to extract from the GraphQL response data (e.g. "search.items") */
  outputPath?: string;
  /** Explicitly suppress outputSchema in tools/list */
  suppressOutputSchema?: boolean;
  /** Annotations to attach to content items in tool responses */
  contentAnnotations?: MCPContentAnnotations;
  /** Pre/post-process hooks for intercepting or transforming tool execution */
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

  constructor(
    ctx: PluginContext,
    configs: ResolvedToolConfig[],
    schema: GraphQLSchema,
  ) {
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
        ctx.log.error(
          `Failed to generate output schema for tool "${config.name}": ${err instanceof Error ? err.message : String(err)}. Tool will be registered without output schema.`,
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
        annotations: config.tool?.annotations,
        icons: config.tool?.icons,
        execution: config.tool?.execution,
        _meta: config.tool?._meta,
        argumentAliases,
        outputPath,
        suppressOutputSchema: config.output?.schema === false,
        contentAnnotations: config.output?.contentAnnotations,
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

  getMCPTools(options?: { suppressOutputSchema?: boolean }): MCPTool[] {
    return Array.from(this.tools.values()).map((tool) => {
      // Deep-clone inputSchema so description provider mutations in protocol.ts
      // don't corrupt the canonical registry state across concurrent requests
      const clonedInputSchema: JsonSchema = structuredClone(tool.inputSchema);
      const mcpTool: MCPTool = {
        name: tool.name,
        description: tool.description,
        inputSchema: clonedInputSchema,
      };
      if (tool.title) mcpTool.title = tool.title;
      if (tool.annotations) mcpTool.annotations = tool.annotations;
      if (tool.icons) mcpTool.icons = tool.icons;
      if (tool.execution) mcpTool.execution = tool.execution;
      if (tool._meta) mcpTool._meta = tool._meta;
      const omitSchema =
        options?.suppressOutputSchema ||
        tool.suppressOutputSchema ||
        tool.hooks?.preprocess ||
        tool.hooks?.postprocess;
      if (tool.outputSchema && !omitSchema)
        mcpTool.outputSchema = structuredClone(tool.outputSchema);
      return mcpTool;
    });
  }
}
