---
'@graphql-hive/gateway-runtime': minor
---

## New Hive CDN mirror and circuit breaker

Hive CDN introduced a new CDN mirror and circuit breaker to mitigate the risk related to Cloudflare
services failures.

You can now provide multiple endpoint in Hive Console related features, and configure the circuit
breaker handling CDN failure and how it switches to the CDN mirror.

### Usage

To enable this feature, please provide the mirror endpoint in `supergraph` and `persistedDocument`
options:

```diff
import { defineConfig } from '@graphql-hive/gateway'

export const gatewayConfig = defineConfig({
  supergraph: {
    type: 'hive',
-   endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/...../supergraph',
+   endpoint: [
+     'https://cdn.graphql-hive.com/artifacts/v1/...../supergraph',
+     'https://cdn-mirror.graphql-hive.com/artifacts/v1/...../supergraph'
+   ]
  },

  persistedDocuments: {
-   endpoint: 'https://cdn.graphql-hive.com/artifacts/v1/...',
+   endpoint: [
+     'https://cdn.graphql-hive.com/artifacts/v1/...',
+     'https://cdn-mirror.graphql-hive.com/artifacts/v1/...'
+   ]
  }
})
```

### Configuration

The circuit breaker has production ready default configuration, but you customize its behavior:

```ts
import { defineConfig, CircuitBreakerConfiguration } from '@graphql-hive/gateway';

const circuitBreaker: CircuitBreakerConfiguration = {
    resetTimeout: 30_000; // 30s
    errorThresholdPercentage: 50;
    volumeThreshold: 5;
}

export const gatewayConfig = defineConfig({
  supergraph: {
    type: 'hive',
    endpoint: [...],
    circuitBreaker,
  },

  persistedDocuments: {
    type: 'hive',
    endpoint: [...],
    circuitBreaker,
  },
});
```
