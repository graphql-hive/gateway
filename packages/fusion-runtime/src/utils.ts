import { getInstrumented } from '@envelop/instrumentation';
import { LegacyLogger, Logger } from '@graphql-hive/logger';
import {
  defaultPrintFn,
  type Transport,
  type TransportContext,
  type TransportEntry,
  type TransportGetSubgraphExecutor,
  type TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import { isDisposable, iterateAsync } from '@graphql-mesh/utils';
import { getBatchingExecutor } from '@graphql-tools/batch-execute';
import {
  DelegationPlanBuilder,
  MergedTypeResolver,
  Subschema,
} from '@graphql-tools/delegate';
import {
  getDirectiveExtensions,
  isAsyncIterable,
  isDocumentNode,
  mergeDeep,
  printSchemaWithDirectives,
  type ExecutionRequest,
  type Executor,
  type Maybe,
  type MaybePromise,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
} from '@whatwg-node/promise-helpers';
import { constantCase } from 'change-case';
import {
  FragmentDefinitionNode,
  GraphQLError,
  isEnumType,
  SelectionNode,
  SelectionSetNode,
  type DocumentNode,
  type ExecutionResult,
  type GraphQLSchema,
} from 'graphql';
import type { GraphQLOutputType, GraphQLResolveInfo } from 'graphql/type';
import { restoreExtraDirectives } from './federation/supergraph';
import {
  Instrumentation,
  TransportEntryAdditions,
} from './unifiedGraphManager';

export type {
  TransportEntry,
  TransportGetSubgraphExecutor,
  TransportGetSubgraphExecutorOptions,
};

export type Transports =
  | {
      [key: string]: MaybePromise<Transport | { default: Transport }>;
    }
  | ((kind: string) => MaybePromise<Transport | { default: Transport }>);

function defaultTransportsGetter(kind: string): MaybePromise<Transport> {
  const moduleName = `@graphql-mesh/transport-${kind}`;
  return handleMaybePromise(
    () => import(moduleName),
    (transport) => {
      if (!transport) {
        throw new Error(`${moduleName} module is empty`);
      }
      if (typeof transport !== 'object') {
        throw new Error(`${moduleName} module does not export an object`);
      }
      let getSubgraphExecutor: TransportGetSubgraphExecutor | undefined;
      while (true) {
        if (transport.getSubgraphExecutor) {
          getSubgraphExecutor = transport.getSubgraphExecutor;
          break;
        }
        if (!transport.default) {
          break;
        }
        // unwrap default export, node's sometimes weird and puts a default inside a default
        // all e2e tests that import transports prove that the default gets wrapped multiple times
        transport = transport.default;
      }
      if (!getSubgraphExecutor) {
        throw new Error(
          `${moduleName} module does not export "getSubgraphExecutor"`,
        );
      }
      if (typeof getSubgraphExecutor !== 'function') {
        throw new Error(
          `${moduleName} module's export "getSubgraphExecutor" is not a function`,
        );
      }
      return { getSubgraphExecutor };
    },
  );
}

function getTransportExecutor({
  transportContext,
  transportEntry,
  subgraphName = '',
  subgraph,
  transports = defaultTransportsGetter,
  getDisposeReason,
}: {
  transportContext: TransportContext | undefined;
  transportEntry: TransportEntry;
  subgraphName?: string;
  subgraph: GraphQLSchema;
  transports?: Transports;
  getDisposeReason?: () => GraphQLError | undefined;
}): MaybePromise<Executor> {
  const kind = transportEntry?.kind || '';
  transportContext?.log.debug(`Loading transport "${kind}"`);
  return handleMaybePromise(
    () =>
      typeof transports === 'function' ? transports(kind) : transports[kind],
    (transport) => {
      if (!transport) {
        throw new Error(`Transport "${kind}" is empty`);
      }
      if (typeof transport !== 'object') {
        throw new Error(`Transport "${kind}" is not an object`);
      }
      let getSubgraphExecutor: TransportGetSubgraphExecutor | undefined;
      if ('default' in transport) {
        getSubgraphExecutor = transport.default?.getSubgraphExecutor;
      } else {
        getSubgraphExecutor = transport.getSubgraphExecutor;
      }
      if (!getSubgraphExecutor) {
        throw new Error(
          `Transport "${kind}" does not have "getSubgraphExecutor"`,
        );
      }
      if (typeof getSubgraphExecutor !== 'function') {
        throw new Error(
          `Transport "${kind}" "getSubgraphExecutor" is not a function`,
        );
      }
      const log =
        transportContext?.log ||
        // if the logger is not provided by the context, create a new silent one just for consistency in the hooks
        new Logger({ level: false });
      const logger = transportContext?.logger || LegacyLogger.from(log);
      return getSubgraphExecutor({
        subgraphName,
        subgraph,
        transportEntry,
        getTransportExecutor(transportEntry) {
          return getTransportExecutor({
            transportContext,
            transportEntry,
            subgraphName,
            subgraph,
            transports,
            getDisposeReason,
          });
        },
        getDisposeReason,
        ...transportContext,
        log,
        logger,
      });
    },
  );
}

/**
 * This function creates a executor factory that uses the transport packages,
 * and wraps them with the hooks
 */
export function getOnSubgraphExecute({
  onSubgraphExecuteHooks,
  transportContext,
  transportEntryMap,
  getSubgraphSchema,
  transportExecutorStack,
  transports,
  getDisposeReason,
  batch = true,
  instrumentation,
}: {
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  transports?: Transports;
  transportContext?: TransportContext;
  transportEntryMap: Record<string, TransportEntry>;
  getSubgraphSchema(subgraphName: string): GraphQLSchema;
  transportExecutorStack: AsyncDisposableStack;
  getDisposeReason?: () => GraphQLError | undefined;
  batch?: boolean;
  instrumentation: () => Instrumentation | undefined;
}) {
  const subgraphExecutorMap = new Map<string, Executor>();
  return function onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ) {
    let executor: Executor | undefined = subgraphExecutorMap.get(subgraphName);
    // If the executor is not initialized yet, initialize it
    if (executor == null) {
      if (transportContext) {
        let log = executionRequest.context?.log || transportContext.log;
        if (subgraphName) {
          log = log.child({ subgraph: subgraphName });
        }
        // overwrite the log in the transport context because now it contains more details
        transportContext.log = log;
        log.debug('Initializing executor');
      }
      // Lazy executor that loads transport executor on demand
      executor = function lazyExecutor(subgraphExecReq: ExecutionRequest) {
        return handleMaybePromise(
          () =>
            // Gets the transport executor for the given subgraph
            getTransportExecutor({
              transportContext,
              subgraphName,
              get subgraph() {
                return getSubgraphSchema(subgraphName);
              },
              get transportEntry() {
                return transportEntryMap[subgraphName]!;
              },
              transports,
              getDisposeReason,
            }),
          (executor_) => {
            if (isDisposable(executor_)) {
              transportExecutorStack.use(executor_);
            }
            // Wraps the transport executor with hooks
            executor = wrapExecutorWithHooks({
              executor: executor_,
              onSubgraphExecuteHooks,
              subgraphName,
              transportEntryMap,
              transportContext,
              getSubgraphSchema,
              instrumentation,
            });
            // Caches the executor for future use
            subgraphExecutorMap.set(subgraphName, executor);
            return executor(subgraphExecReq);
          },
        );
      };
      // Caches the lazy executor to prevent race conditions
      subgraphExecutorMap.set(subgraphName, executor);
    }

    if (batch) {
      executor = getBatchingExecutor(
        executionRequest.context || subgraphExecutorMap,
        executor,
      );
    }

    return executor(executionRequest);
  };
}

