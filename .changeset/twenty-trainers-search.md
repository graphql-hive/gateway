---
'@graphql-hive/logger': minor
---

Add `redact` option to `Logger` for redacting sensitive data from log output

Supports path arrays, custom censor strings/functions, wildcard paths, and key removal.

### Examples

#### Array of paths

```ts
import { Logger } from '@graphql-hive/logger';

const logger = new Logger({
  redact: ['password', 'headers.authorization', 'users[*].secret'],
});

logger.info({
  password: 'super-secret',
  headers: { authorization: 'Bearer token', host: 'example.com' },
  users: [{ secret: 'hidden', name: 'alice' }],
});
// attrs: {
//   password: '[Redacted]',
//   headers: { authorization: '[Redacted]', host: 'example.com' },
//   users: [{ secret: '[Redacted]', name: 'alice' }],
// }
```

#### Custom censor string

```ts
import { Logger } from '@graphql-hive/logger';

const logger = new Logger({
  redact: {
    paths: ['password', 'headers.authorization'],
    censor: '**REDACTED**',
  },
});

logger.info({
  password: 'super-secret',
  headers: { authorization: 'Bearer token', host: 'example.com' },
});
// attrs: {
//   password: '**REDACTED**',
//   headers: { authorization: '**REDACTED**', host: 'example.com' },
// }
```

#### Censor function

```ts
import { Logger } from '@graphql-hive/logger';

const logger = new Logger({
  redact: {
    paths: ['password'],
    censor: (value, path) => `[${path.join('.')}=${String(value).length} chars]`,
  },
});

logger.info({ password: 'super-secret' });
// attrs: { password: '[password=12 chars]' }
```

#### Key removal

Note that for performance reasons, we set the attribute value to `undefined` instead of completely deleting it. If you're using any of our default writers, those values wont show in the output anyways because the JSON serialiser handles `undefined` by omitting it.

```ts
import { Logger } from '@graphql-hive/logger';

const logger = new Logger({
  redact: {
    paths: ['password', 'headers.authorization'],
    remove: true,
  },
});

logger.info({
  password: 'super-secret',
  headers: { authorization: 'Bearer token', host: 'example.com' },
});
// attrs: { password: undefined, headers: { authorization: undefined, host: 'example.com' } }
```
