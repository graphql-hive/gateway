import { OnCacheGetHookEventPayload } from '@graphql-hive/gateway-runtime';
import { defaultPrintFn } from '@graphql-mesh/transport-common';
import {
  getOperationASTFromDocument,
  isAsyncIterable,
  type ExecutionRequest,
  type ExecutionResult,
} from '@graphql-tools/utils';
import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type Tracer,
} from '@opentelemetry/api';
import {
  SEMATTRS_EXCEPTION_MESSAGE,
  SEMATTRS_EXCEPTION_STACKTRACE,
  SEMATTRS_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import { printSchema, type ExecutionArgs, type GraphQLSchema } from 'graphql';
import type { GraphQLParams } from 'graphql-yoga';
import {
  getRetryInfo,
  isRetryExecutionRequest,
} from '../../../runtime/src/plugins/useUpstreamRetry';
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

  return {
    ctx: trace.setSpan(input.ctx, span),
  };
}

export function setResponseAttributes(ctx: Context, response: Response) {
  const span = trace.getSpan(ctx);
  if (span) {
    span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
    span.setAttribute(
      'gateway.cache.response_cache',
      response.status === 304 && response.headers.get('ETag') ? 'hit' : 'miss',
    );
    span.setStatus({
      code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      message: response.ok ? undefined : response.statusText,
    });
  }
}

export function createGraphQLSpan(input: {
  ctx: Context;
  tracer: Tracer;
}): Context {
  const span = input.tracer.startSpan(
    `graphql.operation`,
    { kind: SpanKind.INTERNAL },
    input.ctx,
  );

  return trace.setSpan(input.ctx, span);
}

export function setParamsAttributes(input: {
  ctx: Context;
  params: GraphQLParams;
}) {
  const { ctx, params } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

  span.setAttribute(SEMATTRS_GRAPHQL_DOCUMENT, params.query ?? '<undefined>');
  span.setAttribute(
    SEMATTRS_GRAPHQL_OPERATION_NAME,
    params.operationName ?? 'Anonymous',
  );
}

export function setExecutionAttributesOnOperationSpan(
  ctx: Context,
  args: ExecutionArgs,
) {
  const span = trace.getSpan(ctx);
  if (span) {
    const operation = getOperationASTFromDocument(
      args.document,
      args.operationName || undefined,
    );
    const operationName = operation.name?.value ?? 'Anonymous';
    const document = defaultPrintFn(args.document);
    span.setAttribute(SEMATTRS_GRAPHQL_OPERATION_TYPE, operation.operation);
    span.setAttribute(SEMATTRS_GRAPHQL_OPERATION_NAME, operationName);
    span.setAttribute(SEMATTRS_GRAPHQL_DOCUMENT, document);
    span.updateName(`graphql.operation ${operationName}`);
  }
}

export function createGraphqlContextBuildingSpan(input: {
  ctx: Context;
  tracer: Tracer;
}): Context {
  const span = input.tracer.startSpan(
    'graphql.context',
    { kind: SpanKind.INTERNAL },
    input.ctx,
  );

  return trace.setSpan(input.ctx, span);
}

export function createGraphQLParseSpan(input: {
  ctx: Context;
  tracer: Tracer;
}): Context {
  const span = input.tracer.startSpan(
    'graphql.parse',
    {
      kind: SpanKind.INTERNAL,
    },
    input.ctx,
  );

  return trace.setSpan(input.ctx, span);
}

export function setGraphQLParseAttributes(input: {
  ctx: Context;
  query?: string;
  operationName?: string;
  result: unknown;
}) {
  const span = trace.getSpan(input.ctx);
  if (!span) {
    return;
  }

  span.setAttribute(SEMATTRS_GRAPHQL_DOCUMENT, input.query ?? '<empty>');
  span.setAttribute(
    SEMATTRS_GRAPHQL_OPERATION_NAME,
    input.operationName ?? 'Anonymous',
  );

  if (input.result instanceof Error) {
    span.setAttribute(SEMATTRS_GRAPHQL_ERROR_COUNT, 1);
  }
}

export function createGraphQLValidateSpan(input: {
  ctx: Context;
  tracer: Tracer;
  query?: string;
  operationName?: string;
}): Context {
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
  return trace.setSpan(input.ctx, span);
}

export function setGraphQLValidateAttributes(input: {
  ctx: Context;
  result: any[] | readonly Error[];
}) {
  const { result, ctx } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

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
}

export function createGraphQLExecuteSpan(input: {
  ctx: Context;
  tracer: Tracer;
}): Context {
  const span = input.tracer.startSpan(
    'graphql.execute',
    { kind: SpanKind.INTERNAL },
    input.ctx,
  );

  return trace.setSpan(input.ctx, span);
}

export function setGraphQLExecutionAttributes(input: {
  ctx: Context;
  args: ExecutionArgs;
}) {
  const { ctx, args } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

  const operation = getOperationASTFromDocument(
    args.document,
    args.operationName || undefined,
  );
  const operationName = operation.name?.value ?? 'Anonymous';
  const document = defaultPrintFn(input.args.document);
  span.setAttribute(SEMATTRS_GRAPHQL_OPERATION_TYPE, operation.operation);
  span.setAttribute(SEMATTRS_GRAPHQL_OPERATION_NAME, operationName);
  span.setAttribute(SEMATTRS_GRAPHQL_DOCUMENT, document);
}

