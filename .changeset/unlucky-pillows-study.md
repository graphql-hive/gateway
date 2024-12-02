---
'@graphql-tools/batch-execute': patch
---

Fix the issue that batched query generation when optional variables are not prefixed and sent correctly.

See the use case below;

When two batched queries are sent like below;

```graphql
query TestOne($someOptionalVar: String) {
  foo(someOptionalArg: $someOptionalVar) {
    id
    name
  }
}
```

```graphql
query TestTwo($someOptionalVar: String) {
  foo(someOptionalArg: $someOptionalVar) {
    id
    name
  }
}
```

And then `someOptionalVar` is not prefixed if the value is not sent by the user. The batched queries will be sent as below, then it will cause issues.

```graphql
query TestOneTwo($someOptionalVar: String, $someOptionalVar: String) {
  _0_foo: foo(someOptionalArg: $someOptionalVar) {
    id
    name
  }
  _1_foo: foo(someOptionalArg: $someOptionalVar) {
    id
    name
  }
}
```