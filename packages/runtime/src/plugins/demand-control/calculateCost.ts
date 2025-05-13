import {
  getTypeInfo,
} from '@graphql-tools/delegate';
import {
  createGraphQLError,
  getDirective,
  getDirectiveExtensions,
  memoize1,
  memoize3,
  isIntrospectionType,
  isListType,
  getArgumentValues,
  getNamedType,
} from '@graphql-tools/utils';
import {
  DocumentNode,
  FieldNode,
  GraphQLNamedOutputType,
  GraphQLOutputType,
  GraphQLSchema,
  OperationTypeNode,
  TypeInfo,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import { getDirectiveNameForFederationDirective } from '../../utils';

type ListSizeAnnotation =
  | {
      slicingArguments: string[];
      requireOneSlicingArgument: boolean;
      sizedFields?: string[];
    }
  | {
      assumedSize: number;
    };

type CostAnnotation = {
  weight: number;
};

type DemandControlDirectives = {
  cost?: CostAnnotation;
  listSize?: ListSizeAnnotation;
};

function getDepthOfListType(type: GraphQLOutputType) {
  let depth = 0;
  while (isListType(type)) {
    depth++;
    type = type.ofType;
  }
  return depth;
}

export const getCostListSizeDirectiveNames = memoize1(
  function getCostListSizeDirectiveNames(schema: GraphQLSchema) {
    const costDirectiveName = getDirectiveNameForFederationDirective({
      schema,
      directiveName: 'cost',
      specUrl: 'https://specs.apollo.dev/cost/v0.1',
    });
    const listSizeDirectiveName = getDirectiveNameForFederationDirective({
      schema,
      directiveName: 'listSize',
      specUrl: 'https://specs.apollo.dev/cost/v0.1',
    });
    return {
      cost: costDirectiveName,
      listSize: listSizeDirectiveName,
    } as {
      cost: 'cost';
      listSize: 'listSize';
    };
  },
);

export function createCalculateCost({
  listSize,
  operationTypeCost,
  typeCost,
  fieldCost,
}: {
  listSize: number;
  operationTypeCost(operationType: OperationTypeNode): number;
  typeCost(type: GraphQLNamedOutputType): number;
  fieldCost?(fieldNode: FieldNode, typeInfo: TypeInfo): number;
}) {
  return memoize3(function calculateCost(
    schema: GraphQLSchema,
    document: DocumentNode,
    variables: Record<string, any>,
  ) {
    const { cost: costDirectiveName, listSize: listSizeDirectiveName } =
      getCostListSizeDirectiveNames(schema);
    let cost = 0;
    const factorQueue: number[] = [];
    function timesFactor(c: number) {
      for (const f of factorQueue) {
        c *= f;
      }
      return c;
    }
    const fieldFactorMap = new Map<string, number>();
    const typeInfo = getTypeInfo(schema);
    visit(
      document,
      visitWithTypeInfo(typeInfo, {
        OperationTypeDefinition(node) {
          cost += operationTypeCost(node.operation) || 0;
        },
        Field: {
          enter(node) {
            let currentFieldCost: number = 0;
            const field = typeInfo.getFieldDef();
            if (field) {
              const fieldAnnotations =
                getDirectiveExtensions<DemandControlDirectives>(field, schema);
              const factoryResult = fieldCost?.(node, typeInfo);
              if (factoryResult) {
                currentFieldCost += factoryResult;
              } else if (fieldAnnotations?.[costDirectiveName]) {
                for (const costAnnotation of fieldAnnotations[
                  costDirectiveName
                ]) {
                  if (costAnnotation?.weight) {
                    const weight = Number(costAnnotation.weight);
                    if (weight && !isNaN(weight)) {
                      currentFieldCost += weight;
                    }
                  }
                }
              }
              const returnType = typeInfo.getType();

              /** Calculate factor start */
              let factor = 1;
              const sizedFieldFactor = fieldFactorMap.get(node.name.value);
              if (sizedFieldFactor) {
                factor = sizedFieldFactor;
                fieldFactorMap.delete(field.name);
              } else if (fieldAnnotations?.[listSizeDirectiveName]) {
                for (const listSizeAnnotation of fieldAnnotations[
                  listSizeDirectiveName
                ]) {
                  if (listSizeAnnotation) {
                    if ('slicingArguments' in listSizeAnnotation) {
                      const slicingArguments =
                        listSizeAnnotation.slicingArguments;
                      const argValues = getArgumentValues(
                        field,
                        node,
                        variables,
                      );
                      let factorSet = false;
                      let slicingArgumentFactor: number = 1;
                      for (const slicingArgument of slicingArguments) {
                        const value = argValues[slicingArgument];
                        const numValue = Number(value);
                        if (numValue && !isNaN(numValue)) {
                          slicingArgumentFactor = Math.max(
                            slicingArgumentFactor,
                            numValue,
                          );
                          if (
                            factorSet &&
                            listSizeAnnotation.requireOneSlicingArgument !==
                              false
                          ) {
                            throw createGraphQLError(
                              `Only one slicing argument is allowed on field "${field.name}"; found multiple slicing arguments "${slicingArguments.join(', ')}"`,
                              {
                                extensions: {
                                  code: 'COST_QUERY_PARSE_FAILURE',
                                },
                              },
                            );
                          }
                          factorSet = true;
                        }
                      }
                      if (listSizeAnnotation.sizedFields?.length) {
                        for (const sizedField of listSizeAnnotation.sizedFields) {
                          fieldFactorMap.set(sizedField, slicingArgumentFactor);
                        }
                      } else {
                        factor = slicingArgumentFactor;
                      }
                    } else if ('assumedSize' in listSizeAnnotation) {
                      const assumedSizeVal = listSizeAnnotation.assumedSize;
                      const numValue = Number(assumedSizeVal);
                      if (numValue && !isNaN(numValue)) {
                        factor = numValue;
                      }
                    }
                  }
                }
              } else if (listSize && returnType) {
                const depth = getDepthOfListType(returnType);
                if (depth > 0) {
                  factor = listSize * depth;
                }
              }
              factorQueue.push(factor);
              /** Calculate factor end */

              if (returnType) {
                const namedReturnType = getNamedType(returnType);
                if (isIntrospectionType(namedReturnType)) {
                  return;
                }
                const namedReturnTypeAnnotations =
                  getDirectiveExtensions<DemandControlDirectives>(
                    namedReturnType,
                    schema,
                  );
                if (namedReturnTypeAnnotations?.[costDirectiveName]) {
                  for (const costAnnotation of namedReturnTypeAnnotations[
                    costDirectiveName
                  ]) {
                    if (costAnnotation?.weight) {
                      const weight = Number(costAnnotation?.weight);
                      if (weight && !isNaN(weight)) {
                        currentFieldCost += weight;
                      }
                    }
                  }
                } else {
                  currentFieldCost += typeCost(namedReturnType);
                }
              }
              if (currentFieldCost) {
                cost += timesFactor(currentFieldCost);
              }
            }
          },
          leave() {
            factorQueue.pop();
          },
        },
        Directive() {
          const directive = typeInfo.getDirective();
          if (directive) {
            const directiveCostAnnotations = getDirective(
              schema,
              directive,
              'cost',
            );
            if (directiveCostAnnotations) {
              for (const costAnnotation of directiveCostAnnotations) {
                if (costAnnotation['weight']) {
                  const weight = Number(costAnnotation['weight']);
                  if (weight && !isNaN(weight)) {
                    cost += timesFactor(weight);
                  }
                }
              }
            }
          }
        },
        Argument() {
          const argument = typeInfo.getArgument();
          if (argument) {
            const argumentCostAnnotations = getDirective(
              schema,
              argument,
              'cost',
            );
            if (argumentCostAnnotations) {
              for (const costAnnotation of argumentCostAnnotations) {
                if (costAnnotation['weight']) {
                  const weight = Number(costAnnotation['weight']);
                  if (weight && !isNaN(weight)) {
                    cost += timesFactor(weight);
                  }
                }
              }
            }
          }
        },
      }),
    );
    return cost;
  });
}
