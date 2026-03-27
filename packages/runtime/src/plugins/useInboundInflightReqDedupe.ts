import { Plugin as EnvelopPlugin } from '@envelop/core';
import { defaultPrintFn } from '@graphql-mesh/transport-common';
import {
  ExecutionResult,
  getOperationASTFromDocument,
  isAsyncIterable,
  isPromise,
  MaybeAsyncIterable,
  memoize1,
} from '@graphql-tools/utils';
import { BREAK, DocumentNode, visit } from 'graphql';
import { Plugin as YogaPlugin } from 'graphql-yoga';
import { ExecutionArgs } from '../types';

export interface InboundInflightRequestDeduplicationEnvelopPluginOptions<
  TContext,
> {
  /**
   * If this is provided, the plugin will only be enabled for requests where this function returns true.
   * This allows you to conditionally enable deduplication based on the request context, such as headers, query parameters, etc.
   * By default, the plugin is enabled for all requests.
   */
  enabled(args: ExecutionArgs<TContext>): boolean;
  /**
   * By default, the plugin uses the printed GraphQL document, operation name, and variable values to generate a deduplication key.
   * If you want to customize the deduplication key generation, you can provide this function.
   */
  getDeduplicationKeys(args: ExecutionArgs<TContext>): string[];
}

export const hasDeferStream = memoize1(function hasDeferStream(
  document: DocumentNode,
): boolean {
  let hasDeferOrStream = false;
  visit(document, {
    Directive(node) {
      if (node.name.value === 'defer' || node.name.value === 'stream') {
        hasDeferOrStream = true;
        return BREAK; // Stop visiting further nodes since we found a defer or stream directive
      }
      return node;
    },
  });
  return hasDeferOrStream;
});

export function useInboundInflightReqDedupeEnvelop<
  TContext extends Record<string, any>,
>(
  opts: InboundInflightRequestDeduplicationEnvelopPluginOptions<TContext>,
): EnvelopPlugin<TContext> {
  const inflightExecutions = new Map<
    string,
    Promise<MaybeAsyncIterable<ExecutionResult>>
  >();
  return {
    onExecute({ args, executeFn, setExecuteFn }) {
      if (!opts.enabled(args)) {
        return;
      }
      const operationAST = getOperationASTFromDocument(
        args.document,
        args.operationName,
      );
      // We only want to deduplicate query operations, since mutations and subscriptions can have side effects and should not be deduplicated.
      if (operationAST?.operation !== 'query') {
        return;
      }
      if (hasDeferStream(args.document)) {
        // If the query has defer or stream directives, we should not deduplicate it, since it can have multiple responses and we want to ensure that all responses are sent to the client.
        return;
      }
      // Check if defer/stream
      setExecuteFn((args: ExecutionArgs<TContext>) => {
        const deduplicationKeys = [...opts.getDeduplicationKeys(args)];
        deduplicationKeys.push(defaultPrintFn(args.document));
        if (args.operationName) {
          deduplicationKeys.push(args.operationName);
        }
        if (args.variableValues) {
          deduplicationKeys.push(JSON.stringify(args.variableValues));
        }
        const deduplicationKey = deduplicationKeys.join('|');
        const existingExecution = inflightExecutions.get(deduplicationKey);
        if (existingExecution) {
          return existingExecution;
        }
        const execResult$ = executeFn(args);
        if (!isPromise(execResult$)) {
          return execResult$;
        }
        inflightExecutions.set(deduplicationKey, execResult$);
        return execResult$.finally(() => {
          inflightExecutions.delete(deduplicationKey);
        });
      });
    },
  };
}

export interface InboundInflightRequestDeduplicationYogaPluginOptions<
  TContext,
> {
  /**
   * If this is provided, the plugin will only be enabled for requests where this function returns true.
   * This allows you to conditionally enable deduplication based on the request context, such as headers, query parameters, etc.
   * By default, the plugin is enabled for all requests.
   */
  enabled?(args: ExecutionArgs<TContext>, request: Request): boolean;
  /**
   * By default, the plugin uses all request headers, method, and URL to generate a deduplication key.
   * And this function allows you to filter which headers should be included in the deduplication key generation.
   * This is useful if you want to ignore certain headers that are not relevant for deduplication, such as authentication headers, cookies, etc.
   */
  shouldIncludeHeader?(headerName: string, headerValue: string): boolean;
  /**
   * By default, the plugin uses all request headers, method, URL and GraphQL document, operation name, and variable values to generate a deduplication key.
   * If you want to customize the deduplication key generation, you can provide this function.
   */
  getDeduplicationKeys?(
    args: ExecutionArgs<TContext>,
    request: Request,
  ): string[];
}

export function useInboundInflightReqDedupeForYoga<
  TContext extends Record<string, any>,
>(
  opts?: InboundInflightRequestDeduplicationYogaPluginOptions<TContext>,
): YogaPlugin<TContext> {
  return useInboundInflightReqDedupeEnvelop({
    enabled(args) {
      const request = args.contextValue?.request;
      if (!request) {
        return false;
      }
      if (opts?.enabled) {
        return opts.enabled(args, request);
      }
      return true;
    },
    getDeduplicationKeys: (args) => {
      const request = args.contextValue?.request;
      const keys: string[] = opts?.getDeduplicationKeys
        ? [...opts.getDeduplicationKeys(args, request!)]
        : [];
      if (request) {
        keys.push(request.method);
        keys.push(request.url);
        const sortedHeaders = Array.from(request.headers.entries()).sort(
          ([a], [b]) => a.localeCompare(b),
        );
        for (const [headerName, headerValue] of sortedHeaders) {
          if (
            !opts?.shouldIncludeHeader ||
            opts.shouldIncludeHeader(headerName, headerValue)
          ) {
            keys.push(`${headerName}:${headerValue}`);
          }
        }
      }
      return keys;
    },
  });
}
