import { type GatewayPlugin } from '@graphql-hive/gateway';
import type { Logger } from '@graphql-mesh/types';
import * as api from '@opentelemetry/api';
import { SpanStatusCode} from "@opentelemetry/api";

import {isAsyncIterable, YogaInitialContext} from "graphql-yoga";
import {sanitiseDocument} from "./utils";
import { print } from "graphql";
import {ExecutionResult} from "@graphql-tools/utils";

export type OpenTelemetryGatewayPluginOptions = {
  /**
   * Tracer instance to use for creating spans (default: a tracer with name 'gateway').
   */
  tracer?: api.Tracer;

  /**
   * Options to control which spans to create.
   * By default, all spans are enabled.
   *
   * You may specify a boolean value to enable/disable all spans, or a function to dynamically enable/disable spans based on the input.
   */
  spans?: {
    /**
     * Enable/disable GraphQL parse spans (default: true).
     */
    parse: boolean | undefined;
    /**
     * Enable/disable GraphQL validate spans (default: true).
     */
    validate?: boolean | undefined;
    /**
     * Enable/disable GraphQL execute spans (default: true).
     */
    execute?: boolean | undefined;
    /**
     * Enable/disable GraphQL subscribe spans (default: true).
     */
    subscribe: boolean | undefined;
    /**
     * Enable/disable subgraph execute spans (default: true).
     */
    subgraphExecute?: boolean | undefined;
  };
};
//
export interface OtelContext{
  otel: {
    context: {
      active: api.Context
    };
  };
}

