---
'@graphql-tools/stitch': patch
---

Fix keyless (zero-arg) type merging when the initial subschema cannot satisfy any of the requested fields. Inject `__typename` for merged types that have resolvers but no key `selectionSet`, so `finalizeGatewayRequest` keeps a stub object that type merging can fill instead of failing with an empty gateway request.
