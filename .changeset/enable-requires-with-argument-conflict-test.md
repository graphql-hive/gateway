---
"@graphql-tools/federation": patch
---

Fix `@requires` argument conflict when multiple computed fields in a federation subgraph require the same external field with different argument values (e.g. `price(currency: "USD")` vs `price(currency: "EUR")`).

Previously, all `@requires` selections for computed fields in a subgraph were merged into a single entity representation. When two computed fields needed the same external field but with different argument values, the stitching engine would alias each field differently — but both aliases ended up in the same representation object. The second field would overwrite the first, so one of the computed fields would always receive the wrong value.

**What changed:**

- **Computed field conflict detection** — when building subschema merge configs from the supergraph SDL, the federation stitching layer now detects conflicts: two computed fields conflict when they produce the same top-level aliased field name in their `@requires` selections but with different aliases (i.e. the same external field required with different argument values).

- **Conflict group isolation** — conflicting computed fields are separated into independent "conflict groups". Each group gets its own `SubschemaConfig` (sharing the same underlying executor/endpoint) with only its own computed fields and a deduplicated entity representation that carries only the aliased fields it actually needs. This ensures each group sends the correct representation to the subgraph and receives the right data back.

- **Schema scoping per group** — the main `SubschemaConfig`'s schema is filtered (via `mapSchema`) to remove computed fields that were moved to a conflict group, preventing the stitching engine from incorrectly routing those fields back to the main subschema. Each conflict group's `SubschemaConfig` is likewise scoped to expose only its own computed fields.

- **`getMergedTypeConfigFromKey` extended** — accepts an optional `keysExtraKeys` parameter so each conflict group can inject its own `extraKeys` set when building entity key functions, keeping key generation independent per group.

- **Federation audit test enabled** — the `requires-with-argument-conflict` case in the federation compatibility test suite was previously skipped for stitching (marked `it.todo`). It now passes and the skip has been removed.
