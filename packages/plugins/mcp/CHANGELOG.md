# @graphql-hive/plugin-mcp

## 0.2.0
### Minor Changes



- [#2408](https://github.com/graphql-hive/gateway/pull/2408) [`df9fe8c`](https://github.com/graphql-hive/gateway/commit/df9fe8cc451142313385564bd2f6cc9eac1446ee) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Add Hive Loader that fetches persisted GraphQL documents from a Hive App Deployments
  
  Resolves app deployment manifest from Hive CDN, fetches every persisted document in that manifest, and returns them as a concatenated GraphQL operations string.
  
  The MCP plugin parses the string, registers tools from operations carrying `@mcpTool` directives.
  
  ```typescript
  import { createHiveLoader } from '@graphql-hive/plugin-mcp/loaders/hive';
  
  useMCP(ctx, {
    name: 'my-api',
    loader: createHiveLoader(ctx, {
      endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/<target-id>',
      accessToken: '<cdn-access-token>',
      appDeployment: {
        appName: 'my-app',
        appVersion: '1.0.0',
      },
    }),
  });
  ```
  
  CDN failover with two endpoints - first is primary, second is fallback:
  
  ```typescript
  createHiveLoader(ctx, {
    endpoint: [
      'https://cdn.graphql-hive.com/artifacts/v1/<target-id>',
      'https://cdn-mirror.graphql-hive.com/artifacts/v1/<target-id>',
    ],
    accessToken: '<cdn-access-token>',
    appDeployment: { appName: 'my-app', appVersion: '1.0.0' },
  });
  ```
  
  `appDeployment` can be a per-request function for multi-tenant setups where deployment varies by request:
  
  ```typescript
  createHiveLoader(ctx, {
    endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/<target-id>',
    accessToken: '<cdn-access-token>',
    appDeployment: ({ request }) => ({
      appName: request.headers.get('x-app-name'),
      appVersion: request.headers.get('x-app-version'),
    }),
  });
  ```
  
  When `appDeployment` is a function, manifest and documents are fetched on every request. Plugin-level string cache still applies - identical responses reuse cached `ToolRegistry`.


- [#2408](https://github.com/graphql-hive/gateway/pull/2408) [`df9fe8c`](https://github.com/graphql-hive/gateway/commit/df9fe8cc451142313385564bd2f6cc9eac1446ee) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Operations loader is now per-request instead of startup-time
  
  Previously `load()` was called once at startup and `onUpdate()` was called to push live changes. Now `load()` is called on every MCP request and `onUpdate` has been removed entirely.
  
  Before:
  
  ```typescript
  const loader: MCPOperationsLoader = {
    async load() {
      return fetchOperations();
    },
    onUpdate(callback) {
      const interval = setInterval(async () => {
        callback(await fetchOperations());
      }, 30_000);
      return () => clearInterval(interval);
    },
  };
  ```
  
  After:
  
  ```typescript
  const loader: MCPOperationsLoader = {
    async load({ request, serverContext }) {
      return fetchOperations();
    },
  };
  ```
  
  `load()` now receives `{ request, serverContext }` so the operations source can vary per request (e.g. driven by a request header for multi-tenant setups).
  
  Results are cached by the returned string: if `load()` returns the same source as a previous call the cached `ToolRegistry` is reused without rebuilding. The cache is cleared whenever the schema changes.
  
  If `load()` throws, the plugin logs the error and falls back to the static tool registry for that request.

### Patch Changes



- [#2408](https://github.com/graphql-hive/gateway/pull/2408) [`df9fe8c`](https://github.com/graphql-hive/gateway/commit/df9fe8cc451142313385564bd2f6cc9eac1446ee) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  
  - Added dependency [`@graphql-hive/core@0.21.1-alpha-20260604213042-0d6112116193a921a379bbc3b917702c29368479` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.21.1) (to `dependencies`)
  - Added dependency [`@whatwg-node/promise-helpers@^1.3.2` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.2) (to `dependencies`)
  - Added dependency [`@whatwg-node/server@^0.11.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.11.0) (to `dependencies`)

## 0.1.2
### Patch Changes

- Updated dependencies [[`2337cb9`](https://github.com/graphql-hive/gateway/commit/2337cb917efd72626c319d952f7713bf3da676d6)]:
  - @graphql-hive/logger@1.1.1

## 0.1.1
### Patch Changes



- [#2391](https://github.com/graphql-hive/gateway/pull/2391) [`952f37f`](https://github.com/graphql-hive/gateway/commit/952f37f76bb4c48c135a3ea38e1c9555278b59fa) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  
  - Updated dependency [`graphql-yoga@^5.21.1` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.21.1) (from `^5.21.0`, in `peerDependencies`)

## 0.1.0
### Minor Changes



- [#1932](https://github.com/graphql-hive/gateway/pull/1932) [`9177415`](https://github.com/graphql-hive/gateway/commit/9177415b347d055450f4fdc7acae6b32f7c71539) Thanks [@adambenhassen](https://github.com/adambenhassen)! - New plugin that lets AI agents interact with your GraphQL API through [MCP](https://modelcontextprotocol.io/) (Model Context Protocol). Each GraphQL operation becomes a tool that agents can discover and call.
  
  ```sh
  npm i @graphql-hive/plugin-mcp
  ```
  
  ```ts
  import { defineConfig } from '@graphql-hive/gateway';
  import { type MCPConfig, useMCP } from '@graphql-hive/plugin-mcp';
  
  const mcp: MCPConfig = {
    name: 'my-api',
    path: '/mcp',
    tools: [
      {
        name: 'get_user',
        source: {
          type: 'inline',
          query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
        },
      },
    ],
  };
  
  export const gatewayConfig = defineConfig({
    plugins: (ctx) => [useMCP(ctx, mcp)],
  });
  ```
  
  Then start the gateway as usual. The MCP endpoint is available at `/mcp`.
  
  Tools can also be auto-registered from `.graphql` files using `@mcpTool` directives:
  
  ```graphql
  query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Current weather") {
    weather(location: $location) { temperature conditions }
  }
  ```
  
  **Features:**
  
  - **Tool sources** - inline queries, named operations from files, `@mcpTool` directives, or a user-provided `loader` for fetching operations from any external source (CDN, object store, persisted-documents service)
  - **Description providers** - dynamic tool/field descriptions via Langfuse or custom providers
  - **Input transforms** - field aliases, defaults, hidden fields, `@mcpHeader` for injecting from HTTP headers
  - **Output transforms** - `output.path` to extract nested data, `outputSchema` control
  - **Hooks** - `preprocess` (validation gates, arg injection) and `postprocess` (format results)
  - **Resources** - static docs (inline text or file) and parameterized resource templates with dynamic URI patterns
  
  See the [README](https://github.com/graphql-hive/gateway/blob/main/packages/plugins/mcp/README.md) for full documentation, and [`examples/`](https://github.com/graphql-hive/gateway/tree/main/packages/plugins/mcp/examples) for runnable demos.
