---
'@graphql-hive/gateway': patch
---

Update Hive Laboratory to the latest version.

**Added**

- Copy as cURL in the operation toolbar.
- A reload-schema button in the builder, which introspects over the network even when the
  gateway supplied the schema.
- An `introspection.pollSchema` setting to turn off the 5 second introspection poll and
  refresh the schema only on demand.
- The Query Plan tab is now always shown, with an empty state explaining that plans appear
  when the gateway returns `extensions.queryPlan`.

**Fixed**

- The builder no longer collapses expanded fields while introspection is polling, and
  toggles no longer reset the view.
- Editor hovers, tooltips, and Monaco's folding icons now render correctly.
- Response size is shown in real units instead of always reading `0KB`.

**Removed**

- The request `retry` setting has been removed from the Laboratory. The underlying HTTP
  executor retried on any GraphQL `errors` response while dropping request headers, so
  retries went out unauthenticated. Existing persisted `retry` values are ignored
  automatically. If you set `graphiql: { retry: … }` in your gateway config, it no longer
  has any effect.
