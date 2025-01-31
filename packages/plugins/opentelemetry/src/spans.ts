import { defaultPrintFn } from '@graphql-mesh/transport-common';
import {
  getOperationASTFromDocument,
  isAsyncIterable,
  type ExecutionRequest,
  type ExecutionResult,
} from '@graphql-tools/utils';
import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
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

const httpSpansByRequest = new WeakMap<Request, Span>();
export function createHttpSpan(input: {
  ctx: Context;
  tracer: Tracer;
  request: Request;
  url: URL;
}): { ctx: Context } {
  const { url, request, tracer } = input;

  const span = tracer.startSpan(
    `${request.method || 'GET'} ${url.pathname}`,
    {
      attributes: {
        [SEMATTRS_HTTP_METHOD]: request.method || 'GET',
        [SEMATTRS_HTTP_URL]: request.url,
        [SEMATTRS_HTTP_ROUTE]: url.pathname,
        [SEMATTRS_HTTP_SCHEME]: url.protocol,
        [SEMATTRS_NET_HOST_NAME]:
          url.hostname ||
          url.host ||
          request.headers.get('host') ||
          'localhost',
        [SEMATTRS_HTTP_HOST]:
          url.host || request.headers.get('host') || undefined,
        [SEMATTRS_HTTP_CLIENT_IP]: request.headers
          .get('x-forwarded-for')
          ?.split(',')[0],
        [SEMATTRS_HTTP_USER_AGENT]:
          request.headers.get('user-agent') || undefined,
      },
      kind: SpanKind.SERVER,
    },
    input.ctx,
  );

  httpSpansByRequest.set(request, span);
  return {
    ctx: trace.setSpan(input.ctx, span),
  };
}

export function endHttpSpan(request: Request, response: Response) {
  const span = httpSpansByRequest.get(request);
  if (span) {
    span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
    span.setStatus({
      code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      message: response.ok ? undefined : response.statusText,
    });
    span.end();
  }
}

export function startGraphQLParseSpan(input: {
  ctx: Context;
  tracer: Tracer;
  query?: string;
  operationName?: string;
}): { ctx: Context; done: (result: unknown) => void } {
  const span = input.tracer.startSpan(
    'graphql.parse',
    {
      attributes: {
        [SEMATTRS_GRAPHQL_DOCUMENT]: input.query,
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: input.operationName,
      },
      kind: SpanKind.INTERNAL,
    },
    input.ctx,
  );

  return {
    ctx: trace.setSpan(input.ctx, span),
    done: (result) => {
      if (result instanceof Error) {
        span.setAttribute(SEMATTRS_GRAPHQL_ERROR_COUNT, 1);
        span.recordException(result);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.message,
        });
      }
      span.end();
    },
  };
}

export function startGraphQLValidateSpan(input: {
  ctx: Context;
  tracer: Tracer;
  query?: string;
  operationName?: string;
}): { ctx: Context; done: (result: any[] | readonly Error[]) => void } {
  const span = input.tracer.startSpan(
    'graphql.validate',
    {
      attributes: {
        [SEMATTRS_GRAPHQL_DOCUMENT]: input.query,
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: input.operationName,
      },
      kind: SpanKind.INTERNAL,
    },
    input.ctx,
  );
  return {
    ctx: trace.setSpan(input.ctx, span),
    done: (result) => {
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
      span.end();
    },
  };
}

export function startGraphQLExecuteSpan(input: {
  ctx: Context;
  args: ExecutionArgs;
  tracer: Tracer;
}): {
  ctx: Context;
  done: (
    result: ExecutionResult | AsyncIterableIterator<ExecutionResult>,
  ) => void;
} {
  const operation = getOperationASTFromDocument(
    input.args.document,
    input.args.operationName || undefined,
  );
  const span = input.tracer.startSpan(
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
    input.ctx,
  );

  return {
    ctx: trace.setSpan(input.ctx, span),
    done: (result) => {
      if (
        !isAsyncIterable(result) && // FIXME: Handle async iterable too
        result.errors &&
        result.errors.length > 0
      ) {
        span.setAttribute(SEMATTRS_GRAPHQL_ERROR_COUNT, result.errors.length);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.errors.map((e) => e.message).join(', '),
        });

        for (const error of result.errors) {
          span.recordException(error);
        }
      }
      span.end();
    },
  };
}

export function startSubgraphExecuteFetchSpan(input: {
  ctx: Context;
  tracer: Tracer;
  executionRequest: ExecutionRequest;
  subgraphName: string;
}): {
  ctx: Context;
  done: (result: unknown) => void;
} {
  const span = input.tracer.startSpan(
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
    input.ctx,
  );

  return {
    ctx: trace.setSpan(input.ctx, span),
    done: () => span.end(),
  };
}

export function startUpstreamHttpFetchSpan(input: {
  ctx: Context;
  tracer: Tracer;
  url: string;
  fetchOptions: RequestInit;
  executionRequest?: ExecutionRequest;
}): { ctx: Context; done: (response: Response) => void } {
  const urlObj = new URL(input.url);
  const span = input.tracer.startSpan(
    'http.fetch',
    {
      attributes: {
        [SEMATTRS_HTTP_METHOD]: input.fetchOptions.method,
        [SEMATTRS_HTTP_URL]: input.url,
        [SEMATTRS_NET_HOST_NAME]: urlObj.hostname,
        [SEMATTRS_HTTP_HOST]: urlObj.host,
        [SEMATTRS_HTTP_ROUTE]: urlObj.pathname,
        [SEMATTRS_HTTP_SCHEME]: urlObj.protocol,
      },
      kind: SpanKind.CLIENT,
    },
    input.ctx,
  );

  return {
    ctx: trace.setSpan(input.ctx, span),
    done: (response) => {
      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
      span.setStatus({
        code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        message: response.ok ? undefined : response.statusText,
      });
      span.end();
    },
  };
}
