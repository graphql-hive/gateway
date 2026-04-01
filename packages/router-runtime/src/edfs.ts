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
  getDirectiveInExtensions,
  getOperationASTFromRequest,
  MaybeAsyncIterable,
  MaybePromise,
  memoize1,
  memoize2,
  mergeDeep,
  ResultVisitorMap,
  ValueVisitor,
  visitResult,
} from '@graphql-tools/utils';
import {
  ArgumentNode,
  BREAK,
  ExecutionResult,
  getNamedType,
  GraphQLNamedOutputType,
  GraphQLSchema,
  Kind,
  parse,
  print,
  SelectionSetNode,
  valueFromASTUntyped,
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

const getPubsubOperationRootFields = memoize1(function (schema: GraphQLSchema) {
  const pubsubOperationFields = new Map<
    string,
    {
      pubsubTopic: string;
      filterBy?: string;
      result?: string;
    }
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
            pubsubOperationFields.set(
              fieldDef.name,
              operationDef as PubSubOperationOptions,
            );
          }
        }
      }
    }
  }
  return pubsubOperationFields;
});

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

export function handlePubsubOperationField(
  supergraphSchema: GraphQLSchema,
  executionRequest: ExecutionRequest,
  executeSubgraph: (
    executionRequest: ExecutionRequest,
  ) => MaybePromise<MaybeAsyncIterable<ExecutionResult>>,
) {
  if (executionRequest.operationType === 'subscription') {
    const typeInfo = getTypeInfo(supergraphSchema);
    let responseKey: string | undefined;
    let fieldName: string | undefined;
    let selectionSet: SelectionSetNode | undefined;
    let returnType: GraphQLNamedOutputType | undefined;
    let argNodes: readonly ArgumentNode[] | undefined;
    visit(
      executionRequest.document,
      visitWithTypeInfo(typeInfo, {
        Field(node) {
          const parentType = typeInfo.getParentType();
          if (parentType === supergraphSchema.getSubscriptionType()) {
            responseKey = node.alias?.value || node.name.value;
            fieldName = node.name.value;
            selectionSet = node.selectionSet;
            argNodes = node.arguments;
            const fieldDef = typeInfo.getFieldDef();
            if (fieldDef) {
              returnType = getNamedType(fieldDef.type);
            }
            return BREAK;
          }
          return node;
        },
      }),
    );
    if (responseKey && fieldName) {
      const pubsubOperationFields =
        getPubsubOperationRootFields(supergraphSchema);
      const pubsubOperationOptions = pubsubOperationFields.get(fieldName);
      if (pubsubOperationOptions) {
        let newExecutionRequest: ExecutionRequest | undefined;
        if (selectionSet && returnType) {
          const operationAST = getOperationASTFromRequest(executionRequest);
          const varDefs =
            operationAST.variableDefinitions?.filter(
              (varDef) => varDef.variable.name.value != 'representations',
            ) || [];
          varDefs.push(REPRESENTATIONS_VAR_DEF);
          const varDefsStr = varDefs.map((varDef) => print(varDef)).join(', ');
          const newDocument = parse(/* GraphQL */ `
                query ${executionRequest.operationName || ''}(${varDefsStr}) {
                    _entities(representations: $representations) {
                        __typename
                        ... on ${returnType.name} ${print(selectionSet)}
                    }
                } 
            `);
          newExecutionRequest = {
            ...executionRequest,
            document: newDocument,
          };
        }
        const args: Record<string, any> = {};
        if (argNodes) {
          for (const argNode of argNodes) {
            const argName = argNode.name.value;
            const argValueNode = argNode.value;
            args[argName] = valueFromASTUntyped(
              argValueNode,
              executionRequest.variables,
            );
          }
        }
        if (newExecutionRequest) {
          const returnTypeName = returnType?.name;
          return handleMaybePromiseMaybeAsyncIterable(
            () =>
              resolvePubsubOperationRootField(
                pubsubOperationOptions,
                responseKey!,
                {
                  root: executionRequest.rootValue,
                  args,
                  context: executionRequest.context,
                },
              ),
            (executionResult: ExecutionResult<any>) => {
              if (executionResult.data?.[responseKey!] != null) {
                const representations = asArray(
                  executionResult.data[responseKey!],
                );
                if (returnTypeName) {
                  for (const representation of representations) {
                    representation.__typename = returnTypeName;
                  }
                }
                return handleMaybePromiseMaybeAsyncIterable(
                  () =>
                    executeSubgraph({
                      ...newExecutionRequest,
                      variables: {
                        ...newExecutionRequest.variables,
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
                            mergeDeep(
                              [entity, representation],
                              false,
                              true,
                              true,
                            ),
                          );
                        }
                      }
                      return executionResult;
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
              return executionResult;
            },
          ) as AsyncIterable<ExecutionResult>;
        }
      }
    }
  }
  return false;
}

/** @pubsubPublish */

const getPubsubPublishVisitor = memoize2(function getPubsubPublishFields(
  schema: GraphQLSchema,
  pubsub: PubSub,
) {
  const pubsubPublishVisitor: ResultVisitorMap = {};
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
              const typeVisitor = (pubsubPublishVisitor[typeName] ||=
                {}) as Record<string, ValueVisitor>;
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
        }
      }
    }
  }
  if (!Object.keys(pubsubPublishVisitor).length) {
    return false;
  }
  return pubsubPublishVisitor;
});

export function handleResultWithPubSubPublish(
  schema: GraphQLSchema,
  request: ExecutionRequest<any, GatewayContext>,
  result: ExecutionResult,
) {
  if (result.data != null && request.context?.pubsub != null) {
    const pubsubPublishVisitor = getPubsubPublishVisitor(
      schema,
      request.context.pubsub,
    );
    if (pubsubPublishVisitor) {
      return visitResult(result, request, schema, pubsubPublishVisitor);
    }
  }
}
