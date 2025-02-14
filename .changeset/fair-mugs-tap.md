---
'@graphql-tools/delegate': patch
---

When a field with `@skip` and `@include` directives in a selection set throws, show the correct error

```
// Query
query myQuery($toInclude: Boolean! = false) {
    user(id: 1) {
        id
        name
        username
        totalReviews @include(if: $toInclude) 
        # If this throws, show the actual error instead of `Argument \"if\" of required type \"Boolean!\" was provided the variable` error
    }
}

// Variables
{
    "toInclude": true
}
```