export interface WrapExecuteWithHooksOptions {
  executor: Executor;
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  subgraphName: string;
  transportEntryMap?: Record<string, TransportEntry>;
  getSubgraphSchema: (subgraphName: string) => GraphQLSchema;
  transportContext?: TransportContext;
  instrumentation: () => Instrumentation | undefined;
}

declare module 'graphql' {
  interface GraphQLResolveInfo {
    executionRequest?: ExecutionRequest;
  }
}

/**
 * This function wraps the executor created by the transport package
 * with `onSubgraphExecuteHooks` to hook into the execution phase of subgraphs
 */
export function wrapExecutorWithHooks({
  executor: baseExecutor,
  onSubgraphExecuteHooks,
  subgraphName,
  transportEntryMap,
  getSubgraphSchema,
  transportContext,
  instrumentation,
}: WrapExecuteWithHooksOptions): Executor {
  function executorWithHooks(baseExecutionRequest: ExecutionRequest) {
    baseExecutionRequest.info =
      baseExecutionRequest.info || ({} as GraphQLResolveInfo);
    baseExecutionRequest.info.executionRequest = baseExecutionRequest;
    // this rootValue will be set in the info value for field.resolvers in non-graphql requests
    // TODO: Also consider if a subgraph can ever rely on the gateway's rootValue?
    baseExecutionRequest.rootValue = {
      executionRequest: baseExecutionRequest,
    };
    const log =
      transportContext?.log.child({ subgraph: subgraphName }) ||
      new Logger({ attrs: { subgraph: subgraphName } });
    if (onSubgraphExecuteHooks.length === 0) {
      return baseExecutor(baseExecutionRequest);
    }
    let executor = baseExecutor;
    let executionRequest = baseExecutionRequest;
    const onSubgraphExecuteDoneHooks: OnSubgraphExecuteDoneHook[] = [];
    return handleMaybePromise(
      () =>
        iterateAsync(
          onSubgraphExecuteHooks,
          (onSubgraphExecuteHook) =>
            onSubgraphExecuteHook({
              get subgraph() {
                return getSubgraphSchema(subgraphName);
              },
              subgraphName,
              get transportEntry() {
                return transportEntryMap?.[subgraphName];
              },
              executionRequest,
              setExecutionRequest(newExecutionRequest) {
                executionRequest = newExecutionRequest;
              },
              executor,
              setExecutor(newExecutor) {
                log.debug('executor has been updated');
                executor = newExecutor;
              },
              log: log,
            }),
          onSubgraphExecuteDoneHooks,
        ),
      () => {
        if (onSubgraphExecuteDoneHooks.length === 0) {
          return executor(executionRequest);
        }
        return handleMaybePromise(
          () => executor(executionRequest),
          (currentResult) => {
            const executeDoneResults: OnSubgraphExecuteDoneResult[] = [];
            return handleMaybePromise(
              () =>
                iterateAsync(
                  onSubgraphExecuteDoneHooks,
                  (onSubgraphExecuteDoneHook) =>
                    onSubgraphExecuteDoneHook({
                      result: currentResult,
                      setResult(newResult: ExecutionResult) {
                        log.debug('overriding result with: ', newResult);
                        currentResult = newResult;
                      },
                    }),
                  executeDoneResults,
                ),
              () => {
                if (!isAsyncIterable(currentResult)) {
                  return currentResult;
                }

                if (executeDoneResults.length === 0) {
                  return currentResult;
                }

                const onNextHooks: OnSubgraphExecuteDoneResultOnNext[] = [];
                const onEndHooks: OnSubgraphExecuteDoneResultOnEnd[] = [];

                for (const executeDoneResult of executeDoneResults) {
                  if (executeDoneResult.onNext) {
                    onNextHooks.push(executeDoneResult.onNext);
                  }
                  if (executeDoneResult.onEnd) {
                    onEndHooks.push(executeDoneResult.onEnd);
                  }
                }

                if (onNextHooks.length === 0 && onEndHooks.length === 0) {
                  return currentResult;
                }

                return mapAsyncIterator(
                  currentResult,
                  (currentResult) =>
                    handleMaybePromise(
                      () =>
                        iterateAsync(onNextHooks, (onNext) =>
                          onNext({
                            result: currentResult,
                            setResult: (res) => {
                              log.debug('overriding result with: ', res);

                              currentResult = res;
                            },
                          }),
                        ),
                      () => currentResult,
                    ),
                  undefined,
                  () =>
                    onEndHooks.length === 0
                      ? undefined
                      : iterateAsync(onEndHooks, (onEnd) => onEnd()),
                );
              },
            );
          },
        );
      },
    );
  }

  return function instrumentedExecutor(executionRequest: ExecutionRequest) {
    const subgraphInstrument = instrumentation()?.subgraphExecute;
    return getInstrumented({ executionRequest, subgraphName }).asyncFn(
      subgraphInstrument,
      executorWithHooks,
    )(executionRequest);
  };
}

