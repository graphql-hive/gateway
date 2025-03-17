---
'@graphql-hive/gateway': minor
---

Introduce built-in security features

The following built-in features are introduced:

- `maxTokens`: Limit the number of tokens in a GraphQL document.
  Defaults to `1000` tokens.
- `maxDepth`: Limit the depth of a GraphQL document.
  Defaults to `6` levels.
- `blockFieldSuggestions`: Prevent returning field suggestions and leaking your schema to unauthorized actors.
  Defaults to `true`

They are all **disabled** by default. You have an option to enable them all, or configure them individually. Only basic configuration options are allowed - security features needing more configuration should instead have the plugin installed and used manually.

#### Disable all (default)

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  security: false,
});
```

#### Enable all

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  security: true,
});
```

#### Enable individually

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  security: {
    maxTokens: true, // default false
    maxDepth: true, // default false
    blockFieldSuggestions: true, // default false
  },
});
```

#### Configure individually

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  security: {
    maxTokens: 3000,
    maxDepth: 10,
    blockFieldSuggestions: false,
  },
});
```

#### Advanced configuration

```sh
npm i @escape.tech/graphql-armor-max-depth
```

```ts
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  security: {
    maxTokens: true,
    // disable maxDepth feature by omitting it or setting it to false
    blockFieldSuggestions: true,
  },
  plugins: () => [
    maxDepthRule({
      ignoreIntrospection: false,
      flattenFragments: true,
    }),
  ],
});

```
