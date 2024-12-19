---
'@graphql-hive/gateway-runtime': patch
---

Better messages on debug logs of readiness check endpoint;

Before;
On successful readiness check, the gateway was logging the following message:
```
Readiness check passed: Supergraph loaded
```
Because this makes the users think it was just loaded.
After;
On successful readiness check, the gateway will log the following message:
```
Readiness check passed because supergraph has been loaded already
```

On failed readiness check, the gateway was logging the following message:
Before;
```
Readiness check failed: Supergraph not loaded
```
It should make the users think it was not loaded or there is an issue with the supergraph.

After;
```
Readiness check failed because supergraph has not been loaded yet or failed to load
```