---
'@graphql-hive/nestjs': patch
---

Initialise the gateway only once

Nest can invoke `generateSchema` method before running `start`. If that is the case, the existing Hive Gateway instance should be used in `start`.
