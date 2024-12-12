---
'@graphql-hive/gateway-runtime': minor
'@graphql-hive/gateway': minor
---

New Retry and Timeout plugins;

- Retry plugin: Retry a request if it fails

It respects the `Retry-After` HTTP header, [See more about this HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)

```ts
export const gatewayConfig = defineConfig({
    upstreamRetry: {
        // The maximum number of retries to attempt.
        maxRetries: 3, // required
        // The maximum delay between retries in milliseconds.
        maxDelay: 1000, // default
        /**
         * A function that determines whether a response should be retried.
         * If the upstream returns `Retry-After` header, the response will be retried.
         */
        shouldRetry: response => response.status >= 500 || response.status === 429 // default
    }
    // or you can configure it by subgraph name
    upstreamRetry({ subgraphName }) {
        if (subgraphName === 'my-rate-limited-subgraph') {
            return {
                maxRetries: 3,
            }
        }
    }
})
```

- Timeout plugin: Timeout a request if it takes too long

```ts
export const gatewayConfig = defineConfig({
    // The maximum time in milliseconds to wait for a response from the upstream.
    upstreamTimeout: 1000, // required
    // or you can configure it by subgraph name
    upstreamTimeout({ subgraphName }) {
        if (subgraphName === 'my-slow-subgraph') {
            return 1000;
        }
    }
})
```
