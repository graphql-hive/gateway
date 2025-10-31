---
'@graphql-hive/plugin-opentelemetry': minor
'@graphql-mesh/plugin-prometheus': minor
---

New `ignoreRequest` OpenTelemetry API to allow other plugins (like Prometheus integration) to mark
an HTTP Request to be excluded from OpenTelemetry tracing.

```ts
import { hive } from '@graphql-hive/gateway/opentelemetry/api';
import { defineConfig } from 'graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
  plugins: () => [
    {
      instrumentation: {
        request: ({ request }) => {
          hive.ignoreRequest(request); // marks the request to be ignored by OTEL tracing
        },
      },
    },
  ],
});
```

I addition to this new API, the Prometheus integration now automatically marks metrics scraping
request to be ignored.

If you are defining a custom request span filter, a new payload attribute have been added so that
you can respect (or not, depending on your needs) the ignored request list:

```ts
import { defineConfig } from 'graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: {
      spans: {
        http: ({ request, ignoredRequests }) => {
          // First check if the request is ignored. This is the default http span filter implementation.
          if (ignoredRequests.has(request)) {
            return false;
          }

          // Then apply your custom filtering

          return true;
        },
      },
    },
  },
});
```
