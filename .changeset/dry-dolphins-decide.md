---
'@graphql-tools/delegate': minor
'@graphql-tools/stitch': minor
---

Automatically resolve plain merged-type references returned by local stitching resolvers

Local fields introduced through `typeDefs` or `resolvers` are wrapped by `stitchSchemas`. When they return a partial merged type containing a usable key, stitching performs one initial delegation with type merging enabled. The existing stitching planner then handles computed fields, `@requires` dependencies, batching, nested entities, and fields owned by other subschemas.
