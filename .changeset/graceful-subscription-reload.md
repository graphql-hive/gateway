---
'@graphql-hive/gateway-runtime': minor
---

Graceful reload for subscriptions: two new opt-in options on `gracefulSchemaReload`.

- `pinSubscriptions` pins subscriptions to the schema generation that admitted them, the way queries and mutations already are, so a reload no longer ends every subscription on the instance at once. The superseded generation keeps serving them until each stream ends or `drainTimeout` force-disposes it.
- `subscriptionRetirementSpread` (requires `pinSubscriptions`) retires the superseded generation's subscriptions gradually: each is ended with a plain stream completion at an evenly spaced, randomly assigned moment inside the window, so clients resubscribe against the new schema as a steady trickle instead of a burst. Until its moment a subscription keeps receiving events from the old generation.

Both default off; existing behavior is unchanged.