export interface UnifiedGraphPlugin<TContext> {
  onSubgraphExecute?: OnSubgraphExecuteHook<TContext>;
  onDelegationPlan?: OnDelegationPlanHook<TContext>;
  onDelegationStageExecute?: OnDelegationStageExecuteHook<TContext>;
}

export type OnSubgraphExecuteHook<TContext = any> = (
  payload: OnSubgraphExecutePayload<TContext>,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneHook | void>>;

export interface OnSubgraphExecutePayload<TContext> {
  subgraph: GraphQLSchema;
  subgraphName: string;
  transportEntry?: TransportEntry;
  executionRequest: ExecutionRequest<any, TContext>;
  setExecutionRequest(executionRequest: ExecutionRequest): void;
  executor: Executor;
  setExecutor(executor: Executor): void;
  log: Logger;
}

export interface OnSubgraphExecuteDonePayload {
  result: AsyncIterable<ExecutionResult> | ExecutionResult;
  setResult(result: AsyncIterable<ExecutionResult> | ExecutionResult): void;
}

export type OnSubgraphExecuteDoneHook = (
  payload: OnSubgraphExecuteDonePayload,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneResult | void>>;

export type OnSubgraphExecuteDoneResultOnNext = (
  payload: OnSubgraphExecuteDoneOnNextPayload,
) => MaybePromise<void>;

export interface OnSubgraphExecuteDoneOnNextPayload {
  result: ExecutionResult;
  setResult(result: ExecutionResult): void;
}

export type OnSubgraphExecuteDoneResultOnEnd = () => MaybePromise<void>;

export type OnSubgraphExecuteDoneResult = {
  onNext?: OnSubgraphExecuteDoneResultOnNext;
  onEnd?: OnSubgraphExecuteDoneResultOnEnd;
};

export type OnDelegationPlanHook<TContext> = (
  payload: OnDelegationPlanHookPayload<TContext>,
) => Maybe<OnDelegationPlanDoneHook | void>;

export interface OnDelegationPlanHookPayload<TContext> {
  supergraph: GraphQLSchema;
  subgraph: string;
  sourceSubschema: Subschema<any, any, any, TContext>;
  typeName: string;
  variables: Record<string, any>;
  fragments: Record<string, FragmentDefinitionNode>;
  fieldNodes: SelectionNode[];
  context: TContext;
  log: Logger;
  info?: GraphQLResolveInfo;
  delegationPlanBuilder: DelegationPlanBuilder;
  setDelegationPlanBuilder(delegationPlanBuilder: DelegationPlanBuilder): void;
}

export type OnDelegationPlanDoneHook = (
  payload: OnDelegationPlanDonePayload,
) => Maybe<void>;

export interface OnDelegationPlanDonePayload {
  delegationPlan: ReturnType<DelegationPlanBuilder>;
  setDelegationPlan: (
    delegationPlan: ReturnType<DelegationPlanBuilder>,
  ) => void;
}

export type OnDelegationStageExecuteHook<TContext> = (
  payload: OnDelegationStageExecutePayload<TContext>,
) => Maybe<OnDelegationStageExecuteDoneHook>;

export interface OnDelegationStageExecutePayload<TContext> {
  object: any;
  context: TContext;
  info: GraphQLResolveInfo;
  subgraph: string;
  subschema: Subschema<any, any, any, TContext>;
  selectionSet: SelectionSetNode;
  key?: any;
  type: GraphQLOutputType;

  resolver: MergedTypeResolver<TContext>;
  setResolver: (resolver: MergedTypeResolver<TContext>) => void;

  typeName: string;

  log: Logger;
}

export type OnDelegationStageExecuteDoneHook = (
  payload: OnDelegationStageExecuteDonePayload,
) => void;

export interface OnDelegationStageExecuteDonePayload {
  result: any;
  setResult: (result: any) => void;
}

export function compareSchemas(
  a: DocumentNode | string | GraphQLSchema,
  b: DocumentNode | string | GraphQLSchema,
) {
  if (a === b) {
    return true;
  }
  let aStr: string;
  if (typeof a === 'string') {
    aStr = a;
  } else if (isDocumentNode(a)) {
    aStr = defaultPrintFn(a);
  } else {
    aStr = printSchemaWithDirectives(a);
  }
  let bStr: string;
  if (typeof b === 'string') {
    bStr = b;
  } else if (isDocumentNode(b)) {
    bStr = defaultPrintFn(b);
  } else {
    bStr = printSchemaWithDirectives(b);
  }
  return aStr === bStr;
}

// TODO: Fix this in GraphQL Tools
export function compareSubgraphNames(name1: string, name2: string) {
  return constantCase(name1) === constantCase(name2);
}

export function wrapMergedTypeResolver<TContext extends Record<string, any>>(
  originalResolver: MergedTypeResolver<TContext>,
  typeName: string,
  onDelegationStageExecuteHooks: OnDelegationStageExecuteHook<TContext>[],
  log: Logger,
): MergedTypeResolver<TContext> {
  return (object, context, info, subschema, selectionSet, key, type) => {
    if (subschema.name) {
      log = log.child({ subgraph: subschema.name });
    }
    let resolver = originalResolver as MergedTypeResolver<TContext>;
    function setResolver(newResolver: MergedTypeResolver<TContext>) {
      resolver = newResolver;
    }
    const onDelegationStageExecuteDoneHooks: OnDelegationStageExecuteDoneHook[] =
      [];
    for (const onDelegationStageExecute of onDelegationStageExecuteHooks) {
      const onDelegationStageExecuteDone = onDelegationStageExecute({
        object,
        context: context as TContext,
        info,
        subgraph: subschema.name!,
        subschema: subschema as Subschema<any, any, any, TContext>,
        selectionSet,
        key,
        typeName,
        type,
        log,
        resolver,
        setResolver,
      });
      if (onDelegationStageExecuteDone) {
        onDelegationStageExecuteDoneHooks.push(onDelegationStageExecuteDone);
      }
    }
    return handleMaybePromise(
      () =>
        resolver(
          object,
          context as TContext,
          info,
          subschema as Subschema<any, any, any, TContext>,
          selectionSet,
          key,
          type,
        ),
      (result) => {
        function setResult(newResult: any) {
          result = newResult;
        }
        for (const onDelegationStageExecuteDone of onDelegationStageExecuteDoneHooks) {
          onDelegationStageExecuteDone({
            result,
            setResult,
          });
        }
        return result;
      },
    );
  };
}

// Taken from https://stackoverflow.com/questions/8211744/convert-time-interval-given-in-seconds-into-more-human-readable-form
export function millisecondsToStr(milliseconds: number): string {
  // TIP: to find current time in milliseconds, use:
  // current_time_milliseconds = new Date().getTime();

  function numberEnding(number: number) {
    return number > 1 ? 's' : '';
  }

  let temp = Math.floor(milliseconds / 1000);
  const days = Math.floor((temp %= 31536000) / 86400);
  if (days) {
    return days + ' day' + numberEnding(days);
  }
  const hours = Math.floor((temp %= 86400) / 3600);
  if (hours) {
    return hours + ' hour' + numberEnding(hours);
  }
  const minutes = Math.floor((temp %= 3600) / 60);
  if (minutes) {
    return minutes + ' minute' + numberEnding(minutes);
  }
  const seconds = temp % 60;
  if (seconds) {
    return seconds + ' second' + numberEnding(seconds);
  }
  return 'less than a second'; //'just now' //or other string you like;
}

export function getTransportEntryMapUsingFusionAndFederationDirectives(
  unifiedGraph: GraphQLSchema,
  transportEntryAdditions?: TransportEntryAdditions,
) {
  unifiedGraph = restoreExtraDirectives(unifiedGraph);
  const transportEntryMap: Record<string, TransportEntry> = {};
  const joinGraph = unifiedGraph.getType('join__Graph');
  const schemaDirectives = getDirectiveExtensions<{
    transport: TransportEntry;
  }>(unifiedGraph);
  if (isEnumType(joinGraph)) {
    for (const enumValue of joinGraph.getValues()) {
      const enumValueDirectives = getDirectiveExtensions<{
        join__graph: {
          name: string;
          url?: string;
        };
      }>(enumValue);
      if (enumValueDirectives?.join__graph?.length) {
        for (const joinGraphDirective of enumValueDirectives.join__graph) {
          if (joinGraphDirective.url) {
            transportEntryMap[joinGraphDirective.name] = {
              subgraph: joinGraphDirective.name,
              kind: 'http',
              location: joinGraphDirective.url,
            };
          }
        }
      }
    }
  }
  if (schemaDirectives?.transport?.length) {
    for (const transportDirective of schemaDirectives.transport) {
      transportEntryMap[transportDirective.subgraph] = transportDirective;
    }
  }
  if (transportEntryAdditions) {
    const wildcardTransportOptions = transportEntryAdditions['*'];
    for (const subgraphName in transportEntryMap) {
      const toBeMerged: Partial<TransportEntry>[] = [];
      const transportEntry = transportEntryMap[subgraphName];
      if (transportEntry) {
        toBeMerged.push(transportEntry);
      }
      const transportOptionBySubgraph = transportEntryAdditions[subgraphName];
      if (transportOptionBySubgraph) {
        toBeMerged.push(transportOptionBySubgraph);
      }
      const transportOptionByKind =
        transportEntryAdditions['*.' + transportEntry?.kind];
      if (transportOptionByKind) {
        toBeMerged.push(transportOptionByKind);
      }
      if (wildcardTransportOptions) {
        toBeMerged.push(wildcardTransportOptions);
      }
      transportEntryMap[subgraphName] = mergeDeep(toBeMerged);
    }
  }
  const schemaExtensions: {
    directives?: {
      transport?: TransportEntry[];
    };
  } = (unifiedGraph.extensions ||= {});
  const directivesInExtensions = (schemaExtensions.directives ||= {});
  const transportEntriesInExtensions: TransportEntry[] =
    (directivesInExtensions.transport = []);
  for (const subgraphName in transportEntryMap) {
    const transportEntry = transportEntryMap[subgraphName];
    if (transportEntry) {
      transportEntriesInExtensions.push(transportEntry);
    }
  }
  return transportEntryMap;
}
