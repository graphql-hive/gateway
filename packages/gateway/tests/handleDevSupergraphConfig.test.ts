import { InvalidArgumentError } from '@commander-js/extra-typings';
import type { GatewayHiveDevOptions } from '@graphql-hive/gateway-runtime';
import { Logger, MemoryLogWriter } from '@graphql-hive/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CLIContext } from '../src/cli';
import {
  collectByServiceName,
  collectDevServiceSource,
  handleDevSupergraphConfig,
  parseDevTarget,
  type DevSupergraphCLIOptions,
} from '../src/commands/handleDevSupergraphConfig';

const noCliOpts: DevSupergraphCLIOptions = {
  schemaPathOrUrl: undefined,
  hiveCdnEndpoint: undefined,
  apolloGraphRef: undefined,
  hiveTarget: undefined,
  hiveAccessToken: undefined,
  devRemote: undefined,
  devRegistry: undefined,
  devService: {},
  devServiceSource: {},
  devServiceSchema: {},
};

const configDevSupergraph: GatewayHiveDevOptions = {
  type: 'dev',
  services: [{ name: 'products', url: 'http://products.localhost/graphql' }],
};

function createCtx() {
  const writer = new MemoryLogWriter();
  const ctx = { log: new Logger({ writers: [writer] }) } as CLIContext;
  return { ctx, writer };
}

describe('parseDevTarget', () => {
  it('parses a target UUID into a byId reference', () => {
    expect(parseDevTarget('a0f4c605-6541-4350-8cfe-b31f21a4bf80')).toEqual({
      byId: 'a0f4c605-6541-4350-8cfe-b31f21a4bf80',
    });
    expect(parseDevTarget('A0F4C605-6541-4350-8CFE-B31F21A4BF80')).toEqual({
      byId: 'A0F4C605-6541-4350-8CFE-B31F21A4BF80',
    });
  });

  it('parses a slug path into a bySelector reference', () => {
    expect(parseDevTarget('the-guild/graphql-hive/staging')).toEqual({
      bySelector: {
        organizationSlug: 'the-guild',
        projectSlug: 'graphql-hive',
        targetSlug: 'staging',
      },
    });
  });

  it.each([
    'not-a-slug',
    'org/project',
    'org/project/target/extra',
    'org//target',
    '',
  ])('rejects %j', (target) => {
    expect(parseDevTarget(target)).toBeNull();
  });
});

describe('collectByServiceName', () => {
  it('collects trimmed name/value pairs, later occurrences overriding earlier ones', () => {
    let collected = collectByServiceName('products=http://localhost:4001', {});
    collected = collectByServiceName(
      ' reviews = http://localhost:4002 ',
      collected,
    );
    collected = collectByServiceName(
      'products=http://localhost:4003',
      collected,
    );
    expect(collected).toEqual({
      products: 'http://localhost:4003',
      reviews: 'http://localhost:4002',
    });
  });

  it.each(['products', '=http://localhost:4001', '  =value'])(
    'rejects %j without a service name',
    (raw) => {
      expect(() => collectByServiceName(raw, {})).toThrow(InvalidArgumentError);
    },
  );
});

describe('collectDevServiceSource', () => {
  it.each(['federation', 'graphql', 'file'])(
    'accepts the %s source',
    (source) => {
      expect(collectDevServiceSource(`products=${source}`, {})).toEqual({
        products: source,
      });
    },
  );

  it('rejects unknown sources', () => {
    expect(() => collectDevServiceSource('products=introspection', {})).toThrow(
      InvalidArgumentError,
    );
  });
});

