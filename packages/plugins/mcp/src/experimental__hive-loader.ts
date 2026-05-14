/**
 * EXPERIMENTAL Hive App Deployment loader implemented via MCPOperationsLoader.
 *
 * Fetches persisted GraphQL documents from a Hive App Deployment at startup,
 * then polls for updates on a configurable interval. Operations that carry the
 * @mcpTool directive are automatically registered as MCP tools by the plugin.
 *
 * Usage:
 *   useMCP(ctx, {
 *     name: 'my-api',
 *     loader: createHiveLoader(ctx, {
 *       token: process.env.HIVE_REGISTRY_TOKEN!,
 *       target: 'my-org/my-project/production',
 *       appName: 'my-mcp-app',
 *     }),
 *   });
 */

import type { PluginContext } from './types.js';
import type { MCPOperationsLoader } from './plugin.js';

export interface HiveLoaderConfig {
  /** Hive registry access token */
  token: string;
  /** Target selector as "organizationSlug/projectSlug/targetSlug" */
  target: string;
  /** App deployment name to fetch operations from */
  appName: string;
  /** Specific app version (omit for latest active deployment) */
  appVersion?: string;
  /** Poll interval in ms (default: 60000) */
  pollIntervalMs?: number;
  /** Hive API endpoint (default: "https://app.graphql-hive.com/graphql") */
  endpoint?: string;
}

interface TargetSelector {
  organizationSlug: string;
  projectSlug: string;
  targetSlug: string;
}

