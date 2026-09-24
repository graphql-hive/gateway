import { InvalidArgumentError } from '@commander-js/extra-typings';
import type {
  DevFetcherTargetReference,
  GatewayGraphOSManagedFederationOptions,
  GatewayHiveCDNOptions,
  GatewayHiveDevOptions,
  HiveDevService,
  UnifiedGraphConfig,
} from '@graphql-hive/gateway-runtime';
import type { CLIContext } from '../cli';

/** A supergraph source the `supergraph` command can serve. */
export type SupergraphSource =
  | UnifiedGraphConfig
  | GatewayHiveCDNOptions
  | GatewayGraphOSManagedFederationOptions
  | GatewayHiveDevOptions;

export interface DevSupergraphCLIOptions {
  /** The `[schemaPathOrUrl]` argument. Cannot be combined with `--dev-service`. */
  schemaPathOrUrl: string | undefined;
  /** `--hive-cdn-endpoint`. Cannot be combined with `--dev-service`. */
  hiveCdnEndpoint: string | undefined;
  /** `--apollo-graph-ref`. Cannot be combined with `--dev-service`. */
  apolloGraphRef: string | undefined;
  /** `--hive-target`, reused as the target a dev supergraph source is composed against remotely. */
  hiveTarget: string | undefined;
  /** `--hive-access-token`, reused as the registry token for remote composition. */
  hiveAccessToken: string | undefined;
  /** `--dev-remote`. `false` when explicitly disabled through the `DEV_REMOTE` env var. */
  devRemote: boolean | undefined;
  /** `--dev-registry` */
  devRegistry: string | undefined;
  /** `--dev-service <name>=<url>` occurrences, keyed by service name. */
  devService: Record<string, string>;
  /** `--dev-service-source <name>=<source>` occurrences, keyed by service name. */
  devServiceSource: Record<string, string>;
  /** `--dev-service-schema <name>=<path>` occurrences, keyed by service name. */
  devServiceSchema: Record<string, string>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses a `--hive-target` value into a {@link DevFetcherTargetReference}. Accepts either a
 * target UUID, or a "$organizationSlug/$projectSlug/$targetSlug" slug path.
 */
export function parseDevTarget(
  target: string,
): DevFetcherTargetReference | null {
  if (UUID_RE.test(target)) {
    return { byId: target };
  }
  const parts = target.split('/');
  const [organizationSlug, projectSlug, targetSlug] = parts;
  if (parts.length !== 3 || !organizationSlug || !projectSlug || !targetSlug) {
    return null;
  }
  return { bySelector: { organizationSlug, projectSlug, targetSlug } };
}

/**
 * Parses a `<service-name>=<value>` option occurrence into a map keyed by service name. A name
 * repeated across occurrences of the same option overrides its previous value.
 */
export function collectByServiceName(
  raw: string,
  previous: Record<string, string>,
): Record<string, string> {
  const eqIdx = raw.indexOf('=');
  const name = raw.slice(0, eqIdx).trim();
  if (eqIdx === -1 || !name) {
    throw new InvalidArgumentError(
      `invalid entry "${raw}", expected "<service-name>=<value>".`,
    );
  }
  return { ...previous, [name]: raw.slice(eqIdx + 1).trim() };
}

const DEV_SERVICE_SOURCES = new Set(['federation', 'graphql', 'file']);

export function collectDevServiceSource(
  raw: string,
  previous: Record<string, string>,
): Record<string, string> {
  const source = raw.slice(raw.indexOf('=') + 1).trim();
  if (!DEV_SERVICE_SOURCES.has(source)) {
    throw new InvalidArgumentError(
      `invalid source "${source}", expected "federation", "graphql" or "file".`,
    );
  }
  return collectByServiceName(raw, previous);
}

/**
 * Builds {@link HiveDevService} objects, one per key of `urlByName` (which is the set of dev
 * service names), overlaying the optional `sourceByName`/`schemaByName` for that name and erroring
 * out via `onError` on any inconsistency.
 */
function buildDevServices(
  urlByName: Record<string, string>,
  sourceByName: Record<string, string>,
  schemaByName: Record<string, string>,
  onError: (message: string) => never,
): HiveDevService[] {
  const names = Object.keys(urlByName);
  for (const name of [
    ...Object.keys(sourceByName),
    ...Object.keys(schemaByName),
  ]) {
    if (!(name in urlByName)) {
      onError(
        `--dev-service-source/--dev-service-schema references unknown service "${name}". ` +
          `Expected one of the services given via --dev-service: ${names.join(', ') || '(none)'}.`,
      );
    }
  }
  return names.map((name) => {
    const url = urlByName[name]!;
    const source = sourceByName[name];
    const schema = schemaByName[name];
    if (source === 'file') {
      if (!schema) {
        onError(
          `--dev-service-schema is required for service "${name}" (--dev-service-source file).`,
        );
      }
      return { name, url, source: 'file', schema };
    }
    if (schema) {
      onError(
        `--dev-service-schema is only valid when --dev-service-source is "file" (service "${name}").`,
      );
    }
    return {
      name,
      url,
      ...(source ? { source: source as 'federation' | 'graphql' } : {}),
    };
  });
}

/**
 * Applies the dev supergraph source CLI options to the supergraph source resolved from the
 * arguments and the config file, and returns the source to serve.
 *
 * A dev source comes either from the config file (`supergraph: { type: 'dev', ... }`) or is
 * created from `--dev-service`. The `--dev-*` options and the global `--hive-target` and
 * `--hive-access-token` (reused as the target and token for remote composition) override the
 * corresponding fields of the source; CLI options always take precedence over the config file.
 * Any inconsistency logs an error and exits the process.
 */
export function handleDevSupergraphConfig(
  ctx: CLIContext,
  supergraph: SupergraphSource,
  cliOpts: DevSupergraphCLIOptions,
): SupergraphSource {
  const onDevOptionError = (message: string): never => {
    ctx.log.error(message);
    return process.exit(1);
  };
  const devServices = buildDevServices(
    cliOpts.devService,
    cliOpts.devServiceSource,
    cliOpts.devServiceSchema,
    onDevOptionError,
  );

  let devSupergraph: GatewayHiveDevOptions;
  if (
    typeof supergraph === 'object' &&
    'type' in supergraph &&
    supergraph.type === 'dev'
  ) {
    devSupergraph = { ...supergraph };
  } else if (devServices.length) {
    if (
      cliOpts.schemaPathOrUrl ||
      cliOpts.hiveCdnEndpoint ||
      cliOpts.apolloGraphRef
    ) {
      onDevOptionError(
        'The --dev-service, --dev-service-source and --dev-service-schema options cannot be combined with a schema path/url, --hive-cdn-endpoint, or --apollo-graph-ref.',
      );
    }
    devSupergraph = { type: 'dev', services: [] };
  } else {
    if (cliOpts.devRemote || cliOpts.devRegistry) {
      onDevOptionError(
        'The --dev-* options require the supergraph source to be a Hive dev fetcher (`supergraph: { type: "dev", ... }` in the config file, or set via --dev-service).',
      );
    }
    return supergraph;
  }

  if (devServices.length) {
    devSupergraph.services = devServices;
  }
  if (cliOpts.devRemote != null) {
    devSupergraph.remote = cliOpts.devRemote;
  }
  if (cliOpts.devRegistry) {
    devSupergraph.registry = cliOpts.devRegistry;
  }
  if (cliOpts.hiveAccessToken) {
    devSupergraph.token = cliOpts.hiveAccessToken;
  }
  if (cliOpts.hiveTarget) {
    const target = parseDevTarget(cliOpts.hiveTarget);
    if (!target) {
      onDevOptionError(
        `Invalid --hive-target "${cliOpts.hiveTarget}" for remote dev composition. Expected "$organizationSlug/$projectSlug/$targetSlug" or a UUID.`,
      );
    }
    devSupergraph.target = target;
  }
  if (devSupergraph.remote && !devSupergraph.token) {
    onDevOptionError(
      'Remote composition of the dev supergraph source requires a Hive registry access token. Please provide it through the "--hive-access-token <token>" option or `token` in the config file.',
    );
  }
  return devSupergraph;
}
