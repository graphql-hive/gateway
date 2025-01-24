import { defaultPrintFn } from '@graphql-mesh/transport-common';
import {
  getOperationASTFromDocument,
  mapMaybePromise,
  type ExecutionRequest,
  type ExecutionResult,
  type MaybePromise,
} from '@graphql-tools/utils';
import {
  SpanKind,
  SpanStatusCode,
  type Exception,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import type { ExecutionArgs } from 'graphql';
import {
  SEMATTRS_GATEWAY_UPSTREAM_SUBGRAPH_NAME,
  SEMATTRS_GRAPHQL_DOCUMENT,
  SEMATTRS_GRAPHQL_ERROR_COUNT,
  SEMATTRS_GRAPHQL_OPERATION_NAME,
  SEMATTRS_GRAPHQL_OPERATION_TYPE,
  SEMATTRS_HTTP_CLIENT_IP,
  SEMATTRS_HTTP_HOST,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_SCHEME,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_USER_AGENT,
  SEMATTRS_NET_HOST_NAME,
} from './attributes';

export function startHttpSpan(input: {
  tracer: Tracer;
  request: Request;
  url: URL;
  callback: (span: Span) => Response | Promise<Response>;
}): MaybePromise<Response> {
  const { url, request, tracer, callback } = input;
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent');
  const ips = request.headers.get('x-forwarded-for');
  const method = request.method || 'GET';
  const host = url.host || request.headers.get('host');
  const hostname = url.hostname || host || 'localhost';
  const rootSpanName = `${method} ${path}`;

  return tracer.startActiveSpan(
    rootSpanName,
    {
      attributes: {
        [SEMATTRS_HTTP_METHOD]: method,
        [SEMATTRS_HTTP_URL]: request.url,
        [SEMATTRS_HTTP_ROUTE]: path,
        [SEMATTRS_HTTP_SCHEME]: url.protocol,
        [SEMATTRS_NET_HOST_NAME]: hostname,
        [SEMATTRS_HTTP_HOST]: host || undefined,
        [SEMATTRS_HTTP_CLIENT_IP]: ips?.split(',')[0],
        [SEMATTRS_HTTP_USER_AGENT]: userAgent || undefined,
      },
      kind: SpanKind.SERVER,
    },
    (span) => {
      try {
        const response$ = callback(span);
        return mapMaybePromise(
          response$,
          (response) => {
            span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
            span.setStatus({
              code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
              message: response.ok ? undefined : response.statusText,
            });
            return response;
          },
          (err) => {
            span.recordException(err as Exception);
            throw err;
          },
        );
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      }
    },
  );
}

export function startGraphQLParseSpan(input: {
  callback: (span: Span) => any;
  tracer: Tracer;
  query?: string;
  operationName?: string;
}): MaybePromise<any> {
  return input.tracer.startActiveSpan(
    'graphql.parse',
    {
      attributes: {
        [SEMATTRS_GRAPHQL_DOCUMENT]: input.query,
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: input.operationName,
      },
      kind: SpanKind.INTERNAL,
    },
    (span) => {
      try {
        const result = input.callback(span);
        if (result instanceof Error) {
          span.setAttribute(SEMATTRS_GRAPHQL_ERROR_COUNT, 1);
          span.recordException(result);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.message,
          });
        }
        return result;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      }
    },
  );
}

export function startGraphQLValidateSpan(input: {
  callback: (span: Span) => any;
  tracer: Tracer;
  query?: string;
  operationName?: string;
}) {
  return input.tracer.startActiveSpan(
    'graphql.validate',
    {
      attributes: {
        [SEMATTRS_GRAPHQL_DOCUMENT]: input.query,
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: input.operationName,
      },
      kind: SpanKind.INTERNAL,
    },
    (span) => {
      try {
        const result: any[] | readonly Error[] = input.callback(span);
        if (result instanceof Error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.message,
          });
        } else if (Array.isArray(result) && result.length > 0) {
          span.setAttribute(SEMATTRS_GRAPHQL_ERROR_COUNT, result.length);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.map((e) => e.message).join(', '),
          });

          for (const error in result) {
            span.recordException(error);
          }
        }
        return result;
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      }
    },
  );
}

