import {
  Kind,
  parse,
  print,
  type DirectiveNode,
  type DocumentNode,
  type FieldNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
  type VariableDefinitionNode,
} from 'graphql';
import type { PluginContext } from './types.js';

const MCP_TOOL_DIRECTIVE = 'mcpTool';
const MCP_DESCRIPTION_DIRECTIVE = 'mcpDescription';
const MCP_HEADER_DIRECTIVE = 'mcpHeader';

export interface MCPDirectiveArgs {
  name: string;
  description?: string;
  title?: string;
  descriptionProvider?: string;
  meta?: Record<string, unknown>;
}

export interface ParsedOperation {
  name: string;
  type: 'query' | 'mutation';
  node: OperationDefinitionNode;
  document: string; // printed operation source
  mcpDirective?: MCPDirectiveArgs;
  fieldDescriptionProviders?: Record<string, string>;
  selectionDescriptionProviders?: Record<string, string>;
  /** Maps variable name to HTTP header name, from @mcpHeader directives */
  headerMappings?: Record<string, string>;
}

function astValueToJs(node: ValueNode): unknown {
  switch (node.kind) {
    case Kind.STRING:
      return node.value;
    case Kind.INT:
      return parseInt(node.value, 10);
    case Kind.FLOAT:
      return parseFloat(node.value);
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.ENUM:
      return node.value;
    case Kind.LIST:
      return node.values.map(astValueToJs);
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {};
      for (const field of node.fields) {
        obj[field.name.value] = astValueToJs(field.value);
      }
      return obj;
    }
    case Kind.VARIABLE:
      throw new Error(
        `Variable references ($${node.name.value}) are not supported in @mcpTool meta. Use literal values instead.`,
      );
    default: {
      const _exhaustive: never = node;
      throw new Error(
        `Unexpected AST value node kind: ${(_exhaustive as { kind: string }).kind}`,
      );
    }
  }
}

function extractMcpToolDirective(
  ctx: PluginContext,
  node: OperationDefinitionNode,
): MCPDirectiveArgs | undefined {
  const directive = node.directives?.find(
    (d) => d.name.value === MCP_TOOL_DIRECTIVE,
  );
  if (!directive) return undefined;

  const args: Record<string, string> = {};
  let meta: Record<string, unknown> | undefined;
  for (const arg of directive.arguments || []) {
    if (arg.name.value === 'meta') {
      if (arg.value.kind === Kind.OBJECT) {
        meta = astValueToJs(arg.value) as Record<string, unknown>;
      } else {
        ctx.log.warn(
          `@mcpTool directive argument "meta" must be an object literal (got ${arg.value.kind}). The tool will be registered without metadata.`,
        );
      }
    } else if (arg.value.kind === Kind.STRING) {
      args[arg.name.value] = arg.value.value;
    } else {
      ctx.log.warn(
        `@mcpTool directive argument "${arg.name.value}" has non-string value (kind: ${arg.value.kind}). Only string literals are supported.`,
      );
    }
  }

  if (!args['name']) {
    ctx.log.warn(
      `@mcpTool directive found but missing required "name" argument. The directive will be ignored.`,
    );
    return undefined;
  }

  const result: MCPDirectiveArgs = { name: args['name'] };
  if (args['description']) result.description = args['description'];
  if (args['title']) result.title = args['title'];
  if (args['descriptionProvider'])
    result.descriptionProvider = args['descriptionProvider'];
  if (meta) result.meta = meta;
  return result;
}

function getMcpDescriptionProvider(
  ctx: PluginContext,
  directives: readonly DirectiveNode[] | undefined,
  label: string,
): string | undefined {
  const directive = directives?.find(
    (d) => d.name.value === MCP_DESCRIPTION_DIRECTIVE,
  );
  if (!directive) return undefined;

  const providerArg = directive.arguments?.find(
    (a) => a.name.value === 'provider',
  );
  if (
    !providerArg ||
    providerArg.value.kind !== Kind.STRING ||
    !providerArg.value.value
  ) {
    ctx.log.warn(
      `@mcpDescription on ${label} requires a "provider" string argument (e.g., @mcpDescription(provider: "langfuse:prompt_name")). Ignoring.`,
    );
    return undefined;
  }
  return providerArg.value.value;
}

function extractFieldDescriptionProviders(
  ctx: PluginContext,
  variables: readonly VariableDefinitionNode[],
): Record<string, string> | undefined {
  let providers: Record<string, string> | undefined;
  for (const variable of variables) {
    const value = getMcpDescriptionProvider(
      ctx,
      variable.directives,
      `variable "$${variable.variable.name.value}"`,
    );
    if (value) {
      providers ??= {};
      providers[variable.variable.name.value] = value;
    }
  }
  return providers;
}

function extractHeaderMappings(
  _: PluginContext,
  variables: readonly VariableDefinitionNode[],
): Record<string, string> | undefined {
  let mappings: Record<string, string> | undefined;
  for (const variable of variables) {
    const directive = variable.directives?.find(
      (d) => d.name.value === MCP_HEADER_DIRECTIVE,
    );
    if (!directive) continue;

    const nameArg = directive.arguments?.find((a) => a.name.value === 'name');
    if (
      !nameArg ||
      nameArg.value.kind !== Kind.STRING ||
      !nameArg.value.value.trim()
    ) {
      throw new Error(
        `@mcpHeader on variable "$${variable.variable.name.value}" requires a non-empty "name" string argument ` +
          `(e.g., @mcpHeader(name: "x-company-id")).`,
      );
    }
    mappings ??= {};
    mappings[variable.variable.name.value] = nameArg.value.value;
  }
  return mappings;
}

