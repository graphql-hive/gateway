import { Kind, parse, print, type DocumentNode, type OperationDefinitionNode } from 'graphql';

export interface MCPDirectiveArgs {
  name: string;
  description?: string;
  title?: string;
}

export interface ParsedOperation {
  name: string;
  type: 'query' | 'mutation';
  node: OperationDefinitionNode;
  document: string; // printed operation source
  mcpDirective?: MCPDirectiveArgs;
}

function extractMcpToolDirective(node: OperationDefinitionNode): MCPDirectiveArgs | undefined {
  const directive = node.directives?.find(d => d.name.value === 'mcpTool');
  if (!directive) return undefined;

  const args: Record<string, string> = {};
  for (const arg of directive.arguments || []) {
    if (arg.value.kind === Kind.STRING) {
      args[arg.name.value] = arg.value.value;
    }
  }

  if (!args['name']) return undefined;

  const result: MCPDirectiveArgs = { name: args['name'] };
  if (args['description']) result.description = args['description'];
  if (args['title']) result.title = args['title'];
  return result;
}

// parse a gql document string and extract all named operations
export function loadOperationsFromString(source: string): ParsedOperation[] {
  const doc = parse(source);
  const operations = [];

  for (const def of doc.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;

    if (!def.name) {
      throw new Error('anonymous operations are not supported. All MCP operations must be named');
    }

    const mcpDirective = extractMcpToolDirective(def);

    // Strip @mcpTool directive before printing
    const strippedDef = def.directives?.some(d => d.name.value === 'mcpTool')
      ? { ...def, directives: def.directives.filter(d => d.name.value !== 'mcpTool') }
      : def;

    const singleDoc: DocumentNode = { kind: Kind.DOCUMENT, definitions: [strippedDef] };

    operations.push({
      name: def.name.value,
      type: def.operation as 'query' | 'mutation',
      node: def,
      document: print(singleDoc),
      mcpDirective,
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
