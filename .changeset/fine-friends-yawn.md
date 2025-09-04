---
"@graphql-mesh/plugin-jwt-auth": patch
---

Improve context usage and inheritance

Now exports `JWTExtendContextFields` that can be directly used in the context generics, also updates the config making sure it's propagated.
