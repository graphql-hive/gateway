import { LegacyLogger } from '@graphql-hive/logger';
import {
  getOnSubgraphExecute,
  getStitchingDirectivesTransformerForSubschema,
  getTransportEntryMapUsingFusionAndFederationDirectives,
  handleFederationSubschema,
  handleResolveToDirectives,
  OnSubgraphExecuteHook,
  restoreExtraDirectives,
  TransportEntry,
} from '@graphql-mesh/fusion-runtime';
import { defaultPrintFn } from '@graphql-mesh/transport-common';
import { OnDelegateHook } from '@graphql-mesh/types';
import { getInContextSDK } from '@graphql-mesh/utils';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  defaultMergedResolver,
  delegateToSchema,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  asArray,
  getDirectiveExtensions,
  IResolvers,
  isDocumentNode,
  mergeDeep,
  parseSelectionSet,
  printSchemaWithDirectives,
  TypeSource,
} from '@graphql-tools/utils';
import { wrapSchema } from '@graphql-tools/wrap';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import {
  buildASTSchema,
  buildSchema,
  GraphQLSchema,
  isSchema,
  parse,
} from 'graphql';
import { mergeSchemas } from 'graphql-yoga';
import {
  handleUnifiedGraphConfig,
  UnifiedGraphConfig,
} from './handleUnifiedGraphConfig';
import {
  GatewayConfigContext,
  GatewayConfigSubgraph,
  GatewayPlugin,
} from './types';
import { checkIfDataSatisfiesSelectionSet } from './utils';

