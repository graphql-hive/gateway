import type { GatewayContext } from '@graphql-hive/gateway-runtime';
import type { PubSub } from '@graphql-hive/pubsub';
import {
  getResolverForPubSubOperation,
  type PubSubOperationOptions,
} from '@graphql-mesh/utils';
import { getTypeInfo } from '@graphql-tools/delegate';
import {
  asArray,
  ExecutionRequest,
  getDirectiveExtensions,
  getDirectiveInExtensions,
  MaybeAsyncIterable,
  MaybePromise,
  memoize2,
  mergeDeep,
  parseSelectionSet,
  ResultVisitorMap,
  ValueVisitor,
  visitResult,
} from '@graphql-tools/utils';
import {
  ArgumentNode,
  BREAK,
  DocumentNode,
  ExecutionResult,
  getNamedType,
  GraphQLSchema,
  isEnumType,
  Kind,
  OperationTypeNode,
  SelectionSetNode,
  valueFromASTUntyped,
  VariableDefinitionNode,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import { handleMaybePromiseMaybeAsyncIterable } from './utils';

/**
 * @pubsubOperation
 */

const REPRESENTATIONS_VAR_DEF = Object.freeze({
  kind: Kind.VARIABLE_DEFINITION,
  variable: {
    kind: Kind.VARIABLE,
    name: {
      kind: Kind.NAME,
      value: 'representations',
    },
  },
  type: {
    kind: Kind.NON_NULL_TYPE,
    type: {
      kind: Kind.LIST_TYPE,
      type: {
        kind: Kind.NON_NULL_TYPE,
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: '_Any',
          },
        },
      },
    },
  },
} as const);

export interface PubsubOperationRootFieldsMetadata {
  pubsubTopic: string;
  filterBy?: string;
  result?: string;
  entityTypeName?: string;
}

export function getEntityResolutionMap(supergraphSchema: GraphQLSchema) {
  const entityResolutionMap = new Map<
    string,
    Record<string, SelectionSetNode>
  >();
  const realSubgraphNames = new Map<string, string>();
  const joinGraph = supergraphSchema.getType('join__Graph');
  if (isEnumType(joinGraph)) {
    for (const value of joinGraph.getValues()) {
      const valueDirectives = getDirectiveExtensions(value, supergraphSchema);
      const graphName = valueDirectives?.['join__graph']?.[0]?.['name'];
      if (graphName) {
        realSubgraphNames.set(value.name, graphName);
      }
    }
  }
  for (const typeName in supergraphSchema.getTypeMap()) {
    const type = supergraphSchema.getType(typeName);
    if (type) {
      const directives = getDirectiveExtensions(type, supergraphSchema);
      const joinTypeDirective = directives?.['join__type'];
      if (joinTypeDirective) {
        for (const joinTypeDirectiveArgs of joinTypeDirective) {
          const subgraphName = joinTypeDirectiveArgs['graph'];
          const keySelectionSetStr = joinTypeDirectiveArgs['key'];
          const resolvable = joinTypeDirectiveArgs['resolvable'] !== false;
          if (subgraphName && keySelectionSetStr && resolvable) {
            const realSubgraphName =
              realSubgraphNames.get(subgraphName) || subgraphName;
            entityResolutionMap.set(typeName, {
              [realSubgraphName]: parseSelectionSet(
                `{ ${keySelectionSetStr} }`,
              ),
            });
          }
        }
      }
    }
  }
  return entityResolutionMap;
}

export function getPubsubOperationRootFields(
  schema: GraphQLSchema,
  entityResolutionMap: Map<string, Record<string, SelectionSetNode>>,
) {
  const pubsubOperationFields = new Map<
    string,
    PubsubOperationRootFieldsMetadata
  >();
  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    const subscriptionFields = subscriptionType.getFields();
    for (const fieldName in subscriptionFields) {
      const fieldDef = subscriptionFields[fieldName];
      if (fieldDef) {
        const pubsubOperations = getDirectiveInExtensions(
          fieldDef,
          'pubsubOperation',
        );
        if (pubsubOperations) {
          for (const operationDef of pubsubOperations) {
            const returnType = getNamedType(fieldDef.type);
            const entityResolution = entityResolutionMap.has(returnType.name);
            pubsubOperationFields.set(fieldDef.name, {
              pubsubTopic: operationDef['pubsubTopic'],
              filterBy: operationDef['filterBy'],
              result: operationDef['result'],
              entityTypeName: entityResolution ? returnType.name : undefined,
            });
          }
        }
      }
    }
  }
  return pubsubOperationFields;
}

