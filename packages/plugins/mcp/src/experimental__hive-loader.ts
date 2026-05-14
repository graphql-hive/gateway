/**
 * EXPERIMENTAL: Hive App Deployment loader implemented via MCPOperationsLoader.
 *
 * Fetches persisted GraphQL documents from a Hive App Deployment at startup,
 * then polls for updates on a configurable interval. Operations that carry the
 * @mcpTool directive are automatically registered as MCP tools by the plugin.
 *
 * This loader is experimental because the integration with Hive Console is not
 * yet finalized. The API is subject to breaking changes without notice.
 *
 * Usage:
 *
 * ```ts
 * import { useMCP } from '@graphql-hive/plugin-mcp';
 * import { createHiveLoader } from '@graphql-hive/plugin-mcp/experimental__hive-loader';
 *
 * useMCP(ctx, {
 *   name: 'my-api',
 *   loader: createHiveLoader(ctx, {
 *     token: process.env.HIVE_REGISTRY_TOKEN!,
 *     target: 'my-org/my-project/production',
 *     appName: 'my-mcp-app',
 *   }),
 * });
 * ```
 */

import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { isAsyncIterable, type AsyncExecutor } from '@graphql-tools/utils';
import { parse } from 'graphql';
import type { MCPOperationsLoader } from './plugin.js';
import type { PluginContext } from './types.js';

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

const FETCH_DOCS_QUERY = parse(`
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
`);

const FETCH_ACTIVE_VERSIONS_QUERY = parse(`
  query FetchActiveVersions($reference: TargetReferenceInput!, $appName: String!, $first: Int!) {
    target(reference: $reference) {
      activeAppDeployments(first: $first, filter: { name: $appName }) {
        edges { node { version activatedAt } }
      }
    }
  }
`);

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

async function resolveVersion(
  execute: AsyncExecutor,
  appName: string,
  target: string,
  targetSelector: TargetSelector,
): Promise<string> {
  const result = await execute<ActiveVersionsData>({
    document: FETCH_ACTIVE_VERSIONS_QUERY,
    variables: {
      reference: { bySelector: targetSelector },
      appName,
      first: 100,
    },
  });

  if (isAsyncIterable(result)) {
    throw new Error(
      `Expected single execution result for active versions query, but got async iterable`,
    );
  }

  if (result.errors?.length) {
    throw new Error(
      `Hive API error: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`,
    );
  }

  const data = result.data;
  if (!data?.target) {
    throw new Error(
      `Target "${target}" not found. Verify your hive.target configuration.`,
    );
  }

  const edges = data!.target.activeAppDeployments?.edges;
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
  execute: AsyncExecutor,
  appName: string,
  appVersion: string,
  target: string,
  targetSelector: TargetSelector,
): Promise<HiveDocument[]> {
  const docs: HiveDocument[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 1000; page++) {
    const result = await execute<AppDeploymentDocsData>({
      document: FETCH_DOCS_QUERY,
      variables: {
        reference: { bySelector: targetSelector },
        appName,
        appVersion,
        first: 100,
        after: cursor,
      },
    });

    if (result.errors?.length) {
      throw new Error(
        `Hive API error: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`,
      );
    }

    const data = result.data ?? undefined;
    if (!data?.target) {
      throw new Error(
        `Target "${target}" not found. Verify your hive.target configuration.`,
      );
    }

    const deployment: { documents: DocumentConnection } | null =
      data.target.appDeployment;
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
 *
 * @experimental Subject to breaking changes without notice.
 */
export function createHiveLoader(
  ctx: PluginContext,
  config: HiveLoaderConfig,
): MCPOperationsLoader {
  const endpoint = config.endpoint ?? 'https://app.graphql-hive.com/graphql';
  const pollIntervalMs = config.pollIntervalMs ?? 60_000;
  const targetSelector = parseTarget(config.target);

  const execute = buildHTTPExecutor({
    endpoint,
    ...(ctx.fetch ? { fetch: ctx.fetch as typeof fetch } : {}),
    headers: { Authorization: `Bearer ${config.token}` },
    timeout: 30_000,
  });

  // retains the docs from the last successful load() so onUpdate can seed its
  // hash key without re-fetching
  let lastLoadedDocs: HiveDocument[] = [];

  async function load(): Promise<string> {
    const version =
      config.appVersion ??
      (await resolveVersion(
        execute,
        config.appName,
        config.target,
        targetSelector,
      ));
    const docs = await fetchDocuments(
      execute,
      config.appName,
      version,
      config.target,
      targetSelector,
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
            execute,
            config.appName,
            config.target,
            targetSelector,
          ));
        docs = await fetchDocuments(
          execute,
          config.appName,
          version,
          config.target,
          targetSelector,
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