export function serveSubgraph<TContext extends Record<string, any>>(
  config: GatewayConfigSubgraph<TContext>,
  configContext: GatewayConfigContext,
  getUnifiedGraph: () => GraphQLSchema,
  setUnifiedGraph: (unifiedGraph: GraphQLSchema) => void,
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[],
  onDelegateHooks: OnDelegateHook<any>[],
  instrumentation: GatewayPlugin['instrumentation'],
): {
  contextBuilder: <T>(base: T) => T;
  getSchema: () => MaybePromise<GraphQLSchema>;
  schemaInvalidator: () => void;
  unifiedGraphPlugin: GatewayPlugin;
} {
  let contextBuilder: <T>(base: T) => T = (base) => base;
  const subgraphInConfig = config.subgraph;
  let getSubschemaConfig$: MaybePromise<boolean> | undefined;
  let subschemaConfig: SubschemaConfig;
  let lastLoadedUnifiedGraph: UnifiedGraphConfig | undefined;
  let transportExecutorStack: AsyncDisposableStack | undefined;
  function getSubschemaConfig() {
    if (getSubschemaConfig$ == null) {
      pausePolling();
      getSubschemaConfig$ = handleMaybePromise(
        () => handleUnifiedGraphConfig(subgraphInConfig, configContext),
        (newUnifiedGraph) => {
          if (lastLoadedUnifiedGraph === newUnifiedGraph) {
            continuePolling();
            return true;
          }
          lastLoadedUnifiedGraph = newUnifiedGraph;
          return handleMaybePromise(
            () => transportExecutorStack?.disposeAsync(),
            () => {
              transportExecutorStack = new AsyncDisposableStack();
              if (isSchema(newUnifiedGraph)) {
                setUnifiedGraph(newUnifiedGraph);
              } else if (isDocumentNode(newUnifiedGraph)) {
                setUnifiedGraph(
                  buildASTSchema(newUnifiedGraph, {
                    assumeValid: true,
                    assumeValidSDL: true,
                  }),
                );
              } else {
                setUnifiedGraph(
                  buildSchema(newUnifiedGraph, {
                    assumeValid: true,
                    assumeValidSDL: true,
                  }),
                );
              }
              setUnifiedGraph(restoreExtraDirectives(getUnifiedGraph()));
              subschemaConfig = {
                name: getDirectiveExtensions(getUnifiedGraph())?.[
                  'transport'
                ]?.[0]?.['subgraph'],
                schema: getUnifiedGraph(),
              };
              const transportEntryMap: Record<string, TransportEntry> =
                getTransportEntryMapUsingFusionAndFederationDirectives(
                  getUnifiedGraph(),
                  config.transportEntries,
                );
              const additionalTypeDefs: TypeSource[] = [];

              const stitchingDirectivesTransformer =
                getStitchingDirectivesTransformerForSubschema();
              const onSubgraphExecute = getOnSubgraphExecute({
                onSubgraphExecuteHooks,
                ...(config.transports ? { transports: config.transports } : {}),
                transportContext: {
                  ...configContext,
                  logger: LegacyLogger.from(configContext.log),
                },
                transportEntryMap,
                getSubgraphSchema: getUnifiedGraph,
                transportExecutorStack,
                instrumentation: () => instrumentation,
              });
              subschemaConfig = handleFederationSubschema({
                subschemaConfig,
                additionalTypeDefs,
                stitchingDirectivesTransformer,
                onSubgraphExecute,
              });
              // TODO: Find better alternative later
              setUnifiedGraph(wrapSchema(subschemaConfig));
              const entities = Object.keys(subschemaConfig.merge || {});
              let entitiesDef = 'union _Entity';
              if (entities.length) {
                entitiesDef += ` = ${entities.join(' | ')}`;
              }
              const additionalResolvers: IResolvers[] = asArray(
                'additionalResolvers' in config
                  ? config.additionalResolvers
                  : [],
              ).filter((r) => r != null);
              const queryTypeName =
                getUnifiedGraph().getQueryType()?.name || 'Query';
              const finalTypeDefs = handleResolveToDirectives(
                parse(/* GraphQL */ `
                type ${queryTypeName} {
                  ${entities.length ? '_entities(representations: [_Any!]!): [_Entity]!' : ''}
                  _service: _Service!
                }

                scalar _Any
                ${entities.length ? entitiesDef : ''}
                type _Service {
                  sdl: String
                }
              `),
                additionalTypeDefs,
                additionalResolvers,
              );
              additionalResolvers.push({
                [queryTypeName]: {
                  _service() {
                    return {
                      sdl() {
                        if (isSchema(newUnifiedGraph)) {
                          return printSchemaWithDirectives(newUnifiedGraph);
                        }
                        if (isDocumentNode(newUnifiedGraph)) {
                          return defaultPrintFn(newUnifiedGraph);
                        }
                        return newUnifiedGraph;
                      },
                    };
                  },
                },
              });
              if (entities.length) {
                additionalResolvers.push({
                  [queryTypeName]: {
                    _entities(_root, args, context, info) {
                      if (Array.isArray(args.representations)) {
                        return args.representations.map(
                          (representation: any) => {
                            const typeName = representation.__typename;
                            const mergeConfig =
                              subschemaConfig.merge?.[typeName];
                            const entryPoints = mergeConfig?.entryPoints || [
                              mergeConfig,
                            ];
                            const satisfiedEntryPoint = entryPoints.find(
                              (entryPoint) => {
                                if (entryPoint?.selectionSet) {
                                  const selectionSet = parseSelectionSet(
                                    entryPoint.selectionSet,
                                    {
                                      noLocation: true,
                                    },
                                  );
                                  return checkIfDataSatisfiesSelectionSet(
                                    selectionSet,
                                    representation,
                                  );
                                }
                                return true;
                              },
                            );
                            if (satisfiedEntryPoint) {
                              if (satisfiedEntryPoint.key) {
                                return handleMaybePromise(
                                  () =>
                                    batchDelegateToSchema({
                                      schema: subschemaConfig,
                                      ...(satisfiedEntryPoint.fieldName
                                        ? {
                                            fieldName:
                                              satisfiedEntryPoint.fieldName,
                                          }
                                        : {}),
                                      key: satisfiedEntryPoint.key!(
                                        representation,
                                      ),
                                      ...(satisfiedEntryPoint.argsFromKeys
                                        ? {
                                            argsFromKeys:
                                              satisfiedEntryPoint.argsFromKeys,
                                          }
                                        : {}),
                                      ...(satisfiedEntryPoint.valuesFromResults
                                        ? {
                                            valuesFromResults:
                                              satisfiedEntryPoint.valuesFromResults,
                                          }
                                        : {}),
                                      context,
                                      info,
                                    }),
                                  (res) => mergeDeep([representation, res]),
                                );
                              }
                              if (satisfiedEntryPoint.args) {
                                return handleMaybePromise(
                                  () =>
                                    delegateToSchema({
                                      schema: subschemaConfig,
                                      ...(satisfiedEntryPoint.fieldName
                                        ? {
                                            fieldName:
                                              satisfiedEntryPoint.fieldName,
                                          }
                                        : {}),
                                      args: satisfiedEntryPoint.args!(
                                        representation,
                                      ),
                                      context,
                                      info,
                                    }),
                                  (res) => mergeDeep([representation, res]),
                                );
                              }
                            }
                            return representation;
                          },
                        );
                      }
                      return [];
                    },
                  },
                });
              }
              setUnifiedGraph(
                mergeSchemas({
                  assumeValid: true,
                  assumeValidSDL: true,
                  schemas: [getUnifiedGraph()],
                  typeDefs: finalTypeDefs,
                  resolvers: additionalResolvers,
                  defaultFieldResolver: defaultMergedResolver,
                }),
              );
              contextBuilder = <T>(base: T) =>
                Object.assign(
                  // @ts-expect-error - Typings are wrong in legacy Mesh
                  base,
                  getInContextSDK(
                    getUnifiedGraph(),
                    // @ts-expect-error - Typings are wrong in legacy Mesh
                    [subschemaConfig],
                    LegacyLogger.from(configContext.log),
                    onDelegateHooks,
                  ),
                ) as T;
              continuePolling();
              return true;
            },
          );
        },
      );
    }
    return getSubschemaConfig$;
  }
  let currentTimeout: ReturnType<typeof setTimeout>;
  const pollingInterval = config.pollingInterval;
  function continuePolling() {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }
    if (pollingInterval) {
      currentTimeout = setTimeout(() => {
        getSubschemaConfig$ = undefined;
      }, pollingInterval);
    }
  }
  function pausePolling() {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }
  }
  return {
    contextBuilder,
    getSchema: () => handleMaybePromise(getSubschemaConfig, getUnifiedGraph),
    schemaInvalidator: () => {
      getSubschemaConfig$ = undefined;
    },
    unifiedGraphPlugin: {
      onDispose() {
        pausePolling();
        return transportExecutorStack?.disposeAsync();
      },
    },
  };
}
