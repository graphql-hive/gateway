import {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  isAbstractType,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
} from 'graphql';
import {
  ANY,
  BOOLEAN,
  CONSTANT,
  ENUM,
  FLOAT,
  INT,
  LIST,
  OBJECT,
  ObjectPlanNode,
  PlanNode,
  STRING,
} from './verifier';

export interface RawForwardPlan {
  operation: OperationDefinitionNode;
  root: ObjectPlanNode;
  /** Response key of the only root field. */
  rootKey: string;
}

export interface RawForwardPlanOptions {
  schema: GraphQLSchema;
  /**
   * The resolver of fields that only copy the subgraph value. A nested field
   * with any other resolver is resolved by the gateway and is not eligible.
   */
  defaultFieldResolver?: GraphQLFieldResolver<any, any>;
}

// Upper bound for the plan of one operation (fragments can multiply the selection).
const MAX_PLAN_NODES = 20000;

const textEncoder = new TextEncoder();
function jsonToken(value: string): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

// A scalar without its own `serialize` and `parseValue` gets these from graphql-js.
const untouchedScalar = new GraphQLScalarType({ name: 'RawForwardProbe' });
function passesValuesThrough(type: GraphQLScalarType): boolean {
  return (
    type.serialize === untouchedScalar.serialize &&
    type.parseValue === untouchedScalar.parseValue
  );
}

function typeConditionApplies(
  schema: GraphQLSchema,
  conditionName: string,
  type: GraphQLObjectType,
): boolean {
  if (conditionName === type.name) {
    return true;
  }
  const condition = schema.getType(conditionName);
  return (
    condition != null &&
    isAbstractType(condition) &&
    schema.isSubType(condition, type)
  );
}

type Fragments = Record<string, FragmentDefinitionNode>;

/**
 * `CollectFields` of the GraphQL spec for a concrete object type: response key
 * to field nodes, in response order. Returns `null` when a directive is
 * present, because `@skip`, `@include` and `@defer` are not evaluated here.
 */
function collectFields(
  schema: GraphQLSchema,
  fragments: Fragments,
  type: GraphQLObjectType,
  selectionSets: readonly (SelectionSetNode | undefined)[],
  collected = new Map<string, FieldNode[]>(),
  visitedFragments = new Set<string>(),
): Map<string, FieldNode[]> | null {
  for (const selectionSet of selectionSets) {
    if (!selectionSet) {
      return null;
    }
    for (const selection of selectionSet.selections) {
      if (selection.directives?.length) {
        return null;
      }
      if (selection.kind === Kind.FIELD) {
        const key = selection.alias?.value ?? selection.name.value;
        const fieldNodes = collected.get(key);
        if (fieldNodes) {
          fieldNodes.push(selection);
        } else {
          collected.set(key, [selection]);
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        if (
          selection.typeCondition &&
          !typeConditionApplies(
            schema,
            selection.typeCondition.name.value,
            type,
          )
        ) {
          continue;
        }
        if (
          !collectFields(
            schema,
            fragments,
            type,
            [selection.selectionSet],
            collected,
            visitedFragments,
          )
        ) {
          return null;
        }
      } else {
        const name = selection.name.value;
        if (visitedFragments.has(name)) {
          continue;
        }
        visitedFragments.add(name);
        const fragment = fragments[name];
        if (!fragment || fragment.directives?.length) {
          return null;
        }
        if (
          !typeConditionApplies(schema, fragment.typeCondition.name.value, type)
        ) {
          continue;
        }
        if (
          !collectFields(
            schema,
            fragments,
            type,
            [fragment.selectionSet],
            collected,
            visitedFragments,
          )
        ) {
          return null;
        }
      }
    }
  }
  return collected;
}

function splitDocument(
  document: DocumentNode,
  operationName: string | null | undefined,
): { operation: OperationDefinitionNode; fragments: Fragments } | null {
  let operation: OperationDefinitionNode | undefined;
  const fragments: Fragments = Object.create(null);
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    } else if (definition.kind === Kind.OPERATION_DEFINITION) {
      if (operationName == null) {
        if (operation) {
          return null;
        }
        operation = definition;
      } else if (definition.name?.value === operationName) {
        operation = definition;
      }
    } else {
      return null;
    }
  }
  return operation ? { operation, fragments } : null;
}

interface CompileContext extends RawForwardPlanOptions {
  fragments: Fragments;
  nodes: number;
}

function compileObject(
  ctx: CompileContext,
  type: GraphQLObjectType,
  selectionSets: readonly (SelectionSetNode | undefined)[],
  isRoot: boolean,
  nonNull: boolean,
): ObjectPlanNode | null {
  if (++ctx.nodes > MAX_PLAN_NODES) {
    return null;
  }
  const collected = collectFields(
    ctx.schema,
    ctx.fragments,
    type,
    selectionSets,
  );
  if (!collected?.size) {
    return null;
  }
  const fields = type.getFields();
  const node: ObjectPlanNode = {
    kind: OBJECT,
    nonNull,
    type,
    responseKeys: [],
    keyTokens: [],
    fieldNames: [],
    children: [],
  };
  for (const [responseKey, fieldNodes] of collected) {
    const fieldName = fieldNodes[0]!.name.value;
    let child: PlanNode | null;
    if (fieldName === '__typename') {
      if (isRoot) {
        // the gateway answers the root `__typename` itself
        return null;
      }
      child = { kind: CONSTANT, nonNull: true, token: jsonToken(type.name) };
    } else {
      const field = fields[fieldName];
      if (!field) {
        // includes `__schema` and `__type`
        return null;
      }
      if (
        !isRoot &&
        field.resolve &&
        field.resolve !== ctx.defaultFieldResolver
      ) {
        return null;
      }
      child = compileValue(ctx, field.type, fieldNodes, false);
      if (!child) {
        return null;
      }
    }
    node.responseKeys.push(responseKey);
    node.keyTokens.push(jsonToken(responseKey));
    node.fieldNames.push(fieldName);
    node.children.push(child);
  }
  return node;
}

