---
'@graphql-hive/gateway': minor
---

Hive Laboratory is now the default editor

We’ve upgraded the default GraphQL experience in Hive Gateway by replacing GraphiQL with Hive Laboratory — a more powerful, editor-style interface built for modern workflows.

You can always switch back to GraphiQL by updating the config:

```
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  renderLegacyLaboratory: true
});
```

Or via CLI option

```
hive-gateway --render-legacy-laboratory
```

Or via env variable

```
RENDER_LEGACY_LABORATORY=TRUE hive-gateway
```