describe('handleDevSupergraphConfig', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function expectExitWithError(
    writer: MemoryLogWriter,
    fn: () => unknown,
    message: string,
  ) {
    expect(fn).toThrow('process.exit(1)');
    expect(writer.logs).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: expect.stringContaining(message),
      }),
    );
  }

  describe('without a dev supergraph source', () => {
    it('returns the supergraph source untouched when no dev options are given', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, './supergraph.graphql', noCliOpts),
      ).toBe('./supergraph.graphql');
      const cdn = { type: 'hive' as const, endpoint: 'http://cdn', key: 'key' };
      expect(handleDevSupergraphConfig(ctx, cdn, noCliOpts)).toBe(cdn);
    });

    it('ignores --hive-target and --hive-access-token, which are also used for reporting', () => {
      const { ctx, writer } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, './supergraph.graphql', {
          ...noCliOpts,
          hiveTarget: 'not-a-slug-but-fine-for-reporting',
          hiveAccessToken: 'token',
        }),
      ).toBe('./supergraph.graphql');
      expect(writer.logs).toEqual([]);
    });

    it.each([
      ['--dev-remote', { devRemote: true }],
      ['--dev-registry', { devRegistry: 'http://registry.localhost/graphql' }],
    ] satisfies [string, Partial<DevSupergraphCLIOptions>][])(
      'errors when %s is given',
      (_option, cliOpts) => {
        const { ctx, writer } = createCtx();
        expectExitWithError(
          writer,
          () =>
            handleDevSupergraphConfig(ctx, './supergraph.graphql', {
              ...noCliOpts,
              ...cliOpts,
            }),
          'The --dev-* options require the supergraph source to be a Hive dev fetcher',
        );
      },
    );

    it('does not error when --dev-remote is explicitly disabled (DEV_REMOTE=0)', () => {
      const { ctx, writer } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, './supergraph.graphql', {
          ...noCliOpts,
          devRemote: false,
        }),
      ).toBe('./supergraph.graphql');
      expect(writer.logs).toEqual([]);
    });
  });

  describe('with services from --dev-service', () => {
    it('creates a dev supergraph source from the services', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, './supergraph.graphql', {
          ...noCliOpts,
          devService: {
            products: 'http://localhost:4001/graphql',
            reviews: 'http://localhost:4002/graphql',
            inventory: 'http://localhost:4003/graphql',
          },
          devServiceSource: { reviews: 'graphql', inventory: 'file' },
          devServiceSchema: { inventory: './inventory.graphql' },
        }),
      ).toEqual({
        type: 'dev',
        services: [
          { name: 'products', url: 'http://localhost:4001/graphql' },
          {
            name: 'reviews',
            url: 'http://localhost:4002/graphql',
            source: 'graphql',
          },
          {
            name: 'inventory',
            url: 'http://localhost:4003/graphql',
            source: 'file',
            schema: './inventory.graphql',
          },
        ],
      });
    });

    it('overrides the services of a dev supergraph source from the config file', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, configDevSupergraph, {
          ...noCliOpts,
          devService: { reviews: 'http://localhost:4002/graphql' },
        }),
      ).toEqual({
        type: 'dev',
        services: [{ name: 'reviews', url: 'http://localhost:4002/graphql' }],
      });
    });

    it.each([
      ['a schema path', { schemaPathOrUrl: './supergraph.graphql' }],
      ['--hive-cdn-endpoint', { hiveCdnEndpoint: 'http://cdn.localhost' }],
      ['--apollo-graph-ref', { apolloGraphRef: 'graph@variant' }],
    ] satisfies [string, Partial<DevSupergraphCLIOptions>][])(
      'errors when combined with %s',
      (_source, cliOpts) => {
        const { ctx, writer } = createCtx();
        expectExitWithError(
          writer,
          () =>
            handleDevSupergraphConfig(ctx, './supergraph.graphql', {
              ...noCliOpts,
              ...cliOpts,
              devService: { products: 'http://localhost:4001/graphql' },
            }),
          'cannot be combined with a schema path/url, --hive-cdn-endpoint, or --apollo-graph-ref',
        );
      },
    );

    it('errors when --dev-service-source or --dev-service-schema references an unknown service', () => {
      const { ctx, writer } = createCtx();
      expectExitWithError(
        writer,
        () =>
          handleDevSupergraphConfig(ctx, './supergraph.graphql', {
            ...noCliOpts,
            devService: { products: 'http://localhost:4001/graphql' },
            devServiceSource: { reviews: 'graphql' },
          }),
        'references unknown service "reviews"',
      );
    });

    it('errors when a file source has no --dev-service-schema', () => {
      const { ctx, writer } = createCtx();
      expectExitWithError(
        writer,
        () =>
          handleDevSupergraphConfig(ctx, './supergraph.graphql', {
            ...noCliOpts,
            devService: { products: 'http://localhost:4001/graphql' },
            devServiceSource: { products: 'file' },
          }),
        '--dev-service-schema is required for service "products"',
      );
    });

    it('errors when --dev-service-schema is given for a non-file source', () => {
      const { ctx, writer } = createCtx();
      expectExitWithError(
        writer,
        () =>
          handleDevSupergraphConfig(ctx, './supergraph.graphql', {
            ...noCliOpts,
            devService: { products: 'http://localhost:4001/graphql' },
            devServiceSchema: { products: './products.graphql' },
          }),
        '--dev-service-schema is only valid when --dev-service-source is "file"',
      );
    });
  });

  describe('remote composition options', () => {
    it('keeps the config file values when no CLI options are given', () => {
      const { ctx } = createCtx();
      const supergraph: GatewayHiveDevOptions = {
        ...configDevSupergraph,
        remote: true,
        registry: 'http://registry.localhost/graphql',
        token: 'config-token',
        target: { byId: 'config-target' },
      };
      const result = handleDevSupergraphConfig(ctx, supergraph, noCliOpts);
      expect(result).toEqual(supergraph);
      expect(result).not.toBe(supergraph);
    });

    it('uses --hive-target and --hive-access-token as the target and token', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, configDevSupergraph, {
          ...noCliOpts,
          devRemote: true,
          devRegistry: 'http://registry.localhost/graphql',
          hiveTarget: 'the-guild/graphql-hive/staging',
          hiveAccessToken: 'hvo1/token',
        }),
      ).toEqual({
        ...configDevSupergraph,
        remote: true,
        registry: 'http://registry.localhost/graphql',
        token: 'hvo1/token',
        target: {
          bySelector: {
            organizationSlug: 'the-guild',
            projectSlug: 'graphql-hive',
            targetSlug: 'staging',
          },
        },
      });
    });

    it('accepts a target UUID in --hive-target', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(ctx, configDevSupergraph, {
          ...noCliOpts,
          hiveTarget: 'a0f4c605-6541-4350-8cfe-b31f21a4bf80',
        }),
      ).toMatchObject({
        target: { byId: 'a0f4c605-6541-4350-8cfe-b31f21a4bf80' },
      });
    });

    it('lets the CLI options override the config file', () => {
      const { ctx } = createCtx();
      expect(
        handleDevSupergraphConfig(
          ctx,
          {
            ...configDevSupergraph,
            remote: true,
            registry: 'http://registry.localhost/graphql',
            token: 'config-token',
            target: { byId: 'config-target' },
          },
          {
            ...noCliOpts,
            // DEV_REMOTE=0 disables remote composition configured in the file
            devRemote: false,
            devRegistry: 'http://other-registry.localhost/graphql',
            hiveTarget: 'the-guild/graphql-hive/production',
            hiveAccessToken: 'cli-token',
          },
        ),
      ).toEqual({
        ...configDevSupergraph,
        remote: false,
        registry: 'http://other-registry.localhost/graphql',
        token: 'cli-token',
        target: {
          bySelector: {
            organizationSlug: 'the-guild',
            projectSlug: 'graphql-hive',
            targetSlug: 'production',
          },
        },
      });
    });

    it('does not mutate the supergraph source from the config file', () => {
      const { ctx } = createCtx();
      const supergraph: GatewayHiveDevOptions = { ...configDevSupergraph };
      handleDevSupergraphConfig(ctx, supergraph, {
        ...noCliOpts,
        hiveTarget: 'the-guild/graphql-hive/staging',
        hiveAccessToken: 'token',
      });
      expect(supergraph).toEqual(configDevSupergraph);
    });

    it('errors on an invalid --hive-target', () => {
      const { ctx, writer } = createCtx();
      expectExitWithError(
        writer,
        () =>
          handleDevSupergraphConfig(ctx, configDevSupergraph, {
            ...noCliOpts,
            hiveTarget: 'not-a-slug',
          }),
        'Invalid --hive-target "not-a-slug" for remote dev composition',
      );
    });

    it('errors when remote composition is enabled without a token', () => {
      const { ctx, writer } = createCtx();
      expectExitWithError(
        writer,
        () =>
          handleDevSupergraphConfig(ctx, configDevSupergraph, {
            ...noCliOpts,
            devRemote: true,
            hiveTarget: 'the-guild/graphql-hive/staging',
          }),
        '"--hive-access-token <token>"',
      );
    });

    it('allows remote composition with the token from the config file', () => {
      const { ctx, writer } = createCtx();
      expect(
        handleDevSupergraphConfig(
          ctx,
          { ...configDevSupergraph, token: 'config-token' },
          { ...noCliOpts, devRemote: true },
        ),
      ).toMatchObject({ remote: true, token: 'config-token' });
      expect(writer.logs).toEqual([]);
    });
  });
});
