import type { PluginContext } from './types.js';

export interface HiveDocument {
  hash: string;
  body: string;
  operationName: string | null;
}

export interface HiveLoaderConfig {
  token: string;
  target: string;
  appName: string;
  appVersion?: string;
  endpoint: string;
  pollIntervalMs: number;
}

export interface HiveLoader {
  fetchDocuments(): Promise<HiveDocument[]>;
  startPolling(
    onChange: (documents: HiveDocument[]) => void,
    initialDocs: HiveDocument[],
  ): void;
  stopPolling(): void;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface DocumentConnection {
  edges: Array<{ node: HiveDocument }>;
  pageInfo: PageInfo;
}

interface TargetSelector {
  organizationSlug: string;
  projectSlug: string;
  targetSlug: string;
}

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

const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;

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
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      if (text) detail = ` — ${text.slice(0, 500)}`;
    } catch {
      // Response body not readable; omit detail from error message.
    }
    throw new Error(
      `Hive API request failed: ${response.status} ${response.statusText}${detail}`,
    );
  }

  let result: GraphQLResponse<T>;
  try {
    result = (await response.json()) as GraphQLResponse<T>;
  } catch (parseErr) {
    throw new Error(
      `Hive API returned invalid JSON (status ${response.status}): ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
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

function extractDocs(connection: DocumentConnection): HiveDocument[] {
  return connection.edges.map((edge, index) => {
    if (!edge?.node) {
      throw new Error(
        `Hive API returned malformed document edge at index ${index}: missing node`,
      );
    }
    if (!edge.node.hash || !edge.node.body) {
      throw new Error(
        `Hive API returned invalid document: missing ${!edge.node.hash ? 'hash' : 'body'}`,
      );
    }
    return edge.node;
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface AppDeploymentDocsResponse {
  target: {
    appDeployment: { documents: DocumentConnection } | null;
  } | null;
}

interface ActiveVersionsResponse {
  target: {
    activeAppDeployments: {
      edges: Array<{ node: { version: string; activatedAt: string } }>;
    };
  } | null;
}

const MAX_PAGES = 1000;

async function resolveLatestVersion(
  ctx: PluginContext,
  config: HiveLoaderConfig,
  targetSelector: TargetSelector,
  fetchFn: typeof fetch,
): Promise<string> {
  const data = await gqlRequest<ActiveVersionsResponse>(
    config.endpoint,
    config.token,
    FETCH_ACTIVE_VERSIONS_QUERY,
    {
      reference: { bySelector: targetSelector },
      appName: config.appName,
      first: 100,
    },
    fetchFn,
  );

  if (!data.target) {
    throw new Error(
      `Target "${config.target}" not found. Verify your hive.target configuration.`,
    );
  }

  const edges = data.target.activeAppDeployments?.edges;
  if (!edges || edges.length === 0) {
    throw new Error(`No active app deployment found for "${config.appName}"`);
  }

  // TODO: activeAppDeployments orders by created_at, not activated_at.
  // Once the Hive API supports ORDER BY activated_at, use first:1 instead of fetching all.
  let latest = edges[0]!.node;
  let parsedTime = new Date(latest.activatedAt).getTime();
  if (Number.isNaN(parsedTime)) {
    ctx.log.warn(
      `Active deployment version "${latest.version}" has unparseable activatedAt: "${latest.activatedAt}". Version selection may be unreliable.`,
    );
    parsedTime = 0;
  }
  let latestTime = parsedTime;
  for (let i = 1; i < edges.length; i++) {
    let edgeTime = new Date(edges[i]!.node.activatedAt).getTime();
    if (Number.isNaN(edgeTime)) {
      ctx.log.warn(
        `Active deployment version "${edges[i]!.node.version}" has unparseable activatedAt: "${edges[i]!.node.activatedAt}". Version selection may be unreliable.`,
      );
      edgeTime = 0;
    }
    if (edgeTime > latestTime) {
      latest = edges[i]!.node;
      latestTime = edgeTime;
    }
  }
  return latest.version;
}

async function fetchDocs(
  config: HiveLoaderConfig,
  version: string,
  targetSelector: TargetSelector,
  fetchFn: typeof fetch,
): Promise<HiveDocument[]> {
  const docs: HiveDocument[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: AppDeploymentDocsResponse = await gqlRequest(
      config.endpoint,
      config.token,
      FETCH_DOCS_QUERY,
      {
        reference: { bySelector: targetSelector },
        appName: config.appName,
        appVersion: version,
        first: PAGE_SIZE,
        after: cursor,
      },
      fetchFn,
    );

    if (!data.target) {
      throw new Error(
        `Target "${config.target}" not found. Verify your hive.target configuration.`,
      );
    }

    const deployment = data.target.appDeployment;
    if (!deployment) {
      if (docs.length === 0) {
        throw new Error(
          `App deployment "${config.appName}" version "${version}" not found`,
        );
      }
      break;
    }

    docs.push(...extractDocs(deployment.documents));

    if (!deployment.documents.pageInfo.hasNextPage) break;
    cursor = deployment.documents.pageInfo.endCursor;
  }

  return docs;
}

export function createHiveLoader(
  ctx: PluginContext,
  config: HiveLoaderConfig,
): HiveLoader {
  if (!ctx.fetch) {
    throw new Error(
      'createHiveLoader requires a fetch function on the context',
    );
  }
  const fetchFn = ctx.fetch as typeof fetch;
  if (!config.token?.trim()) {
    throw new Error('HiveLoaderConfig requires a non-empty token');
  }
  if (!config.target?.trim()) {
    throw new Error('HiveLoaderConfig requires a non-empty target');
  }
  const targetSelector = parseTarget(config.target);
  if (!config.appName?.trim()) {
    throw new Error('HiveLoaderConfig requires a non-empty appName');
  }
  if (!config.endpoint) {
    throw new Error('HiveLoaderConfig requires a non-empty endpoint');
  }
  try {
    new URL(config.endpoint);
  } catch {
    throw new Error(
      `HiveLoaderConfig endpoint is not a valid URL: "${config.endpoint}"`,
    );
  }
  if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 1000) {
    throw new Error('HiveLoaderConfig pollIntervalMs must be at least 1000ms');
  }

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHashKey: string | null = null;
  let pollGeneration = 0;

  function computeHashKey(docs: HiveDocument[]): string {
    return docs
      .map((d) => d.hash)
      .sort()
      .join(',');
  }

  function scheduleNextPoll(
    poll: () => Promise<void>,
    generation: number,
  ): void {
    if (pollTimer !== null && generation === pollGeneration) {
      pollTimer = setTimeout(poll, config.pollIntervalMs);
    }
  }

  async function fetchDocuments(): Promise<HiveDocument[]> {
    const version =
      config.appVersion ??
      (await resolveLatestVersion(ctx, config, targetSelector, fetchFn));
    return fetchDocs(config, version, targetSelector, fetchFn);
  }

  return {
    fetchDocuments,

    startPolling(onChange, initialDocs) {
      if (pollTimer) {
        clearTimeout(pollTimer);
      }

      const myGeneration = ++pollGeneration;
      lastHashKey = computeHashKey(initialDocs);

      async function poll() {
        if (myGeneration !== pollGeneration) return;

        let docs: HiveDocument[];
        try {
          docs = await fetchDocuments();
        } catch (err) {
          ctx.log.error(
            `Hive poll failed: ${errorMessage(err)}. Keeping previous tools.`,
          );
          scheduleNextPoll(poll, myGeneration);
          return;
        }

        if (myGeneration !== pollGeneration) return;

        const newHashKey = computeHashKey(docs);
        if (newHashKey !== lastHashKey) {
          try {
            onChange(docs);
            lastHashKey = newHashKey;
          } catch (err) {
            ctx.log.error(
              `Hive onChange handler failed: ${errorMessage(err)}. Keeping previous tools.`,
            );
            // Don't update lastHashKey so next poll retries with the same docs
          }
        }

        scheduleNextPoll(poll, myGeneration);
      }

      pollTimer = setTimeout(poll, config.pollIntervalMs);
    },

    stopPolling() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },
  };
}