export interface PubsubOperationFieldResolverOpts {
  root: any;
  args: Record<string, any>;
  context: GatewayContext;
}

function resolvePubsubOperationRootField(
  opts: PubSubOperationOptions,
  responseKey: string,
  resolverOpts: PubsubOperationFieldResolverOpts,
): MaybePromise<AsyncIterable<ExecutionResult>> {
  const pubsubOperationResolver = getResolverForPubSubOperation(
    opts,
    (payload) => ({
      data: {
        [responseKey]: payload,
      },
    }),
  );
  return handleMaybePromiseMaybeAsyncIterable(
    () =>
      pubsubOperationResolver.subscribe(
        resolverOpts.root,
        resolverOpts.args,
        resolverOpts.context,
        undefined!,
      ),
    (root) =>
      pubsubOperationResolver.resolve(
        root,
        resolverOpts.args,
        resolverOpts.context,
        undefined!,
      ),
  );
}

const getSubscriptionInformationFromDocument = memoize2(
  function getSubscriptionInformationFromDocument(
    supergraphSchema: GraphQLSchema,
    document: DocumentNode,
  ) {
    const typeInfo = getTypeInfo(supergraphSchema);
    let responseKey: string | undefined;
    let fieldName: string | undefined;
    let selectionSet: SelectionSetNode | undefined;
    let argNodes: readonly ArgumentNode[] | undefined;
    let variableDefinitions: readonly VariableDefinitionNode[] | undefined;
    visit(
      document,
      visitWithTypeInfo(typeInfo, {
        OperationDefinition(node) {
          variableDefinitions = node.variableDefinitions;
        },
        Field(node) {
          const parentType = typeInfo.getParentType();
          if (parentType === supergraphSchema.getSubscriptionType()) {
            responseKey = node.alias?.value || node.name.value;
            fieldName = node.name.value;
            selectionSet = node.selectionSet;
            argNodes = node.arguments;
            return BREAK;
          }
          return node;
        },
      }),
    );
    return {
      responseKey,
      fieldName,
      selectionSet,
      argNodes,
      variableDefinitions,
    };
  },
);

function getArgsFromArgumentNodes(
  argNodes: readonly ArgumentNode[] | undefined,
  variables: Record<string, any> | undefined,
) {
  const args: Record<string, any> = {};
  if (argNodes) {
    for (const argNode of argNodes) {
      const argName = argNode.name.value;
      const argValueNode = argNode.value;
      args[argName] = valueFromASTUntyped(argValueNode, variables);
    }
  }
  return args;
}

