import {
  createDefaultExecutor,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import { normalizedExecutor } from '@graphql-tools/executor';
import {
  buildSubgraphSchema as buildToolsSubgraphSchema,
  filterInternalFieldsAndTypes,
  getSubschemaForFederationWithSchema,
} from '@graphql-tools/federation';
import { stitchSchemas } from '@graphql-tools/stitch';
import {
  federationToStitchingSDL,
  stitchingDirectives,
} from '@graphql-tools/stitching-directives';
import { ExecutionResult, IResolvers } from '@graphql-tools/utils';
import {
  buildClientSchema,
  buildSchema,
  DocumentNode,
  getIntrospectionQuery,
  lexicographicSortSchema,
  parse,
  print,
  printSchema,
  validate,
} from 'graphql';
import '@internal/testing/to-be-similar-gql-doc';
import { ApolloGateway, LocalGraphQLDataSource } from '@apollo/gateway';
import { buildSubgraphSchema as buildApolloSubgraph } from '@apollo/subgraph';
import { createExampleSetup } from '@internal/e2e';
import { beforeEach, describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';
import {
  BuildSubgraphSchemaFn,
  getServiceInputs,
  getSupergraph,
  ServiceInput,
} from './fixtures/gateway/supergraph';

interface BuiltGateway {
  executor(document: DocumentNode): Promise<ExecutionResult>;
  serviceCallCounts: Record<string, number>;
}

interface TestScenario {
  name: string;
  buildSubgraphSchema: BuildSubgraphSchemaFn;
  buildGateway(serviceInputs: ServiceInput[]): Promise<BuiltGateway>;
}

const { query, result } = createExampleSetup(__dirname);

describe('Federation', () => {
  const buildStitchingGateway = async (
    serviceInputs: ServiceInput[],
  ): Promise<BuiltGateway> => {
    const serviceCallCounts: Record<string, number> = {};
    const subschemas: SubschemaConfig[] = await Promise.all(
      serviceInputs.map(async ({ schema, name }) => {
        serviceCallCounts[name] = 0;
        const subschema = await getSubschemaForFederationWithSchema(schema);
        const executor = createDefaultExecutor(schema);
        return {
          ...subschema,
          executor: async (executionRequest) => {
            serviceCallCounts[name]!++;
            return executor(executionRequest);
          },
        };
      }),
    );
    let gatewaySchema = stitchSchemas({
      subschemas,
    });
    gatewaySchema = filterInternalFieldsAndTypes(gatewaySchema);

    return {
      executor: (doc) =>
        normalizedExecutor({
          schema: gatewaySchema,
          document: doc,
        }) as Promise<ExecutionResult>,
      serviceCallCounts,
    };
  };
  const buildApolloGateway = async (
    serviceInputs: ServiceInput[],
  ): Promise<BuiltGateway> => {
    const serviceCallCounts: Record<string, number> = {};
    const gateway = new ApolloGateway({
      serviceList: serviceInputs.map(({ name }) => ({
        name,
        url: `http://www.${name}.com`,
      })),
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      buildService({ name }) {
        const schema = serviceInputs.find(({ name: n }) => n === name)!.schema;
        serviceCallCounts[name] = 0;
        const source = new LocalGraphQLDataSource(schema);
        return {
          process(opts) {
            serviceCallCounts[name]!++;
            return source.process(opts);
          },
        };
      },
    });
    await gateway.load();
    return {
      executor: (document: DocumentNode) =>
        gateway.executor({
          document,
          request: {
            query: print(document),
          },
          cache: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => true,
          },
          schema: gateway.schema!,
          context: {},
        } as any) as Promise<ExecutionResult>,
      serviceCallCounts,
    };
  };
  const buildSubgraphWithApollo = (options: {
    typeDefs: DocumentNode;
    resolvers: IResolvers;
  }) =>
    buildApolloSubgraph([
      {
        typeDefs: options.typeDefs,
        resolvers: options.resolvers as any,
      },
    ]);

  let supergraphSdl: string;

  const buildApolloGatewayWithSupergraph = async (
    serviceInputs: ServiceInput[],
  ) => {
    const serviceCallCounts: Record<string, number> = {};
    const gateway = new ApolloGateway({
      supergraphSdl,
      buildService({ name }) {
        const schema = serviceInputs.find(({ name: n }) => n === name)!.schema;
        serviceCallCounts[name] = 0;
        const source = new LocalGraphQLDataSource(schema);
        return {
          process(opts) {
            serviceCallCounts[name]!++;
            return source.process(opts);
          },
        };
      },
    });
    await gateway.load();
    return {
      executor: (document: DocumentNode) =>
        gateway.executor({
          document,
          request: {
            query: print(document),
          },
          cache: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => true,
          },
          schema: gateway.schema!,
          context: {},
        } as any) as Promise<ExecutionResult>,
      serviceCallCounts,
    };
  };

  const buildStitchingGatewayWithSupergraph = async (
    serviceInputs: ServiceInput[],
  ) => {
    const serviceCallCounts: Record<string, number> = {};
    const gatewaySchema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl,
      onSubschemaConfig(subschemaConfig) {
        const subgraphName = subschemaConfig.name.toLowerCase();
        serviceCallCounts[subgraphName] = 0;
        const serviceInput = serviceInputs.find(
          ({ name }) => name === subgraphName,
        );
        if (!serviceInput) {
          throw new Error(`Service ${subgraphName} not found`);
        }
        const schema = serviceInput.schema;
        const executor = createDefaultExecutor(schema);
        subschemaConfig.executor = function subschemaExecutor(
          executionRequest,
        ) {
          serviceCallCounts[subgraphName]!++;
          const errors = validate(schema, executionRequest.document);
          if (errors.length > 0) {
            return {
              errors,
            };
          }
          return executor(executionRequest);
        };
      },
      batch: true,
    });

    return {
      executor: async (document: DocumentNode) => {
        const errors = validate(gatewaySchema, document);
        if (errors.length > 0) {
          return {
            errors,
          };
        }
        return normalizedExecutor({
          schema: gatewaySchema,
          document,
        }) as Promise<ExecutionResult>;
      },
      serviceCallCounts,
    };
  };
  const buildStitchingGatewayByConversion = async (
    serviceInputs: ServiceInput[],
  ) => {
    const { stitchingDirectivesTransformer } = stitchingDirectives();
    const serviceCallCounts: Record<string, number> = {};
    const subschemas: SubschemaConfig[] = serviceInputs.map(
      ({ typeDefs, schema, name }) => {
        const executor = createDefaultExecutor(schema);
        const stitchingSdl = federationToStitchingSDL(print(typeDefs));
        const subschemaSchema = buildSchema(stitchingSdl, {
          assumeValidSDL: true,
          assumeValid: true,
        });
        serviceCallCounts[name] = 0;
        return {
          schema: subschemaSchema,
          executor(executionRequest) {
            serviceCallCounts[name]!++;
            const errors = validate(schema, executionRequest.document);
            if (errors.length > 0) {
              return {
                errors,
              };
            }
            return executor(executionRequest);
          },
        };
      },
    );
    let gatewaySchema = stitchSchemas({
      subschemas,
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
    });
    gatewaySchema = filterInternalFieldsAndTypes(gatewaySchema);
    return {
      executor: async (document: DocumentNode) => {
        const errors = validate(gatewaySchema, document);
        if (errors.length > 0) {
          return {
            errors,
          };
        }
        return normalizedExecutor({
          schema: gatewaySchema,
          document,
        }) as Promise<ExecutionResult>;
      },
      serviceCallCounts,
    };
  };
  const scenarios: TestScenario[] = [
    {
      name: 'Tools Gateway vs. Tools Subgraph',
      buildSubgraphSchema: buildToolsSubgraphSchema,
      buildGateway: buildStitchingGateway,
    },
    {
      name: 'Tools Gateway vs. Apollo Subgraph',
      buildSubgraphSchema: buildSubgraphWithApollo,
      buildGateway: buildStitchingGateway,
    },
    {
      name: 'Apollo Gateway vs. Tools Subgraph',
      buildSubgraphSchema: buildToolsSubgraphSchema,
      buildGateway: buildApolloGateway,
    },
    {
      name: 'Apollo Gateway with Supergraph vs. Tools Subgraph',
      buildSubgraphSchema: buildToolsSubgraphSchema,
      buildGateway: buildApolloGatewayWithSupergraph,
    },
    {
      name: 'Tools Gateway with Supergraph vs. Apollo Subgraph',
      buildSubgraphSchema: buildSubgraphWithApollo,
      buildGateway: buildStitchingGatewayWithSupergraph,
    },
    {
      name: 'Tools Gateway with Supergraph vs. Tools Subgraph',
      buildSubgraphSchema: buildToolsSubgraphSchema,
      buildGateway: buildStitchingGatewayWithSupergraph,
    },
    {
      name: 'Tools Gateway by converting Federation to Stitching SDL vs. Tools Subgraph',
      buildSubgraphSchema: buildToolsSubgraphSchema,
      buildGateway: buildStitchingGatewayByConversion,
    },
    {
      name: 'Tools Gateway by converting Federation to Stitching SDL vs. Apollo Subgraph',
      buildSubgraphSchema: buildSubgraphWithApollo,
      buildGateway: buildStitchingGatewayByConversion,
    },
  ];
  for (const { name, buildSubgraphSchema, buildGateway } of scenarios) {
    describe(name, () => {
      let builtGateway: BuiltGateway;
      beforeEach(async () => {
        const serviceInputs: ServiceInput[] =
          getServiceInputs(buildSubgraphSchema);
        supergraphSdl = await getSupergraph(buildSubgraphSchema);
        builtGateway = await buildGateway(serviceInputs);
      });
      it('should generate the correct schema', async () => {
        const result = await builtGateway.executor(
          parse(getIntrospectionQuery()),
        );
        const schema = buildClientSchema(result.data);
        expect(printSchema(lexicographicSortSchema(schema))).toBeSimilarGqlDoc(
          /* GraphQL */ `
            type Product {
              inStock: Boolean
              name: String
              price: Int
              reviews: [Review]
              shippingEstimate: Int
              upc: String!
              weight: Int
            }

            type Query {
              me: User
              topProducts(first: Int = 5): [Product]
              users: [User]
              user(id: ID!): User
            }

            type Review {
              author: User
              body: String
              id: ID!
              product: Product
            }

            type User {
              id: ID!
              name: String
              numberOfReviews: Int
              reviews: [Review]
              username: String
            }
          `,
        );
      });
      it('should give the correct result', async () => {
        const execResult = await builtGateway.executor(parse(query));
        expect(execResult).toEqual(result);
        /*
        expect(builtGateway.serviceCallCounts).toMatchObject({
          accounts: 2,
          inventory: 2,
          products: 2,
          reviews: 2,
        });
        */
      });
    });
  }
});