export function startGraphQLExecuteSpan(input: {
  args: ExecutionArgs;
  callback: (span: Span) => ExecutionResult | Promise<ExecutionResult>;
  tracer: Tracer;
}): MaybePromise<ExecutionResult> {
  const operation = getOperationASTFromDocument(
    input.args.document,
    input.args.operationName || undefined,
  );
  return input.tracer.startActiveSpan(
    'graphql.execute',
    {
      attributes: {
        [SEMATTRS_GRAPHQL_OPERATION_TYPE]: operation.operation,
        [SEMATTRS_GRAPHQL_OPERATION_NAME]:
          input.args.operationName || undefined,
        [SEMATTRS_GRAPHQL_DOCUMENT]: defaultPrintFn(input.args.document),
      },
      kind: SpanKind.INTERNAL,
    },
    (span) => {
      try {
        const result$ = input.callback(span);
        return mapMaybePromise(
          result$,
          (result) => {
            if (result.errors && result.errors.length > 0) {
              span.setAttribute(
                SEMATTRS_GRAPHQL_ERROR_COUNT,
                result.errors.length,
              );
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: result.errors.map((e) => e.message).join(', '),
              });

              for (const error of result.errors) {
                span.recordException(error);
              }
            }
            return result;
          },
          (err) => {
            span.recordException(err as Exception);
            throw err;
          },
        );
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      }
    },
  );
}

export const subgraphExecReqSpanMap = new WeakMap<ExecutionRequest, Span>();

export function createSubgraphExecuteFetchSpan<T>(input: {
  callback: (span: Span) => T;
  tracer: Tracer;
  executionRequest: ExecutionRequest;
  subgraphName: string;
}) {
  return input.tracer.startActiveSpan(
    `subgraph.execute (${input.subgraphName})`,
    {
      attributes: {
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: input.executionRequest.operationName,
        [SEMATTRS_GRAPHQL_DOCUMENT]: defaultPrintFn(
          input.executionRequest.document,
        ),
        [SEMATTRS_GRAPHQL_OPERATION_TYPE]: getOperationASTFromDocument(
          input.executionRequest.document,
          input.executionRequest.operationName,
        )?.operation,
        [SEMATTRS_GATEWAY_UPSTREAM_SUBGRAPH_NAME]: input.subgraphName,
      },
      kind: SpanKind.CLIENT,
    },
    input.callback,
  );
}

export function startUpstreamHttpFetchSpan(input: {
  callback: (span: Span) => MaybePromise<Response>;
  tracer: Tracer;
  url: string;
  fetchOptions: RequestInit;
  executionRequest?: ExecutionRequest;
}): MaybePromise<Response> {
  const urlObj = new URL(input.url);

  const attributes = {
    [SEMATTRS_HTTP_METHOD]: input.fetchOptions.method,
    [SEMATTRS_HTTP_URL]: input.url,
    [SEMATTRS_NET_HOST_NAME]: urlObj.hostname,
    [SEMATTRS_HTTP_HOST]: urlObj.host,
    [SEMATTRS_HTTP_ROUTE]: urlObj.pathname,
    [SEMATTRS_HTTP_SCHEME]: urlObj.protocol,
  };

  return input.tracer.startActiveSpan(
    'http.fetch',
    {
      attributes,
      kind: SpanKind.CLIENT,
    },
    (span) => {
      try {
        const response$ = input.callback(span);
        return mapMaybePromise(
          response$,
          (response) => {
            span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
            span.setStatus({
              code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
              message: response.ok ? undefined : response.statusText,
            });
            return response;
          },
          (err) => {
            span.recordException(err as Exception);
            throw err;
          },
        );
      } catch (err) {
        span.recordException(err as Exception);
        throw err;
      }
    },
  );
}