function resolvePubsubOperationResult(
  executionRequest: ExecutionRequest,
  executionResult: ExecutionResult,
  pubsubOperationMetadata: PubsubOperationRootFieldsMetadata,
  responseKey: string,
  executeSubgraph: (
    executionRequest: ExecutionRequest,
  ) => MaybePromise<MaybeAsyncIterable<ExecutionResult>>,
  variableDefinitions?: readonly VariableDefinitionNode[],
  selectionSet?: SelectionSetNode,
) {
  if (
    pubsubOperationMetadata.entityTypeName &&
    selectionSet &&
    executionResult.data?.[responseKey!] != null
  ) {
    const representations: any[] = asArray(
      executionResult.data[responseKey!],
    ).filter(Boolean);
    if (representations.length) {
      for (const representation of representations) {
        representation.__typename ||= pubsubOperationMetadata.entityTypeName;
      }
      const varDefs = [...(variableDefinitions || [])];
      varDefs.push(REPRESENTATIONS_VAR_DEF);
      const entityResolutionDocument: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [
          {
            kind: Kind.OPERATION_DEFINITION,
            operation: 'query' as OperationTypeNode,
            name: executionRequest.operationName
              ? {
                  kind: Kind.NAME,
                  value: executionRequest.operationName,
                }
              : undefined,
            variableDefinitions: varDefs,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: '_entities',
                  },
                  arguments: [
                    {
                      kind: Kind.ARGUMENT,
                      name: {
                        kind: Kind.NAME,
                        value: 'representations',
                      },
                      value: {
                        kind: Kind.VARIABLE,
                        name: {
                          kind: Kind.NAME,
                          value: 'representations',
                        },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: '__typename',
                        },
                      },
                      {
                        kind: Kind.INLINE_FRAGMENT,
                        typeCondition: {
                          kind: Kind.NAMED_TYPE,
                          name: {
                            kind: Kind.NAME,
                            value: pubsubOperationMetadata.entityTypeName!,
                          },
                        },
                        selectionSet,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };
      return handleMaybePromiseMaybeAsyncIterable(
        () =>
          executeSubgraph({
            ...executionRequest,
            document: entityResolutionDocument,
            variables: {
              ...executionRequest.variables,
              representations,
            },
          }),
        (entitiesResult: ExecutionResult<any>) => {
          if (entitiesResult?.data?._entities?.length) {
            const entities = asArray(entitiesResult.data._entities);
            for (let i = 0; i < entities.length; i++) {
              const entity = entities[i];
              const representation = representations[i];
              if (entity != null && representation != null) {
                Object.assign(
                  representation,
                  mergeDeep([entity, representation], false, true, true),
                );
              }
            }
          }
          if (entitiesResult?.errors?.length) {
            executionResult.errors ||= [];
            // @ts-expect-error - it is writable
            executionResult.errors.push(...entitiesResult.errors);
          }
          return executionResult;
        },
      );
    }
  }
  return executionResult;
}

export function handlePubsubOperationField(
  supergraphSchema: GraphQLSchema,
  executionRequest: ExecutionRequest,
  pubsubOperationMetadataMap: Map<string, PubsubOperationRootFieldsMetadata>,
  executeSubgraph: (
    executionRequest: ExecutionRequest,
  ) => MaybePromise<MaybeAsyncIterable<ExecutionResult>>,
): MaybePromise<MaybeAsyncIterable<ExecutionResult>> {
  if (
    executionRequest.operationType === 'subscription' &&
    pubsubOperationMetadataMap.size > 0
  ) {
    const {
      responseKey,
      fieldName,
      selectionSet,
      argNodes,
      variableDefinitions,
    } = getSubscriptionInformationFromDocument(
      supergraphSchema,
      executionRequest.document,
    );
    if (responseKey && fieldName) {
      const pubsubOperationMetadata = pubsubOperationMetadataMap.get(fieldName);
      if (pubsubOperationMetadata) {
        const args = getArgsFromArgumentNodes(
          argNodes,
          executionRequest.variables,
        );
        return handleMaybePromiseMaybeAsyncIterable(
          () =>
            resolvePubsubOperationRootField(
              pubsubOperationMetadata,
              responseKey!,
              {
                root: executionRequest.rootValue,
                args,
                context: executionRequest.context,
              },
            ),
          (executionResult: ExecutionResult) =>
            resolvePubsubOperationResult(
              executionRequest,
              executionResult,
              pubsubOperationMetadata,
              responseKey!,
              executeSubgraph,
              variableDefinitions,
              selectionSet,
            ),
        );
      }
    }
  }
  return executeSubgraph(executionRequest);
}

/** @pubsubPublish */

export interface PubsubPublishMetadata {
  pubsubTopic: string;
  entityInfo?: Record<string, SelectionSetNode>;
}

export function getPubsubPublishMetadata(
  schema: GraphQLSchema,
  entityResolutionMap: Map<string, Record<string, SelectionSetNode>>,
) {
  // Pubsub publish metadata by typename and fieldname
  const pubsubPublishMetadataMap: Map<
    string,
    Map<string, PubsubPublishMetadata>
  > = new Map();
  for (const typeName in schema.getTypeMap()) {
    const type = schema.getType(typeName);
    if (type != null && 'getFields' in type) {
      const fields = type.getFields();
      for (const fieldName in fields) {
        const fieldDef = fields[fieldName];
        if (fieldDef) {
          const pubsubPublishes = getDirectiveInExtensions(
            fieldDef,
            'pubsubPublish',
          );
          if (pubsubPublishes) {
            for (const { pubsubTopic } of pubsubPublishes) {
              let typeMap = pubsubPublishMetadataMap.get(typeName);
              if (!typeMap) {
                typeMap = new Map<string, PubsubPublishMetadata>();
                pubsubPublishMetadataMap.set(typeName, typeMap);
              }
              const returnType = getNamedType(fieldDef.type);
              const returnTypeName = returnType.name;
              const entityInfo = entityResolutionMap.get(returnTypeName);
              typeMap.set(fieldName, { pubsubTopic, entityInfo });
            }
          }
        }
      }
    }
  }
  return pubsubPublishMetadataMap;
}

export function addEntityResolutionFieldsForPubsubPublish(
  schema: GraphQLSchema,
  executionRequest: ExecutionRequest,
  subgraphName: string,
  metadata: Map<string, Map<string, PubsubPublishMetadata>>,
) {
  if (executionRequest.operationType === 'mutation' && metadata.size > 0) {
    const typeInfo = getTypeInfo(schema);
    let changed = false;
    const document = visit(
      executionRequest.document,
      visitWithTypeInfo(typeInfo, {
        [Kind.FIELD](node) {
          const parentType = typeInfo.getParentType();
          const fieldDef = typeInfo.getFieldDef();
          if (parentType && fieldDef) {
            const typeMetadata = metadata.get(parentType.name);
            const fieldMetadata = typeMetadata?.get(fieldDef.name);
            const entitySelectionSet =
              fieldMetadata?.entityInfo?.[subgraphName];
            if (entitySelectionSet) {
              changed = true;
              return {
                ...node,
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [
                    ...(node.selectionSet?.selections || []),
                    ...entitySelectionSet.selections,
                  ],
                },
              };
            }
          }
          return node;
        },
      }),
    );
    if (changed) {
      return {
        ...executionRequest,
        document,
      };
    }
  }
  return executionRequest;
}

const getPubsubPublishVisitor = memoize2(function getPubsubPublishFields(
  metadata: Map<string, Map<string, PubsubPublishMetadata>>,
  pubsub: PubSub,
) {
  if (!metadata.size) {
    return false;
  }
  const pubsubPublishVisitor: ResultVisitorMap = {};
  for (const [typeName, fieldsMap] of metadata) {
    const typeVisitor = (pubsubPublishVisitor[typeName] ||= {}) as Record<
      string,
      ValueVisitor
    >;
    for (const [fieldName, { pubsubTopic }] of fieldsMap) {
      typeVisitor[fieldName] = (value) => {
        const maybePromise = pubsub.publish(pubsubTopic, value);
        if (
          maybePromise &&
          typeof (maybePromise as Promise<void>).catch === 'function'
        ) {
          (maybePromise as Promise<void>).catch(() => {
            // Swallow publish errors to avoid unhandled promise rejections.
          });
        }
        return value;
      };
    }
  }
  return pubsubPublishVisitor;
});

export function handleResultWithPubSubPublish(
  schema: GraphQLSchema,
  metadata: Map<string, Map<string, PubsubPublishMetadata>>,
  request: ExecutionRequest<any, GatewayContext>,
  result: ExecutionResult,
) {
  if (
    request.operationType === 'mutation' &&
    result.data != null &&
    request.context?.pubsub != null
  ) {
    const pubsubPublishVisitor = getPubsubPublishVisitor(
      metadata,
      request.context.pubsub,
    );
    if (pubsubPublishVisitor) {
      return visitResult(result, request, schema, pubsubPublishVisitor);
    }
  }
  return result;
}
