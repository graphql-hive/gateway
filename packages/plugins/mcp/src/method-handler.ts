import type { Logger } from '@graphql-hive/gateway-runtime';
import type { ExecutionResult, GraphQLSchema } from 'graphql';

/** A GraphQL operation submitted through {@link MCPMethodContext.executeGraphQL}. */
export interface MCPGraphQLOperation {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

/** Transport details for the request that carried a custom method call. */
export type MCPMethodTransport = {
  type: 'http';
  /** The incoming HTTP request. */
  request: Request;
  /** Lower-cased HTTP request headers. */
  headers: Record<string, string>;
};

/** Request metadata and server capabilities available to a custom MCP method handler. */
export interface MCPMethodContext {
  /** Plugin logger, scoped with the MCP prefix. */
  logger: Logger;
  /** The JSON-RPC method name that was dispatched. */
  method: string;
  /** The JSON-RPC request id, or null for notifications. */
  requestId: string | number | null;
  /**
   * Execute a GraphQL operation through the full server pipeline.
   * Request headers are forwarded, so authentication and other
   * header-driven plugins behave as if the operation arrived over HTTP.
   * The operation shares the incoming request's server context, so
   * plugins that key state on context identity see it as part of the
   * surrounding MCP request.
   */
  executeGraphQL(operation: MCPGraphQLOperation): Promise<ExecutionResult>;
  /** The current GraphQL schema. */
  getSchema(): GraphQLSchema;
  /** Transport details for the current request, when available. */
  transport?: MCPMethodTransport;
}

/**
 * Handler for a custom JSON-RPC method on the MCP endpoint. `params`
 * arrives exactly as sent by the client and may be undefined. The return
 * value must be JSON-serializable and becomes the JSON-RPC `result`.
 * Throw {@link MCPMethodError} to produce a JSON-RPC error response
 * with a specific code.
 */
export type MCPMethodHandler = (
  params: unknown,
  context: MCPMethodContext,
) => Promise<unknown> | unknown;

/** Thrown by a custom method handler to produce a JSON-RPC error response. */
export class MCPMethodError extends Error {
  constructor(
    /** JSON-RPC error code (e.g. -32602 for invalid params). */
    readonly code: number,
    message: string,
    /** Optional structured details serialized into the error `data` field. */
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'MCPMethodError';
  }
}
