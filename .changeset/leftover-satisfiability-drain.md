---
'@graphql-tools/delegate': patch
---

Settle unsatisfiable stitched leftover fields instead of hanging

When a merged field could only be fetched with a merge key that never
arrived, leftover resolution returned a deferred promise that never
settled and the request hung idle. Track leftover work and, once the
queue is empty, reject unsettled deferreds with `SATISFIABILITY_ERROR`
(Apollo composition-style message, including selection snippet and
subschema names when set).

Closes #2695
