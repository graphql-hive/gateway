import {
  delegateToSchema,
  isSubschemaConfig,
  StitchingInfo,
} from '@graphql-tools/delegate';
import { getFragmentsFromDocument } from '@graphql-tools/executor';
import {
  collectFields,
  ExecutionRequest,
  getArgumentValues,
  getDefinedRootType,
  getOperationASTFromRequest,
} from '@graphql-tools/utils';
import { GraphQLSchema } from 'graphql';

/**
 * Creates an executor that uses the schema created by stitching together multiple subschemas.
 * Not ready for production
 * Breaking changes can be introduced in the meanwhile
 *
 * @experimental
 *
 */
export function createStitchingExecutor(stitchedSchema: GraphQLSchema) {
  const subschemas = [
    ...(
      stitchedSchema.extensions?.['stitchingInfo'] as StitchingInfo
    ).subschemaMap.values(),
  ];
  return async function stitchingExecutor(executorRequest: ExecutionRequest) {
    const fragments = getFragmentsFromDocument(executorRequest.document);
    const operation = getOperationASTFromRequest(executorRequest);
    const rootType = getDefinedRootType(stitchedSchema, operation.operation);
    const { fields } = collectFields(
      stitchedSchema,
      fragments,
      executorRequest.variables,
      rootType,
      operation.selectionSet,
    );
    const data: Record<string, any> = {};
    for (const [fieldName, fieldNodes] of fields) {
      const fieldNode = fieldNodes[0];
      if (!fieldNode) {
        continue;
      }
      const fieldInstance = rootType.getFields()[fieldName];
      if (!fieldInstance) {
        continue;
      }
      const responseKey = fieldNode.alias?.value ?? fieldName;
      const subschemaForField = subschemas.find((subschema) => {
        const subschemaSchema = isSubschemaConfig(subschema)
          ? subschema.schema
          : (subschema as GraphQLSchema);
        const rootType = getDefinedRootType(
          subschemaSchema,
          operation.operation,
        );
        return rootType.getFields()[fieldName] != null;
      });
      const args = getArgumentValues(
        fieldInstance,
        fieldNode!,
        executorRequest.variables,
      );
      let result = await delegateToSchema({
        schema: subschemaForField || stitchedSchema,
        rootValue: executorRequest.rootValue,
        args,
        context: executorRequest.context,
        info: {
          schema: stitchedSchema,
          fieldName,
          fieldNodes,
          operation,
          fragments,
          parentType: rootType,
          returnType: fieldInstance.type,
          variableValues: executorRequest.variables,
          rootValue: executorRequest.rootValue,
          path: { typename: undefined, key: responseKey, prev: undefined },
        },
      });
      if (Array.isArray(result)) {
        result = await Promise.all(result);
      }
      data[responseKey] = result;
    }
    return { data };
  };
}