export function setGraphQLExecutionResultAttributes(input: {
  ctx: Context;
  result: ExecutionResult | AsyncIterableIterator<ExecutionResult>;
}) {
  const { ctx, result } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

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
}

export function createSubgraphExecuteSpan(input: {
  ctx: Context;
  tracer: Tracer;
  executionRequest: ExecutionRequest;
  subgraphName: string;
}): Context {
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

  return trace.setSpan(input.ctx, span);
}

export function createUpstreamHttpFetchSpan(input: {
  ctx: Context;
  tracer: Tracer;
}): Context {
  const span = input.tracer.startSpan(
    'http.fetch',
    {
      attributes: {},
      kind: SpanKind.CLIENT,
    },
    input.ctx,
  );
  return trace.setSpan(input.ctx, span);
}

export function setUpstreamFetchAttributes(input: {
  ctx: Context;
  url: string;
  options: RequestInit;
  executionRequest?: ExecutionRequest;
}) {
  const { ctx, url, options: fetchOptions } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

  const urlObj = new URL(input.url);
  span.setAttribute(SEMATTRS_HTTP_METHOD, fetchOptions.method ?? 'GET');
  span.setAttribute(SEMATTRS_HTTP_URL, url);
  span.setAttribute(SEMATTRS_NET_HOST_NAME, urlObj.hostname);
  span.setAttribute(SEMATTRS_HTTP_HOST, urlObj.host);
  span.setAttribute(SEMATTRS_HTTP_ROUTE, urlObj.pathname);
  span.setAttribute(SEMATTRS_HTTP_SCHEME, urlObj.protocol);
  if (
    input.executionRequest &&
    isRetryExecutionRequest(input.executionRequest)
  ) {
    const { attempt } = getRetryInfo(input.executionRequest);
    if (attempt > 0) {
      // The resend attribute should only be present on second and subsequent retry attempt
      // https://opentelemetry.io/docs/specs/semconv/http/http-spans/#http-request-retries-and-redirects
      span.setAttribute('http.request.resend_count', attempt);
    }
  }
}

export function setUpstreamFetchResponseAttributes(input: {
  ctx: Context;
  response: Response;
}) {
  const { ctx, response } = input;
  const span = trace.getSpan(ctx);
  if (!span) {
    return;
  }

  span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
  span.setStatus({
    code: response.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    message: response.ok ? undefined : response.statusText,
  });
}

export function recordCacheEvent(
  event: string,
  payload: OnCacheGetHookEventPayload,
) {
  trace.getActiveSpan()?.addEvent('gateway.cache.' + event, {
    'gateway.cache.key': payload.key,
    'gateway.cache.ttl': payload.ttl,
  });
}

export function recordCacheError(
  action: 'read' | 'write',
  error: Error,
  payload: OnCacheGetHookEventPayload,
) {
  trace.getActiveSpan()?.addEvent('gateway.cache.error', {
    'gateway.cache.key': payload.key,
    'gateway.cache.ttl': payload.ttl,
    'gateway.cache.action': action,
    [SEMATTRS_EXCEPTION_TYPE]:
      'code' in error ? (error.code as string) : error.message,
    [SEMATTRS_EXCEPTION_MESSAGE]: error.message,
    [SEMATTRS_EXCEPTION_STACKTRACE]: error.stack,
  });
}

const responseCacheSymbol = Symbol.for('servedFromResponseCache');
export function setExecutionResultAttributes(input: {
  ctx: Context;
  result?: any; // We don't need a proper type here because we rely on Symbol mark from response cache plugin
}) {
  const span = trace.getSpan(input.ctx);
  if (input.result && span) {
    span.setAttribute(
      'gateway.cache.response_cache',
      input.result[responseCacheSymbol] ? 'hit' : 'miss',
    );
  }
}

export function createSchemaLoadingSpan(inputs: {
  tracer: Tracer;
  ctx: Context;
}) {
  const span = inputs.tracer.startSpan(
    'gateway.schema',
    { attributes: { 'gateway.schema.changed': false } },
    inputs.ctx,
  );
  const currentContext = context.active();

  // If the current span is not the provided span, add a link to the current span
  if (currentContext !== inputs.ctx) {
    const currentSpan = trace.getActiveSpan();
    currentSpan?.addLink({ context: span.spanContext() });
  }

  return trace.setSpan(ROOT_CONTEXT, span);
}

export function setSchemaAttributes(inputs: { schema: GraphQLSchema }) {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }
  span.setAttribute('gateway.schema.changed', true);
  span.setAttribute('graphql.schema', printSchema(inputs.schema));
}

export function registerException(ctx: Context | undefined, error: any) {
  const span = ctx && trace.getSpan(ctx);
  if (!span) {
    return;
  }

  const message = error?.message?.toString() ?? error?.toString();
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException(error);
}
