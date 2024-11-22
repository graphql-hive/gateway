import {
  getUnifiedGraphGracefully,
  type SubgraphConfig,
} from '@graphql-mesh/fusion-composition';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import { isAsyncIterable, mapMaybePromise } from '@graphql-tools/utils';
import {
  buildSchema,
  GraphQLSchema,
  lexicographicSortSchema,
  parse,
  printSchema,
  validate,
} from 'graphql';
import { expect } from 'vitest';
import {
  UnifiedGraphManager,
  UnifiedGraphManagerOptions,
} from '../src/unifiedGraphManager';

export function composeAndGetPublicSchema(subgraphs: SubgraphConfig[]) {
  const manager = new UnifiedGraphManager({
    getUnifiedGraph: () => getUnifiedGraphGracefully(subgraphs),
    transports() {
      return {
        getSubgraphExecutor({ subgraphName }) {
          const schema = subgraphs.find(
            (subgraph) => subgraph.name === subgraphName,
          )?.schema;
          if (!schema) {
            throw new Error(`Subgraph not found: ${subgraphName}`);
          }
          return createDefaultExecutor(schema);
        },
      };
    },
  });
  return manager.getUnifiedGraph();
}

export function composeAndGetExecutor<TContext>(
  subgraphs: SubgraphConfig[],
  opts?: Partial<UnifiedGraphManagerOptions<TContext>>,
) {
  const manager = new UnifiedGraphManager({
    getUnifiedGraph: () => getUnifiedGraphGracefully(subgraphs),
    transports() {
      return {
        getSubgraphExecutor({ subgraphName }) {
          const subgraph = subgraphs.find(
            (subgraph) => subgraph.name === subgraphName,
          );
          if (!subgraph) {
            throw new Error(`Subgraph not found: ${subgraphName}`);
          }
          return createDefaultExecutor(subgraph.schema);
        },
      };
    },
    ...opts,
  });
  return function testExecutor({
    query,
    variables: variableValues,
    context,
  }: {
    query: string;
    variables?: Record<string, any>;
    context?: any;
  }) {
    const document = parse(query);
    return mapMaybePromise(manager.getUnifiedGraph(), (schema) => {
      const validationErrors = validate(schema, document);
      if (validationErrors.length === 1) {
        throw validationErrors[0];
      }
      if (validationErrors.length > 1) {
        throw new AggregateError(validationErrors);
      }
      return mapMaybePromise(manager.getContext(context), (contextValue) =>
        mapMaybePromise(
          normalizedExecutor({
            schema,
            document,
            contextValue,
            variableValues,
          }),
          (res) => {
            if (isAsyncIterable(res)) {
              throw new Error('AsyncIterable is not supported');
            }
            if (res.errors?.length === 1) {
              throw res.errors[0];
            }
            if (res.errors?.length) {
              throw new AggregateError(res.errors);
            }
            return res.data;
          },
        ),
      );
    });
  };
}

export function expectTheSchemaSDLToBe(schema: GraphQLSchema, sdl: string) {
  const schemaFromSdl = buildSchema(sdl, {
    noLocation: true,
    assumeValid: true,
    assumeValidSDL: true,
  });
  const sortedSchemaFromSdl = printSchema(
    lexicographicSortSchema(schemaFromSdl),
  );
  const sortedGivenSchema = printSchema(lexicographicSortSchema(schema));
  expect(sortedGivenSchema).toBe(sortedSchemaFromSdl);
}
