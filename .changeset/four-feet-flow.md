---
'@graphql-hive/plugin-mcp': minor
---

Add Hive Loader that fetches persisted GraphQL documents from a Hive App Deployments

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
