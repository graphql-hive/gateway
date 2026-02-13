---
'@graphql-tools/delegate': patch
---

Respect existing variable definitions from the gateway request;
1. If the argument uses a variable definition on the gateway request, keep and re-use it as-is.

```graphql
query ($var1: String = "default") {
  rootField(arg1: $var1)
}
```

2. If the argument does not use a variable definition on the gateway request, create a new variable definition for it and make sure it does not conflict with any existing variable definitions on the gateway request, because the gateway request can have variables that have nothing to do with the delegated argument.

```graphql
query ($arg1: String = "default") {
  rootField(arg1: 2) {
    someField(arg2: $arg1)
  }
}
```

In that case it should be delegated as:

```graphql
query ($arg1: String = "default", $rootField_arg1: String = "default") {
  rootField(arg1: $rootField_arg1) {
    someField(arg2: $arg1)
  }
}
```


