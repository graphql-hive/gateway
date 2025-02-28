import { getTypeInfo } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  getDirective,
  getDirectiveExtensions,
  memoize3,
} from '@graphql-tools/utils';
import {
  DocumentNode,
  getArgumentValues,
  getNamedType,
  GraphQLOutputType,
  GraphQLSchema,
  isCompositeType,
  isListType,
  visit,
  visitWithTypeInfo,
} from 'graphql';

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

export function createCalculateCost({
  defaultAssumedListSize,
  mutationCost = 10,
}: {
  defaultAssumedListSize?: number;
  mutationCost?: number;
}) {
  return memoize3(function calculateCost(
    schema: GraphQLSchema,
    document: DocumentNode,
    variables: Record<string, any>,
  ) {
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
          if (node.operation === 'mutation') {
            cost += mutationCost;
          }
        },
        Field: {
          enter(node) {
            let fieldCost: number = 0;
            const field = typeInfo.getFieldDef();
            if (field) {
              const fieldAnnotations =
                getDirectiveExtensions<DemandControlDirectives>(field, schema);
              if (fieldAnnotations?.cost) {
                for (const costAnnotation of fieldAnnotations.cost) {
                  if (costAnnotation?.weight) {
                    const weight = Number(costAnnotation.weight);
                    if (weight && !isNaN(weight)) {
                      fieldCost += weight;
                    }
                  }
                }
              }
              const returnType = typeInfo.getType();

              /** Calculate factor start */
              let factor = 1;
              const sizedFieldFactor = fieldFactorMap.get(field.name);
              if (sizedFieldFactor) {
                factor = sizedFieldFactor;
                fieldFactorMap.delete(field.name);
              } else if (fieldAnnotations?.listSize) {
                for (const listSizeAnnotation of fieldAnnotations.listSize) {
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
              } else if (defaultAssumedListSize && returnType) {
                const depth = getDepthOfListType(returnType);
                if (depth > 0) {
                  factor = defaultAssumedListSize * depth;
                }
              }
              factorQueue.push(factor);
              /** Calculate factor end */

              const namedReturnType = getNamedType(returnType);
              if (namedReturnType) {
                const namedReturnTypeAnnotations =
                  getDirectiveExtensions<DemandControlDirectives>(
                    namedReturnType,
                    schema,
                  );
                if (namedReturnTypeAnnotations.cost) {
                  for (const costAnnotation of namedReturnTypeAnnotations.cost) {
                    if (costAnnotation?.weight) {
                      const weight = Number(costAnnotation?.weight);
                      if (weight && !isNaN(weight)) {
                        fieldCost += weight;
                      }
                    }
                  }
                } else if (isCompositeType(namedReturnType)) {
                  fieldCost += 1;
                }
              }
              if (fieldCost) {
                cost += timesFactor(fieldCost);
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
