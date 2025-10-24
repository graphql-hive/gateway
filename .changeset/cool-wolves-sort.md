---
'@graphql-mesh/fusion-runtime': minor
'@graphql-tools/federation': minor
'@graphql-tools/delegate': minor
'@graphql-hive/gateway-runtime': minor
'@graphql-tools/stitch': minor
---

Progressive Override Implementation

By default the label of `percent(x)` will work as a simple percentage chance to override the field from another subgraph.
But sometimes you may want to have more control over when to override based on request context, headers, or environment variables in a feature flag style.

Override labels like below;
```graphql
type Foo {
   # If label is active, it overrides `Foo.bar` from A, and use this subgraph not A.
   bar: String @override(from: "A", label: "my_custom_label")
}
```
And now handled within the configuration property `progressiveOverride` like below:
```ts
defineConfig({
  // You can control the label through headers like below;
  progressiveOverride(label, context) {
     if (label === 'my_custom_label') {
        // Use the headers
        return context.request.headers.get('use-my-custom-label') === 'true';
        // Use environment variables
        return process.env.USE_MY_CUSTOM_LABEL === 'true';
        // Or any custom logic that returns a boolean
        // This example makes it override 50% of the time
        return Math.random() < 0.5;
     }
     return false;
  }
})
```

Detailed documentation can be found [here](https://the-guild.dev/graphql/hive/docs/gateway/other-features/progressive-override).