function compileValue(
  ctx: CompileContext,
  type: GraphQLOutputType,
  fieldNodes: FieldNode[],
  nonNull: boolean,
): PlanNode | null {
  if (isNonNullType(type)) {
    return compileValue(ctx, type.ofType, fieldNodes, true);
  }
  if (isListType(type)) {
    const ofNode = compileValue(ctx, type.ofType, fieldNodes, false);
    return ofNode && { kind: LIST, nonNull, ofNode };
  }
  if (isObjectType(type)) {
    return compileObject(
      ctx,
      type,
      fieldNodes.map((fieldNode) => fieldNode.selectionSet),
      false,
      nonNull,
    );
  }
  if (isEnumType(type)) {
    const values = new Set<string>();
    for (const enumValue of type.getValues()) {
      if (enumValue.value !== enumValue.name) {
        // the gateway would map the internal value
        return null;
      }
      values.add(enumValue.name);
    }
    return { kind: ENUM, nonNull, values };
  }
  if (isScalarType(type)) {
    switch (type.name) {
      case 'String':
      case 'ID':
        // an ID sent as a number is not accepted, the gateway would turn it into a string
        return { kind: STRING, nonNull };
      case 'Int':
        return { kind: INT, nonNull };
      case 'Float':
        return { kind: FLOAT, nonNull };
      case 'Boolean':
        return { kind: BOOLEAN, nonNull };
      default:
        return passesValuesThrough(type) ? { kind: ANY, nonNull } : null;
    }
  }
  // Interfaces and unions: the gateway adds `__typename` to the subgraph
  // selection, so the subgraph response is not the client response.
  return null;
}

/**
 * The plan for an operation whose response can be the response of one
 * subgraph, byte for byte, or `null` when the operation is not eligible:
 * a query with exactly one root field, without directives, selecting only
 * object types, enums and scalars the gateway passes through unchanged.
 */
export function compileRawForwardPlan(
  options: RawForwardPlanOptions,
  document: DocumentNode,
  operationName?: string | null,
): RawForwardPlan | null {
  const split = splitDocument(document, operationName);
  if (!split) {
    return null;
  }
  const { operation, fragments } = split;
  if (operation.operation !== 'query' || operation.directives?.length) {
    return null;
  }
  const queryType = options.schema.getQueryType();
  if (!queryType) {
    return null;
  }
  const root = compileObject(
    { ...options, fragments, nodes: 0 },
    queryType,
    [operation.selectionSet],
    true,
    true,
  );
  // One root field only: every root field is delegated on its own, and
  // batching renames the response keys when it merges the delegations.
  if (root?.responseKeys.length !== 1) {
    return null;
  }
  return { operation, root, rootKey: root.responseKeys[0]! };
}

function selectionMatches(
  schema: GraphQLSchema,
  fragments: Fragments,
  node: ObjectPlanNode,
  selectionSets: readonly (SelectionSetNode | undefined)[],
): boolean {
  const collected = collectFields(schema, fragments, node.type, selectionSets);
  if (collected?.size !== node.responseKeys.length) {
    return false;
  }
  let i = 0;
  for (const [responseKey, fieldNodes] of collected) {
    if (
      responseKey !== node.responseKeys[i] ||
      fieldNodes[0]!.name.value !== node.fieldNames[i]
    ) {
      return false;
    }
    let child = node.children[i++]!;
    while (child.kind === LIST) {
      child = child.ofNode;
    }
    if (child.kind === OBJECT) {
      if (
        !selectionMatches(
          schema,
          fragments,
          child,
          fieldNodes.map((fieldNode) => fieldNode.selectionSet),
        )
      ) {
        return false;
      }
    } else if (fieldNodes.some((fieldNode) => fieldNode.selectionSet)) {
      return false;
    }
  }
  return true;
}

/**
 * `true` when the document about to be sent to a subgraph produces, at every
 * position, the same response keys for the same fields in the same order as
 * the planned client operation. Key fields or `__typename` added for type
 * merging, renamed keys and split selections all make this `false`.
 */
export function subgraphDocumentMatchesPlan(
  schema: GraphQLSchema,
  plan: RawForwardPlan,
  document: DocumentNode,
): boolean {
  const split = splitDocument(document, undefined);
  if (
    !split ||
    split.operation.operation !== 'query' ||
    split.operation.directives?.length
  ) {
    return false;
  }
  return selectionMatches(schema, split.fragments, plan.root, [
    split.operation.selectionSet,
  ]);
}
