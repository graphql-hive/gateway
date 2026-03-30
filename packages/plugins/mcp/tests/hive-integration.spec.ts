import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createHiveLoader } from '../src/hive-loader.js';
import { resolveToolConfigs } from '../src/plugin.js';

const logger = createLoggerFromLogging(false);

describe('hive integration', () => {
  it('hive documents with @mcpTool become tools via existing pipeline', () => {
    const hiveDocs = [
      {
        hash: 'a',
        body: 'query GetUser($id: ID!) @mcpTool(name: "get_user", description: "Fetch a user") { user(id: $id) { name } }',
        operationName: 'GetUser',
      },
      {
        hash: 'b',
        body: 'query ListPosts { posts { title } }',
        operationName: 'ListPosts',
      }, // no @mcpTool
      {
        hash: 'c',
        body: 'mutation CreatePost($title: String!) @mcpTool(name: "create_post") { createPost(title: $title) { id } }',
        operationName: 'CreatePost',
      },
    ];

    const operationsSource = hiveDocs.map((d) => d.body).join('\n');
    const tools = resolveToolConfigs({ log: logger }, { tools: [], operationsSource });

    // Only operations with @mcpTool directive become tools
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_post',
      'get_user',
    ]);
    expect(tools.find((t) => t.name === 'get_user')!.directiveDescription).toBe(
      'Fetch a user',
    );
  });

  it('hive and local operations merge without conflict', () => {
    const localOps = 'query LocalOp @mcpTool(name: "local_tool") { hello }';
    const hiveOps = 'query HiveOp @mcpTool(name: "hive_tool") { world }';
    const merged = [localOps, hiveOps].join('\n');

    const tools = resolveToolConfigs({ log: logger }, { tools: [], operationsSource: merged });

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'hive_tool',
      'local_tool',
    ]);
  });

  it('explicit tools[] config overrides hive directive metadata', () => {
    const hiveOps =
      'query GetUser($id: ID!) @mcpTool(name: "get_user", description: "From directive") { user(id: $id) { name } }';

    const tools = resolveToolConfigs({ log: logger }, {
      tools: [
        {
          name: 'get_user',
          source: {
            type: 'graphql',
            operationName: 'GetUser',
            operationType: 'query' as const,
          },
          tool: { description: 'From config' },
        },
      ],
      operationsSource: hiveOps,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('get_user');
    // Config description wins over directive
    expect(tools[0]!.tool?.description).toBe('From config');
    // Directive description preserved as fallback
    expect(tools[0]!.directiveDescription).toBe('From directive');
  });

  it('operations without @mcpTool are still available as source for explicit tools', () => {
    const hiveOps = 'query GetUser($id: ID!) { user(id: $id) { name } }';

    const tools = resolveToolConfigs({ log: logger }, {
      tools: [
        {
          name: 'get_user',
          source: {
            type: 'graphql',
            operationName: 'GetUser',
            operationType: 'query' as const,
          },
        },
      ],
      operationsSource: hiveOps,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('get_user');
    expect(tools[0]!.query).toContain('GetUser');
  });

  it('local operations override hive when same @mcpTool name exists (merge order)', () => {
    const hiveOps =
      'query HiveVersion @mcpTool(name: "my_tool", description: "From Hive") { hive }';
    const localOps =
      'query LocalVersion @mcpTool(name: "my_tool", description: "From local") { local }';

    const merged = [hiveOps, localOps].join('\n');
    const tools = resolveToolConfigs({ log: logger }, { tools: [], operationsSource: merged });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('my_tool');
    expect(tools[0]!.directiveDescription).toBe('From local');
    expect(tools[0]!.query).toContain('LocalVersion');
  });

  describe('rebuildToolsWithHiveSource simulation', () => {
    it('merges hive documents with local operationsSource correctly', () => {
      const operationsSource =
        'query LocalTool @mcpTool(name: "local") { local }';
      const hiveSource = 'query HiveTool @mcpTool(name: "from_hive") { hive }';

      const mergedSource = [hiveSource, operationsSource]
        .filter(Boolean)
        .join('\n');

      const tools = resolveToolConfigs({ log: logger }, {
        tools: [],
        operationsSource: mergedSource,
      });

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(['from_hive', 'local']);
    });

    it('explicit tools[] config wins over both hive and local sources', () => {
      const hiveSource =
        'query GetData @mcpTool(name: "get_data", description: "Hive desc") { data }';
      const localSource =
        'query GetData @mcpTool(name: "get_data", description: "Local desc") { data }';
      const mergedSource = [hiveSource, localSource].filter(Boolean).join('\n');

      const tools = resolveToolConfigs({ log: logger }, {
        tools: [
          {
            name: 'get_data',
            source: {
              type: 'graphql',
              operationName: 'GetData',
              operationType: 'query' as const,
            },
            tool: { description: 'Config wins' },
          },
        ],
        operationsSource: mergedSource,
      });

      expect(tools).toHaveLength(1);
      expect(tools[0]!.tool?.description).toBe('Config wins');
      // Local directive wins over hive directive for the fallback
      expect(tools[0]!.directiveDescription).toBe('Local desc');
    });
  });

  describe('createHiveLoader + resolveToolConfigs end-to-end', () => {
    it('fetched docs flow through the full pipeline', async () => {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'h1',
                        body: 'query Foo @mcpTool(name: "foo_tool", description: "Foo") { foo }',
                        operationName: 'Foo',
                      },
                    },
                    {
                      node: {
                        hash: 'h2',
                        body: 'query Bar { bar }',
                        operationName: 'Bar',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(
        { log: logger, fetch: fetchFn },
        {
          token: 'tok',
          target: 'org/proj/dev',
          appName: 'app',
          appVersion: '1.0.0',
          endpoint: 'https://api.test',
          pollIntervalMs: 60_000,
        },
      );

      const docs = await loader.fetchDocuments();
      const hiveSource = docs.map((d) => d.body).join('\n');
      const tools = resolveToolConfigs({ log: logger }, {
        tools: [],
        operationsSource: hiveSource,
      });

      // Only @mcpTool operations become tools
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe('foo_tool');
      expect(tools[0]!.directiveDescription).toBe('Foo');
    });
  });
});
