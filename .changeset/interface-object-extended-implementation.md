---
'@graphql-tools/delegate': patch
---

Resolve `@interfaceObject` fields on an implementation that another subgraph extends directly

Previously the field resolved to `null` without an error, because only the implementation's subgraphs were considered and the `@interfaceObject` subgraph was never called.
