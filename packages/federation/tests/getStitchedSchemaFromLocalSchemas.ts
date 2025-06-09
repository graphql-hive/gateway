import { createDefaultExecutor } from '@graphql-tools/delegate';
import { executorFromSchema } from '@graphql-tools/executor';
import {
  ExecutionRequest,
  ExecutionResult,
  getDocumentNodeFromSchema,
} from '@graphql-tools/utils';
import {
  assertSingleExecutionValue,
  composeLocalSchemasWithApollo,
} from '@internal/testing';
import { composeServices } from '@theguild/federation-composition';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GraphQLSchema, parse } from 'graphql';
import { kebabCase } from 'lodash';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

export interface LocalSchemaItem {
  name: string;
  schema: GraphQLSchema;
}

export interface StitchedSchemaFromLocalSchemasOptions {
  localSchemas: Record<string, GraphQLSchema>;
  onSubgraphExecute?: (
    subgraph: string,
    executionRequest: ExecutionRequest,
    result: ExecutionResult | AsyncIterable<ExecutionResult>,
  ) => void;
  composeWith?: 'apollo' | 'guild';
  ignoreRules?: string[];
  relayObjectIdentification?: boolean;
}

export async function getStitchedSchemaFromLocalSchemas({
  localSchemas,
  onSubgraphExecute,
  composeWith = 'apollo',
  ignoreRules,
  relayObjectIdentification,
}: StitchedSchemaFromLocalSchemasOptions): Promise<GraphQLSchema> {
  let supergraphSdl: string;
  if (composeWith === 'apollo') {
    supergraphSdl = await composeLocalSchemasWithApollo(
      Object.entries(localSchemas).map(([name, schema]) => ({
        name,
        schema,
        url: `http://localhost/${name}`,
      })),
    );
  } else if (composeWith === 'guild') {
    const result = composeServices(
      Object.entries(localSchemas).map(([name, schema]) => ({
        name,
        typeDefs: getDocumentNodeFromSchema(schema),
        url: `http://localhost/${name}`,
      })),
      { disableValidationRules: ignoreRules },
    );
    result.errors?.forEach((error) => {
      console.error(error);
    });
    if (!result.supergraphSdl) {
      throw new Error('Failed to compose services');
    }
    supergraphSdl = result.supergraphSdl;
  } else {
    throw new Error(`Unknown composeWith ${composeWith}`);
  }
  function createTracedExecutor(name: string, schema: GraphQLSchema) {
    const executor = createDefaultExecutor(schema);
    return function tracedExecutor(request: ExecutionRequest) {
      return handleMaybePromise(
        () => executor(request),
        (result) => {
          onSubgraphExecute?.(name, request, result);
          return result;
        },
      );
    };
  }
  return getStitchedSchemaFromSupergraphSdl({
    supergraphSdl,
    relayObjectIdentification,
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

export async function stitchLocalSchemas(
  opts: StitchedSchemaFromLocalSchemasOptions,
) {
  const schema = await getStitchedSchemaFromLocalSchemas(opts);
  const executor = executorFromSchema(schema);
  return {
    schema,
    async execute({
      query,
      variables,
    }: {
      query: string;
      variables?: Record<string, any>;
    }) {
      const result = await executor({ document: parse(query), variables });
      assertSingleExecutionValue(result);
      return result;
    },
  };
}
