import {
  StitchingInfo,
  Subschema,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import { mergeTypeDefs } from '@graphql-tools/merge';
import {
  getRootTypeMap,
  getRootTypes,
  GraphQLParseOptions,
  inspect,
  rewireTypes,
  TypeSource,
} from '@graphql-tools/utils';
import { wrapSchema } from '@graphql-tools/wrap';
import {
  DocumentNode,
  GraphQLDirective,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  isDirective,
  isInterfaceType,
  isIntrospectionType,
  isNamedType,
  isSpecifiedScalarType,
  OperationTypeNode,
  SchemaDefinitionNode,
  SchemaExtensionNode,
} from 'graphql';
import { extractDefinitions } from './definitions.js';
import { mergeCandidates } from './mergeCandidates.js';
import { mergeDirectives } from './mergeDirectives.js';
import typeFromAST from './typeFromAST.js';
import {
  MergeTypeCandidate,
  MergeTypeFilter,
  OnTypeConflict,
  TypeMergingOptions,
} from './types.js';

type CandidateSelector<TContext = Record<string, any>> = (
  candidates: Array<MergeTypeCandidate<TContext>>,
) => MergeTypeCandidate<TContext>;

export function buildTypeCandidates<
  TContext extends Record<string, any> = Record<string, any>,
>({
  subschemas,
  originalSubschemaMap,
  types,
  typeDefs,
  parseOptions,
  directiveMap,
  schemaDefs,
  mergeDirectives: isMergeDirectives,
}: {
  subschemas: Array<Subschema<any, any, any, TContext>>;
  originalSubschemaMap: Map<
    Subschema<any, any, any, TContext>,
    GraphQLSchema | SubschemaConfig<any, any, any, TContext>
  >;
  types: Array<GraphQLNamedType>;
  typeDefs: TypeSource;
  parseOptions: GraphQLParseOptions;
  directiveMap: Record<string, GraphQLDirective>;
  schemaDefs: {
    schemaDef: SchemaDefinitionNode;
    schemaExtensions: Array<SchemaExtensionNode>;
  };
  mergeDirectives?: boolean | undefined;
}): [
  Record<string, Array<MergeTypeCandidate<TContext>>>,
  Record<OperationTypeNode, string>,
  DocumentNode[],
] {
  const directiveCandidates = new Map<string, Set<GraphQLDirective>>(
    Object.entries(directiveMap).map(([name, directive]) => [
      name,
      new Set([directive]),
    ]),
  );
  const extensions: Array<DocumentNode> = [];
  const typeCandidates: Record<
    string,
    Array<MergeTypeCandidate<TContext>>
  > = Object.create(null);

  let schemaDef: SchemaDefinitionNode | undefined;
  let schemaExtensions: Array<SchemaExtensionNode> = [];

  let document: DocumentNode | undefined;
  let extraction: ReturnType<typeof extractDefinitions> | undefined;
  if (
    (typeDefs && !Array.isArray(typeDefs)) ||
    (Array.isArray(typeDefs) && typeDefs.length)
  ) {
    document = mergeTypeDefs(typeDefs, parseOptions);
    extraction = extractDefinitions(document);
    schemaDef = extraction.schemaDefs[0];
    schemaExtensions = schemaExtensions.concat(extraction.schemaExtensions);
  }

  schemaDefs.schemaDef = schemaDef ?? schemaDefs.schemaDef;
  schemaDefs.schemaExtensions = schemaExtensions;

  const rootTypeNameMap = getRootTypeNameMap(schemaDefs);

  for (const subschema of subschemas) {
    const schema = (subschema.transformedSchema = wrapSchema(subschema));

    const rootTypeMap = getRootTypeMap(schema);
    const rootTypes = getRootTypes(schema);

    for (const [operation, rootType] of rootTypeMap.entries()) {
      addTypeCandidate(typeCandidates, rootTypeNameMap[operation], {
        type: rootType,
        subschema: originalSubschemaMap.get(subschema),
        transformedSubschema: subschema,
      });
    }

    if (isMergeDirectives === true) {
      for (const directive of schema.getDirectives()) {
        let directiveCandidatesForName = directiveCandidates.get(
          directive.name,
        );
        if (directiveCandidatesForName == null) {
          directiveCandidatesForName = new Set();
          directiveCandidates.set(directive.name, directiveCandidatesForName);
        }
        directiveCandidatesForName.add(directive);
      }
    }

    const originalTypeMap = schema.getTypeMap();
    for (const typeName in originalTypeMap) {
      const type = originalTypeMap[typeName] as GraphQLNamedType;
      if (
        isNamedType(type) &&
        !isIntrospectionType(type) &&
        !rootTypes.has(type as GraphQLObjectType)
      ) {
        addTypeCandidate(typeCandidates, type.name, {
          type,
          subschema: originalSubschemaMap.get(subschema),
          transformedSubschema: subschema,
        });
      }
    }
  }

  if (document != null && extraction != null) {
    for (const def of extraction.typeDefinitions) {
      const type = typeFromAST(def);
      if (!isNamedType(type)) {
        throw new Error(`Expected to get named typed but got ${inspect(def)}`);
      }
      if (type != null) {
        // There is a bug in interface types that causes them to not have _interfaces
        // if they are not used in a schema. This is a workaround for that.
        if (isInterfaceType(type)) {
          try {
            type.getInterfaces();
          } catch {
            Object.defineProperty(type, '_interfaces', {
              value: [],
            });
          }
        }
        addTypeCandidate(typeCandidates, type.name, { type });
      }
    }

    for (const def of extraction.directiveDefs) {
      const directive = typeFromAST(def);
      if (!isDirective(directive)) {
        throw new Error(
          `Expected to get directive type but got ${inspect(def)}`,
        );
      }
      let directiveCandidatesForName = directiveCandidates.get(directive.name);
      if (directiveCandidatesForName == null) {
        directiveCandidatesForName = new Set();
        directiveCandidates.set(directive.name, directiveCandidatesForName);
      }
      directiveCandidatesForName.add(directive);
    }

    if (extraction.extensionDefs.length > 0) {
      extensions.push({
        ...document,
        definitions: extraction.extensionDefs,
      });
    }
  }

  for (const type of types) {
    addTypeCandidate(typeCandidates, type.name, { type });
  }

  for (const [
    directiveName,
    directiveCandidatesForName,
  ] of directiveCandidates) {
    directiveMap[directiveName] = mergeDirectives(directiveCandidatesForName)!;
  }

  return [typeCandidates, rootTypeNameMap, extensions];
}

function getRootTypeNameMap({
  schemaDef,
  schemaExtensions,
}: {
  schemaDef: SchemaDefinitionNode;
  schemaExtensions: Array<SchemaExtensionNode>;
}): Record<OperationTypeNode, string> {
  const rootTypeNameMap: Record<OperationTypeNode, string> = {
    query: 'Query',
    mutation: 'Mutation',
    subscription: 'Subscription',
  };

  const allNodes: Array<SchemaDefinitionNode | SchemaExtensionNode> =
    schemaExtensions.slice();
  if (schemaDef != null) {
    allNodes.unshift(schemaDef);
  }

  for (const node of allNodes) {
    if (node.operationTypes != null) {
      for (const operationType of node.operationTypes) {
        rootTypeNameMap[operationType.operation] =
          operationType.type.name.value;
      }
    }
  }

  return rootTypeNameMap;
}

function addTypeCandidate<TContext = Record<string, any>>(
  typeCandidates: Record<string, Array<MergeTypeCandidate<TContext>>>,
  name: string,
  typeCandidate: MergeTypeCandidate<TContext>,
) {
  if (!typeCandidates[name]) {
    typeCandidates[name] = [];
  }
  typeCandidates[name].push(typeCandidate);
}

export function buildTypes<TContext = Record<string, any>>({
  typeCandidates,
  directives,
  stitchingInfo,
  rootTypeNames,
  onTypeConflict,
  mergeTypes,
  typeMergingOptions,
}: {
  typeCandidates: Record<string, Array<MergeTypeCandidate<TContext>>>;
  directives: Array<GraphQLDirective>;
  stitchingInfo: StitchingInfo<TContext>;
  rootTypeNames: Array<string>;
  onTypeConflict?: OnTypeConflict<TContext>;
  mergeTypes: boolean | Array<string> | MergeTypeFilter<TContext>;
  typeMergingOptions?: TypeMergingOptions<TContext>;
}): {
  typeMap: Record<string, GraphQLNamedType>;
  directives: Array<GraphQLDirective>;
} {
  const typeMap: Record<string, GraphQLNamedType> = Object.create(null);

  for (const typeName in typeCandidates) {
    if (
      rootTypeNames.includes(typeName) ||
      (mergeTypes === true &&
        !typeCandidates[typeName]?.some((candidate) =>
          isSpecifiedScalarType(candidate.type),
        )) ||
      (typeof mergeTypes === 'function' &&
        mergeTypes(typeCandidates[typeName]!, typeName)) ||
      (Array.isArray(mergeTypes) && mergeTypes.includes(typeName)) ||
      (stitchingInfo != null && typeName in stitchingInfo.mergedTypes)
    ) {
      typeMap[typeName] = mergeCandidates(
        typeName,
        typeCandidates[typeName]!,
        typeMergingOptions,
      );
    } else {
      const candidateSelector =
        onTypeConflict != null
          ? onTypeConflictToCandidateSelector(onTypeConflict)
          : (cands: Array<MergeTypeCandidate<TContext>>) =>
              cands[cands.length - 1];
      typeMap[typeName] = candidateSelector(typeCandidates[typeName]!)!.type;
    }
  }

  return rewireTypes(typeMap, directives);
}

function onTypeConflictToCandidateSelector<TContext = Record<string, any>>(
  onTypeConflict: OnTypeConflict<TContext>,
): CandidateSelector<TContext> {
  return (cands) =>
    cands.reduce((prev, next) => {
      const type = onTypeConflict(prev.type, next.type, {
        left: {
          subschema: prev.subschema,
          transformedSubschema: prev.transformedSubschema,
        },
        right: {
          subschema: next.subschema,
          transformedSubschema: next.transformedSubschema,
        },
      });
      if (prev.type === type) {
        return prev;
      } else if (next.type === type) {
        return next;
      }
      return {
        schemaName: 'unknown',
        type,
      };
    });
}
