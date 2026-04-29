---
'@graphql-hive/gateway': minor
---

Hive Laboratory is now the default editor

We’ve upgraded the default GraphQL experience in Hive Gateway by replacing GraphiQL with Hive Laboratory — a more powerful, editor-style interface built for modern workflows.

You can always switch back to GraphiQL by updating the config:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  renderLegacyGraphiQL: true
});
```

Or via CLI option

```sh
hive-gateway --render-legacy-graphiql
```

Or via env variable

```sh
RENDER_LEGACY_GRAPHIQL=true hive-gateway
```