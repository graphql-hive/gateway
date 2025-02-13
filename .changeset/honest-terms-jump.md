---
'@graphql-tools/stitch': patch
---

Fix a bug while isolating computed abstract type fields

When a field in an interface needs to be isolated,
it should not remove the field from the base subschema if it is used by other members of the base subschema.
