export {
  // Basic attributes
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,

  // HTTP/network attributes
  SEMATTRS_HTTP_CLIENT_IP,
  SEMATTRS_HTTP_HOST,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_SCHEME,
  SEMATTRS_HTTP_SERVER_NAME,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_USER_AGENT,
  SEMATTRS_NET_HOST_NAME,
} from '@opentelemetry/semantic-conventions';

// GraphQL-specific attributes
// Based on https://opentelemetry.io/docs/specs/semconv/attributes-registry/graphql/
export const SEMATTRS_GRAPHQL_DOCUMENT = 'graphql.document';
export const SEMATTRS_GRAPHQL_OPERATION_TYPE = 'graphql.operation.type';
export const SEMATTRS_GRAPHQL_OPERATION_NAME = 'graphql.operation.name';

// Identifies a graphql request
export const SEMATTRS_HIVE_GRAPHQL = 'hive.graphql';
export const SEMATTRS_HIVE_GRAPHQL_OPERATION_HASH =
  'hive.graphql.operation.hash';
export const SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT = 'hive.graphql.error.count';
export const SEMATTRS_HIVE_GRAPHQL_ERROR_CODES = 'hive.graphql.error.codes';

// Gateway-specific attributes
export const SEMATTRS_HIVE_GATEWAY_UPSTREAM_SUBGRAPH_NAME =
  'hive.gateway.upstream.subgraph.name';
export const SEMATTRS_HIVE_GATEWAY_OPERATION_SUBGRAPH_NAMES =
  'hive.gateway.operation.subgraph.names';
