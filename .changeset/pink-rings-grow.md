---
'@graphql-hive/gateway': minor
---

Introduce built-in armor security features

The following built-in features are introduced:

- `maxTokens`: Limit the number of tokens in a GraphQL document.
  Defaults to `1000` tokens.
- `maxDepth`: Limit the depth of a GraphQL document.
  Defaults to `6` levels.
- `blockFieldSuggestions`: Prevent returning field suggestions and leaking your schema to unauthorized actors.
  Defaults to `true`

They are all **disabled** by default. You can enable or configure them individually. Only basic configuration options are allowed - security features needing more configuration should instead have the plugin installed and used manually.

#### Disable all (default)

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig();
```

#### Enable all

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  maxTokens: true,
  maxDepth: true,
  blockFieldSuggestions: true,
});
```

#### Configure

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  maxTokens: 3000,
  maxDepth: 10,
  blockFieldSuggestions: false,
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
  // disable maxDepth feature by omitting it or setting it to false
  plugins: () => [
    maxDepthRule({
      ignoreIntrospection: false,
      flattenFragments: true,
    }),
  ],
});

```