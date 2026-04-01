import type { GatewayContext } from '@graphql-hive/gateway-runtime';
import type { PubSub } from '@graphql-hive/pubsub';
import { getTypeInfo } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  ExecutionRequest,
  getDirectiveInExtensions,
  getOperationASTFromRequest,
  mapAsyncIterator,
  memoize1,
  memoize2,
  ResultVisitorMap,
  ValueVisitor,
  visitResult,
} from '@graphql-tools/utils';
import {
  BREAK,
  ExecutionResult,
  getNamedType,
  GraphQLNamedOutputType,
  GraphQLSchema,
  Kind,
  parse,
  print,
  SelectionSetNode,
  visit,
  visitWithTypeInfo,
} from 'graphql';

/**
 * @pubsubOperation
 */

const getPubsubOperationRootFields = memoize1(function (schema: GraphQLSchema) {
  const pubsubOperationFields = new Map<string, string>();
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
          for (const { pubsubTopic } of pubsubOperations) {
            pubsubOperationFields.set(fieldDef.name, pubsubTopic);
          }
        }
      }
    }
  }
  return pubsubOperationFields;
});

function resolvePubsubOperationRootField(
  responseKey: string,
  topicName: string,
  pubsub: PubSub,
) {
  return mapAsyncIterator(pubsub.subscribe(topicName), (payload) => ({
    data: {
      [responseKey]: payload,
    },
  }));
}

export function handlePubsubOperationField(
  supergraphSchema: GraphQLSchema,
  executionRequest: ExecutionRequest,
) {
  if (executionRequest.operationType === 'subscription') {
    const typeInfo = getTypeInfo(supergraphSchema);
    let responseKey: string | undefined;
    let fieldName: string | undefined;
    let selectionSet: SelectionSetNode | undefined;
    let returnType: GraphQLNamedOutputType | undefined;
    visit(
      executionRequest.document,
      visitWithTypeInfo(typeInfo, {
        Field(node) {
          const parentType = typeInfo.getParentType();
          if (parentType === supergraphSchema.getSubscriptionType()) {
            responseKey = node.alias?.value || node.name.value;
            fieldName = node.name.value;
            selectionSet = node.selectionSet;
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
      const pubsubTopic = pubsubOperationFields.get(fieldName);
      if (pubsubTopic) {
        const pubsub: PubSub = executionRequest.context?.pubsub;
        if (!pubsub) {
          throw createGraphQLError(
            `You have to configure a PubSub instance in the context to execute subscription operations with @pubsubOperation directive.`,
          );
        }
        let newExecutionRequest: ExecutionRequest | undefined;
        if (selectionSet && returnType) {
          const operationAST = getOperationASTFromRequest(executionRequest);
          const varDefs =
            operationAST.variableDefinitions?.filter(
              (varDef) => varDef.variable.name.value != 'representations',
            ) || [];
          varDefs.push({
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
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: 'Any',
                  },
                },
              },
            },
          });
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
        return {
          executionResult: resolvePubsubOperationRootField(
            responseKey,
            pubsubTopic,
            pubsub,
          ),
          responseKey,
          returnTypeName: returnType?.name,
          newExecutionRequest,
        };
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
