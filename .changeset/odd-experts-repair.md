---
'@graphql-hive/gateway-runtime': patch
---

Also use `documentId` property or query param as the key for persisted documents when you use a custom store

All of these will work:

```
http://localhost:4000/graphql?documentId=<hash>
```

```json
{
  "extensions" {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "<hash>"
    }
  }
}
```

```json
{
  "documentId": "<hash>"
}
```

```json
{
  "extensions" {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "<hash>"
    }
  }
}
```

```json
{
  "extensions" {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "<hash>"
    }
  }
}
```
