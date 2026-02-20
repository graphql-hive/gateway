import { Kind, parse, print, type DocumentNode, type OperationDefinitionNode } from 'graphql';

export interface ParsedOperation {
  name: string;
  type: 'query' | 'mutation';
  node: OperationDefinitionNode;
  document: string; // printed operation source
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

    // print just this operation from a single-definition document
    const singleDoc: DocumentNode = { kind: Kind.DOCUMENT, definitions: [def] };

    operations.push({
      name: def.name.value,
      type: def.operation as 'query' | 'mutation',
      node: def,
      document: print(singleDoc),
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