export function useOpenTelemetry(
    options: OpenTelemetryGatewayPluginOptions & { logger: Logger },
): GatewayPlugin<OtelContext & YogaInitialContext> {
  const tracer = options.tracer || api.trace.getTracer('graphql-gateway');

  options.spans ||= { validate: true, parse: true, execute: true, subscribe: true, subgraphExecute: true}

  return {
    // TODO: on request / on response graphql.request
    onParse: ({ context, extendContext, parseFn, setParseFn }) => {
      const span = tracer.startSpan("graphql.parse", {
        attributes: {
          [ATTR_OPERATION_NAME]: context.params.operationName || "anonymous",
        }
      }, api.context.active())

      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        }
      });

      setParseFn((args) =>{
        return api.context.with(api.trace.setSpan(getActiveContext(context), span), () => parseFn(args))
      })

      return ({result}) => {
        span.setAttribute(ATTR_GRAPHQL_DOCUMENT, print(sanitiseDocument(result)))

        if (result instanceof Error) {
          span.setAttribute(ATTR_GRAPHQL_ERROR_COUNT, 1);
          span.recordException(result);
          span.setStatus({ code: SpanStatusCode.ERROR }); // TODO: should we have message ? Leaking?
        }

        span.end();
      }
    },
    onValidate({extendContext, context, setValidationFn, validateFn, params}) {
      const span = tracer.startSpan("graphql.validate", {
        attributes: {
          [ATTR_OPERATION_NAME]: context.params.operationName || "anonymous",
          [ATTR_GRAPHQL_DOCUMENT]: print(sanitiseDocument(params.documentAST))
        }
      }, api.context.active())



      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        }
      });

      setValidationFn((schema, documentAST, rules, options, typeInfo) =>{
        return api.context.with(api.trace.setSpan(getActiveContext(context), span), () => validateFn(schema, documentAST, rules, options, typeInfo));
      })

      return (result) => {
        if (result instanceof Error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        if (Array.isArray(result) && result.length > 0) {
          span.setAttribute(ATTR_GRAPHQL_ERROR_COUNT, result.length);
          span.setStatus({code: SpanStatusCode.ERROR});
          for (const error in result) {
            span.recordException(error);
          }
        }
        span.end();
      }
    },
    onContextBuilding({context, extendContext}) {
      const span = tracer.startSpan("graphql.context-building", {
        attributes: {
          [ATTR_OPERATION_NAME]: context.params.operationName || "anonymous",
          // [ATTR_GRAPHQL_DOCUMENT]: print(sanatiseDocument(context.params.documentAST)) TODO
        }
      }, api.context.active())
      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        }
      });

      return () =>  {
        span.end()
      }
    },
    onExecute: ({ args: {contextValue: context}, extendContext, setExecuteFn, executeFn }) => {
      const span = tracer.startSpan("graphql.execute", {
        attributes: {
          [ATTR_OPERATION_NAME]: context.params.operationName || "anonymous",
          // [ATTR_GRAPHQL_DOCUMENT]: print(sanatiseDocument(context.params.documentAST)) TODO
        }
      }, api.context.active())

      setExecuteFn((args) =>{
        return api.context.with(api.trace.setSpan(getActiveContext(context), span), () => executeFn(args))
      })

      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        }
      });

      return {
        onExecuteDone: ({result, setResult, args}) => {

          if (!isAsyncIterable(result)){
            setResult(addTraceId(args?.contextValue?.otel?.context.active || api.context.active(), result))

            span.end();
            if ( result?.errors && result.errors.length > 0){
              span.setStatus({code: SpanStatusCode.ERROR});
              span.setAttribute(ATTR_GRAPHQL_ERROR_COUNT, result.errors.length);
            }
            return;
          }

          return {
            onNext: ({ result }) => {
              if (result?.errors && result.errors.length > 0) {
                span.setAttribute(ATTR_GRAPHQL_ERROR_COUNT, result.errors.length);
                span.setStatus({code: SpanStatusCode.ERROR});
              }
            },
            onEnd: () => {
              span.end();
            },
          };

        },
      }
    },
    onSubscribe: ({ args: {contextValue: context}, extendContext, subscribeFn, setSubscribeFn }) => {
      const span = tracer.startSpan("graphql.subscribe", {
        attributes: {
          [ATTR_OPERATION_NAME]: context.params.operationName || "anonymous",
          // [ATTR_GRAPHQL_DOCUMENT]: print(sanitiseDocument(context.params.query)) TODO
        }
      }, api.context.active())

      setSubscribeFn((args) =>{
        return api.context.with(api.trace.setSpan(getActiveContext(args.contextValue), span), () => subscribeFn(args))
      })

      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        }
      });

      return {
        onSubscribeError: ({error}) => {
          if (error) span.setStatus({code: SpanStatusCode.ERROR});
        },
        onSubscribeResult: () => {
          return {
            onNext({result}) {
              if (result?.errors && result.errors.length > 0) span.setStatus({code: SpanStatusCode.ERROR});
            },
            onEnd() {
              span.end();
            },
          };
        },
      }
    },
    onSubgraphExecute: ({executionRequest}) => {
      const span = tracer.startSpan("graphql.subgraph.execute", {
        attributes: {
          [ATTR_OPERATION_NAME]: executionRequest.operationName,
          [ATTR_GRAPHQL_DOCUMENT]: print(sanitiseDocument(executionRequest.document))
        }
      }, api.context.active());


      return ({ result }) => {
        if (isAsyncIterable(result)) {
          return {
            onEnd: () => {
              span.end();
            }
          }
        }
        span.end();
        return {
        }
      }
    }
  }
}

const ATTR_GRAPHQL_ERROR_COUNT = "graphql.errors.count"
const ATTR_GRAPHQL_DOCUMENT = "graphql.document"
const ATTR_OPERATION_NAME = "graphql.operation"

const getActiveContext = (context: Partial<OtelContext> & YogaInitialContext | undefined)  => context?.otel?.context.active || api.context.active();

const addTraceId = (context: api.Context, result: ExecutionResult): ExecutionResult => {
  return {
    ...result,
    extensions: {
      ...result.extensions,
      trace_id: api.trace.getSpan(context)?.spanContext().traceId,
    },
  };
};
