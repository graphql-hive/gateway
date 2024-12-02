import {
  AsyncExecutor,
  createGraphQLError,
  ExecutionResult,
  Executor,
  inspect,
  isAsyncIterable,
  mapMaybePromise,
  MaybePromise,
  SyncExecutor,
} from '@graphql-tools/utils';
import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLSchema,
  IntrospectionOptions,
  IntrospectionQuery,
  parse,
  ParseOptions,
} from 'graphql';

function getSchemaFromIntrospection(
  introspectionResult: ExecutionResult<IntrospectionQuery>,
  options?: Parameters<typeof buildClientSchema>[1],
): GraphQLSchema {
  if (introspectionResult?.data?.__schema) {
    return buildClientSchema(introspectionResult.data, options);
  }
  if (introspectionResult?.errors) {
    const graphqlErrors = introspectionResult.errors.map((error) =>
      createGraphQLError(error.message, error),
    );
    if (introspectionResult.errors.length === 1) {
      throw graphqlErrors[0];
    } else {
      throw new AggregateError(
        graphqlErrors,
        'Could not obtain introspection result',
      );
    }
  }
  throw createGraphQLError(
    `Could not obtain introspection result, received the following as response; \n ${inspect(
      introspectionResult,
    )}`,
  );
}

export type SchemaFromExecutorOptions = Partial<IntrospectionOptions> &
  Parameters<typeof buildClientSchema>[1] &
  ParseOptions;

export function schemaFromExecutor(
  executor: SyncExecutor,
  context?: Record<string, any>,
  options?: SchemaFromExecutorOptions,
): GraphQLSchema;
export function schemaFromExecutor(
  executor: AsyncExecutor,
  context?: Record<string, any>,
  options?: SchemaFromExecutorOptions,
): Promise<GraphQLSchema>;
export function schemaFromExecutor(
  executor: Executor,
  context?: Record<string, any>,
  options?: SchemaFromExecutorOptions,
): MaybePromise<GraphQLSchema>;
export function schemaFromExecutor(
  executor: Executor,
  context?: Record<string, any>,
  options?: SchemaFromExecutorOptions,
): MaybePromise<GraphQLSchema> {
  const parsedIntrospectionQuery = parse(
    getIntrospectionQuery(options as any),
    options,
  );
  return mapMaybePromise(
    mapMaybePromise(
      executor({
        document: parsedIntrospectionQuery,
        context,
      }),
      (introspection) => {
        if (isAsyncIterable(introspection)) {
          const iterator = introspection[Symbol.asyncIterator]();
          return iterator.next().then(({ value }) => value);
        }
        return introspection;
      },
    ),
    (introspection) => getSchemaFromIntrospection(introspection, options),
  );
}
