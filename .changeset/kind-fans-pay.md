---
'@graphql-hive/gateway-runtime': patch
---

Improve GraphOS supergraph fetching;

- Handle `minDelaySeconds` correctly, before retrying the supergraph request, wait for the `minDelaySeconds` to pass.
- Respect `maxRetries` (which is the maximum of the number of available uplink endpoints and 3) when fetching the supergraph.
- Try all possible uplinks before failing the supergraph request.
