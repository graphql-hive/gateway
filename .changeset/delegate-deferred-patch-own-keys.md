---
'@graphql-tools/delegate': patch
---

Only follow own properties when merging forwarded deferred patches

Deferred patch paths are made of client response keys, so merging them into the result tree only considers properties the tree actually owns. Aliases matching built-in object members, like `hasOwnProperty`, are merged like any other response key.
