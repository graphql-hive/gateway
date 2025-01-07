import { createDefaultExecutor } from '@graphql-tools/delegate';
import {
  ExecutionRequest,
  ExecutionResult,
  mapMaybePromise,
} from '@graphql-tools/utils';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { GraphQLSchema } from 'graphql';
import { kebabCase } from 'lodash';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

export interface LocalSchemaItem {
  name: string;
  schema: GraphQLSchema;
}

export async function getStitchedSchemaFromLocalSchemas(
  localSchemas: Record<string, GraphQLSchema>,
  onSubgraphExecute?: (
    subgraph: string,
    executionRequest: ExecutionRequest,
    result: ExecutionResult | AsyncIterable<ExecutionResult>,
  ) => void,
): Promise<GraphQLSchema> {
  const supergraphSdl = await composeLocalSchemasWithApollo(
    Object.entries(localSchemas).map(([name, schema]) => ({
      name,
      schema,
      url: `http://localhost/${name}`,
    })),
  );
  function createTracedExecutor(name: string, schema: GraphQLSchema) {
    const executor = createDefaultExecutor(schema);
    return function tracedExecutor(request: ExecutionRequest) {
      const result = executor(request);
      if (onSubgraphExecute) {
        return mapMaybePromise(result, (result) => {
          onSubgraphExecute(name, request, result);
          return result;
        });
      }
      return result;
    };
  }
  return getStitchedSchemaFromSupergraphSdl({
    supergraphSdl,
    onSubschemaConfig(subschemaConfig) {
      const [name, localSchema] =
        Object.entries(localSchemas).find(
          ([key]) => kebabCase(key) === kebabCase(subschemaConfig.name),
        ) || [];
      if (name && localSchema) {
        subschemaConfig.executor = createTracedExecutor(name, localSchema);
      } else {
        throw new Error(`Unknown subgraph ${subschemaConfig.name}`);
      }
    },
  });
}