function extractSelectionDescriptionProviders(
  ctx: PluginContext,
  selectionSet: SelectionSetNode,
  prefix = '',
): Record<string, string> | undefined {
  let providers: Record<string, string> | undefined;
  for (const selection of selectionSet.selections) {
    if (selection.kind !== Kind.FIELD) continue;
    const fieldName = selection.name.value;
    const path = prefix ? `${prefix}.${fieldName}` : fieldName;

    const value = getMcpDescriptionProvider(
      ctx,
      selection.directives,
      `field "${path}"`,
    );
    if (value) {
      providers ??= {};
      providers[path] = value;
    }

    if (selection.selectionSet) {
      const nested = extractSelectionDescriptionProviders(
        ctx,
        selection.selectionSet,
        path,
      );
      if (nested) {
        providers ??= {};
        Object.assign(providers, nested);
      }
    }
  }
  return providers;
}

function stripSelectionDirectives(
  selectionSet: SelectionSetNode,
): SelectionSetNode {
  return {
    ...selectionSet,
    selections: selectionSet.selections.map((selection) => {
      if (selection.kind !== Kind.FIELD) return selection;
      let field: FieldNode = selection;
      if (
        field.directives?.some(
          (d) => d.name.value === MCP_DESCRIPTION_DIRECTIVE,
        )
      ) {
        field = {
          ...field,
          directives: field.directives!.filter(
            (d) => d.name.value !== MCP_DESCRIPTION_DIRECTIVE,
          ),
        };
      }
      if (field.selectionSet) {
        field = {
          ...field,
          selectionSet: stripSelectionDirectives(field.selectionSet),
        };
      }
      return field;
    }),
  };
}

function hasSelectionDirectives(selectionSet?: SelectionSetNode): boolean {
  if (!selectionSet) return false;
  return selectionSet.selections.some((s) => {
    if (s.kind !== Kind.FIELD) return false;
    if (s.directives?.some((d) => d.name.value === MCP_DESCRIPTION_DIRECTIVE))
      return true;
    return s.selectionSet ? hasSelectionDirectives(s.selectionSet) : false;
  });
}

const MCP_VAR_DIRECTIVES = [MCP_DESCRIPTION_DIRECTIVE, MCP_HEADER_DIRECTIVE];

function stripMcpDirectives(
  def: OperationDefinitionNode,
): OperationDefinitionNode {
  const hasMcpTool = def.directives?.some(
    (d) => d.name.value === MCP_TOOL_DIRECTIVE,
  );
  const hasVarDirective = def.variableDefinitions?.some((v) =>
    v.directives?.some((d) => MCP_VAR_DIRECTIVES.includes(d.name.value)),
  );
  const hasSelDesc = hasSelectionDirectives(def.selectionSet);
  if (!hasMcpTool && !hasVarDirective && !hasSelDesc) return def;

  return {
    ...def,
    directives: hasMcpTool
      ? def.directives?.filter((d) => d.name.value !== MCP_TOOL_DIRECTIVE)
      : def.directives,
    variableDefinitions: hasVarDirective
      ? def.variableDefinitions?.map((v) =>
          v.directives?.some((d) => MCP_VAR_DIRECTIVES.includes(d.name.value))
            ? {
                ...v,
                directives: v.directives!.filter(
                  (d) => !MCP_VAR_DIRECTIVES.includes(d.name.value),
                ),
              }
            : v,
        )
      : def.variableDefinitions,
    selectionSet: hasSelDesc
      ? stripSelectionDirectives(def.selectionSet)
      : def.selectionSet,
  } as OperationDefinitionNode;
}

export function parseInlineHeaderDirectives(
  ctx: PluginContext,
  queryStr: string,
): { query: string; headerMappings?: Record<string, string> } {
  const doc = parse(queryStr);
  const def = doc.definitions.find(
    (d) => d.kind === Kind.OPERATION_DEFINITION,
  ) as OperationDefinitionNode | undefined;
  if (!def?.variableDefinitions) return { query: queryStr };

  const headerMappings = extractHeaderMappings(ctx, def.variableDefinitions);
  if (!headerMappings) return { query: queryStr };

  const stripped = stripMcpDirectives(def);
  const strippedDoc: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [stripped],
  };
  return { query: print(strippedDoc), headerMappings };
}

export function loadOperationsFromDocument(
  ctx: PluginContext,
  doc: DocumentNode,
): ParsedOperation[] {
  const operations = [];

  for (const def of doc.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;

    if (!def.name) {
      throw new Error(
        'anonymous operations are not supported. All MCP operations must be named',
      );
    }

    const mcpDirective = extractMcpToolDirective(ctx, def);
    const fieldDescriptionProviders = def.variableDefinitions
      ? extractFieldDescriptionProviders(ctx, def.variableDefinitions)
      : undefined;
    const selectionDescriptionProviders = def.selectionSet
      ? extractSelectionDescriptionProviders(ctx, def.selectionSet)
      : undefined;
    const headerMappings = def.variableDefinitions
      ? extractHeaderMappings(ctx, def.variableDefinitions)
      : undefined;

    const singleDoc: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [stripMcpDirectives(def)],
    };

    operations.push({
      name: def.name.value,
      type: def.operation as 'query' | 'mutation',
      node: def,
      document: print(singleDoc),
      mcpDirective,
      fieldDescriptionProviders,
      selectionDescriptionProviders,
      headerMappings,
    });
  }

  return operations;
}

// find an operation by name and type from a list of parsed operations
export function resolveOperation(
  operations: ParsedOperation[],
  operationName: string,
  operationType: 'query' | 'mutation',
): ParsedOperation | undefined {
  return operations.find(
    (op) => op.name === operationName && op.type === operationType,
  );
}
