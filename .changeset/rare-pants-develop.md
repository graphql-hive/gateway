---
'@graphql-mesh/fusion-runtime': minor
'@graphql-tools/federation': minor
'@graphql-hive/gateway-runtime': minor
---

Automatic Global Object Identification

Setting the `globalObjectIdentification` option to true will automatically implement the
GraphQL Global Object Identification Specification by adding a `Node` interface, `node(id: ID!): Node`
and `nodes(ids: [ID!]!): [Node!]!` fields to the `Query` type.

The `Node` interface will have a `nodeId` (not `id`!) field used as the global identifier. It
is intentionally not `id` to avoid collisions with existing `id` fields in subgraphs.

```graphql
"""
An object with a globally unique `ID`.
"""
interface Node {
  """
  A globally unique identifier. Can be used in various places throughout the system to identify this single value.
  """
  nodeId: ID!
}

extend type Query {
  """
  Fetches an object given its globally unique `ID`.
  """
  node(
    """
    The globally unique `ID`.
    """
    nodeId: ID!
  ): Node
  """
  Fetches objects given their globally unique `ID`s.
  """
  nodes(
    """
    The globally unique `ID`s.
    """
    nodeIds: [ID!]!
  ): [Node!]!
}
```