interface HiveDocument {
  hash: string;
  body: string;
  operationName: string | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface DocumentConnection {
  edges: Array<{ node: HiveDocument }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface AppDeploymentDocsData {
  target: {
    appDeployment: { documents: DocumentConnection } | null;
  } | null;
}

interface ActiveVersionsData {
  target: {
    activeAppDeployments: {
      edges: Array<{ node: { version: string; activatedAt: string } }>;
    };
  } | null;
}

const FETCH_DOCS_QUERY = `
  query FetchAppDeploymentDocs($reference: TargetReferenceInput!, $appName: String!, $appVersion: String!, $first: Int!, $after: String) {
    target(reference: $reference) {
      appDeployment(appName: $appName, appVersion: $appVersion) {
        documents(first: $first, after: $after) {
          edges { node { hash body operationName } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const FETCH_ACTIVE_VERSIONS_QUERY = `
  query FetchActiveVersions($reference: TargetReferenceInput!, $appName: String!, $first: Int!) {
    target(reference: $reference) {
      activeAppDeployments(first: $first, filter: { name: $appName }) {
        edges { node { version activatedAt } }
      }
    }
  }
`;

function parseTarget(target: string): TargetSelector {
  const parts = target.split('/');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) {
    throw new Error(
      `HiveLoaderConfig target must be "org/project/target", got "${target}"`,
    );
  }
  return {
    organizationSlug: parts[0]!.trim(),
    projectSlug: parts[1]!.trim(),
    targetSlug: parts[2]!.trim(),
  };
}

async function gqlRequest<T>(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchFn: typeof fetch,
): Promise<T> {
  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/graphql-response+json, application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      if (text) detail = ` - ${text.slice(0, 500)}`;
    } catch {
      // response body not readable
    }
    throw new Error(
      `Hive API request failed: ${response.status} ${response.statusText}${detail}`,
    );
  }

  let result: GraphQLResponse<T>;
  try {
    result = (await response.json()) as GraphQLResponse<T>;
  } catch (err) {
    throw new Error(
      `Hive API returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (result.errors?.length) {
    throw new Error(
      `Hive API error: ${result.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!result.data) {
    throw new Error('Hive API returned no data');
  }

  return result.data;
}

async function resolveVersion(
  endpoint: string,
  token: string,
  appName: string,
  target: string,
  targetSelector: TargetSelector,
  fetchFn: typeof fetch,
): Promise<string> {
  const data = await gqlRequest<ActiveVersionsData>(
    endpoint,
    token,
    FETCH_ACTIVE_VERSIONS_QUERY,
    { reference: { bySelector: targetSelector }, appName, first: 100 },
    fetchFn,
  );

  if (!data.target) {
    throw new Error(
      `Target "${target}" not found. Verify your hive.target configuration.`,
    );
  }

  const edges = data.target.activeAppDeployments?.edges;
  if (!edges?.length) {
    throw new Error(`No active app deployment found for "${appName}"`);
  }

  // pick the most recently activated version
  let latest = edges[0]!.node;
  let latestTime = new Date(latest.activatedAt).getTime() || 0;
  for (let i = 1; i < edges.length; i++) {
    const t = new Date(edges[i]!.node.activatedAt).getTime() || 0;
    if (t > latestTime) {
      latest = edges[i]!.node;
      latestTime = t;
    }
  }
  return latest.version;
}

async function fetchDocuments(
  endpoint: string,
  token: string,
  appName: string,
  appVersion: string,
  target: string,
  targetSelector: TargetSelector,
  fetchFn: typeof fetch,
): Promise<HiveDocument[]> {
  const docs: HiveDocument[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 1000; page++) {
    const data = await gqlRequest<AppDeploymentDocsData>(
      endpoint,
      token,
      FETCH_DOCS_QUERY,
      {
        reference: { bySelector: targetSelector },
        appName,
        appVersion,
        first: 100,
        after: cursor,
      },
      fetchFn,
    );

    if (!data.target) {
      throw new Error(
        `Target "${target}" not found. Verify your hive.target configuration.`,
      );
    }

    const deployment = data.target.appDeployment;
    if (!deployment) {
      if (docs.length === 0) {
        throw new Error(
          `App deployment "${appName}" version "${appVersion}" not found`,
        );
      }
      break;
    }

    for (let i = 0; i < deployment.documents.edges.length; i++) {
      const edge = deployment.documents.edges[i]!;
      if (!edge?.node) {
        throw new Error(
          `Hive API returned malformed document edge at index ${i}: missing node`,
        );
      }
      if (!edge.node.hash || !edge.node.body) {
        throw new Error(
          `Hive API returned invalid document: missing ${!edge.node.hash ? 'hash' : 'body'}`,
        );
      }
      docs.push(edge.node);
    }

    if (!deployment.documents.pageInfo.hasNextPage) break;
    cursor = deployment.documents.pageInfo.endCursor;
  }

  return docs;
}

/**
 * Creates an {@link MCPOperationsLoader} that fetches persisted GraphQL documents
 * from a Hive App Deployment and polls for updates on a configurable interval.
 */
export function createHiveLoader(
  ctx: PluginContext,
  config: HiveLoaderConfig,
): MCPOperationsLoader {
  const fetchFn = (ctx.fetch ?? globalThis.fetch) as typeof fetch;
  const endpoint = config.endpoint ?? 'https://app.graphql-hive.com/graphql';
  const pollIntervalMs = config.pollIntervalMs ?? 60_000;
  const targetSelector = parseTarget(config.target);

  // retains the docs from the last successful load() so onUpdate can seed its
  // hash key without re-fetching, matching exactly what the original hive-loader did
  let lastLoadedDocs: HiveDocument[] = [];

  async function load(): Promise<string> {
    const version =
      config.appVersion ??
      (await resolveVersion(
        endpoint,
        config.token,
        config.appName,
        config.target,
        targetSelector,
        fetchFn,
      ));
    const docs = await fetchDocuments(
      endpoint,
      config.token,
      config.appName,
      version,
      config.target,
      targetSelector,
      fetchFn,
    );
    lastLoadedDocs = docs;
    return docs.map((d) => d.body).join('\n');
  }

  function hashKey(docs: HiveDocument[]): string {
    return docs
      .map((d) => d.hash)
      .sort()
      .join(',');
  }

  function onUpdate(callback: (source: string) => void): () => void {
    // seed from the docs already fetched by load() so the first poll doesn't
    // fire a redundant callback when nothing changed
    let lastHashKey = hashKey(lastLoadedDocs);
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      let docs: HiveDocument[];
      try {
        const version =
          config.appVersion ??
          (await resolveVersion(
            endpoint,
            config.token,
            config.appName,
            config.target,
            targetSelector,
            fetchFn,
          ));
        docs = await fetchDocuments(
          endpoint,
          config.token,
          config.appName,
          version,
          config.target,
          targetSelector,
          fetchFn,
        );
      } catch (err) {
        ctx.log.error(
          `Hive poll failed: ${err instanceof Error ? err.message : String(err)}. Keeping previous tools.`,
        );
        schedule();
        return;
      }

      const newHashKey = hashKey(docs);
      if (newHashKey !== lastHashKey) {
        lastHashKey = newHashKey;
        callback(docs.map((d) => d.body).join('\n'));
      }
      schedule();
    }

    function schedule() {
      timer = setTimeout(poll, pollIntervalMs);
    }

    schedule();
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }

  return { load, onUpdate };
}
