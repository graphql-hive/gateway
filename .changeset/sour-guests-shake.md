---
'@graphql-tools/federation': minor
---

Support `@join__directive` while extracting subgraph definitions from the supergraph

For example;

```graphql
type Query @join__type(graph: PRODUCTS) {
  products: [Product]
    @join__field(graph: PRODUCTS)
    @join__directive(
      graphs: [PRODUCTS]
      name: "connect"
      args: {
        source: "ecomm"
        http: { GET: "/products" }
        selection: "$.products {\n  id\n  name\n  description\n}"
      }
    )
}
```
should extract `products` subgraph as;
```graphql
type Query {
    products: @connect(
      source: "ecomm"
      http: { GET: "/products" }
      selection: """
      $.products {
        id
        name
        description
      }
      """
    )
}
```

Same goes to the schema definition level directives;

```graphql
schema
  @join__directive(
    graphs: [PRODUCTS]
    name: "link"
    args: {
      url: "https://specs.apollo.dev/connect/v0.2"
      import: ["@connect", "@source"]
    }
  )
  @join__directive(
    graphs: [PRODUCTS]
    name: "source"
    args: {
      name: "ecomm"
      http: { baseURL: "https://ecommerce.demo-api.apollo.dev/", headers: [] }
    }
  ) {
  query: Query
}
```

should be extracted as;

```graphql
extend schema
  @link( # Enable this schema to use Apollo Connectors
    url: "https://specs.apollo.dev/connect/v0.2"
    import: ["@connect", "@source"]
  )
  @source(
    name: "ecomm"
    # A @source directive defines a shared data source for multiple Connectors.
    http: {
        baseURL: "https://ecommerce.demo-api.apollo.dev/"
        headers: [
        # If your API requires headers, add them here and in your router.yaml file.
        # Example:
        # { name: "name", value: "{$config.apiKey}" }
        ]
    }
  )
```