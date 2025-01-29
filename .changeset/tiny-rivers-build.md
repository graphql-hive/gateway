---
'@graphql-tools/federation': patch
---

Handle shared subscription root fields correctly

In case of conflicting subscription root fields coming from different subgraphs or different entry points(multiple keys),
subscription was failing.
