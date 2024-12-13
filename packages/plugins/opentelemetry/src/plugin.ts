import { type GatewayPlugin } from '@graphql-hive/gateway';
import * as api from '@opentelemetry/api';
import {Attributes, SpanStatusCode} from "@opentelemetry/api";

import {isAsyncIterable, YogaInitialContext} from "graphql-yoga";
import {addTraceId, sanitiseDocument} from "./utils";
import {print} from "graphql";
import {ATTR_GRAPHQL_DOCUMENT, ATTR_GRAPHQL_ERROR_COUNT, ATTR_GRAPHQL_OPERATION_NAME, ATTR_GRAPHQL_OPERATION_TYPE} from "./attributes";

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
  attributes?: {
    document: boolean | undefined;
    operationName: boolean | undefined;
    operationType: boolean | undefined;
  }
};
//

const commonAttributes = Symbol();

export interface OtelContext{
  otel: {
    context: {
      active: api.Context
    };
  };
  [commonAttributes]: Attributes;
}



export function useOpenTelemetry(
    options: OpenTelemetryGatewayPluginOptions,
): GatewayPlugin<OtelContext & YogaInitialContext> {
  const tracer = options.tracer || api.trace.getTracer('graphql-gateway');

  options.spans ||= { validate: true, parse: true, execute: true, subscribe: true, subgraphExecute: true}
  options.attributes ||= { document: true, operationName: true, operationType: true };

  return {
    // TODO: on request / on response graphql.request
    onParse: ({ context, extendContext, parseFn, setParseFn }) => {
      const span = tracer.startSpan("graphql.parse", {}, api.context.active())

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

      return ({result, extendContext, context}) => {
        const sanitisedDocument = print(sanitiseDocument(result));
        extendContext({
          ...context,
          [commonAttributes]: {
          ...(options.attributes?.document && {[ATTR_GRAPHQL_DOCUMENT]: sanitisedDocument}),
          ...(options.attributes?.operationName && {[ATTR_GRAPHQL_OPERATION_NAME]: result.definitions?.[0].name.value || "anonymous"}),
          ...(options.attributes?.operationType && {[ATTR_GRAPHQL_OPERATION_TYPE]: result.definitions?.[0].operation || "unknown"}),
          }
        });



        span.setAttributes(context[commonAttributes] || {});

        if (result instanceof Error) {
          span.setAttribute(ATTR_GRAPHQL_ERROR_COUNT, 1);
          span.recordException(result);
          span.setStatus({ code: SpanStatusCode.ERROR }); // TODO: should we have message ? Leaking?
        }

        span.end();
      }
    },
    onValidate({extendContext, context, setValidationFn, validateFn}) {
      const span = tracer.startSpan("graphql.validate", {attributes: context[commonAttributes]}, api.context.active())

      extendContext({
        otel: {
          context: {
            active: api.trace.setSpan(api.context.active(), span),
          }
        },
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
      const span = tracer.startSpan("graphql.context-building", {attributes: context[commonAttributes]}, api.context.active())
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
      const span = tracer.startSpan("graphql.execute", {attributes: context[commonAttributes]}, api.context.active())

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
      const span = tracer.startSpan("graphql.subscribe", {attributes: context[commonAttributes]}, api.context.active())

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
          [ATTR_GRAPHQL_OPERATION_NAME]: executionRequest.operationName,
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

const getActiveContext = (context: Partial<OtelContext> & YogaInitialContext | undefined)  => context?.otel?.context.active || api.context.active();
