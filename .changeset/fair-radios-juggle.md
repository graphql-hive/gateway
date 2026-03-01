---
'@graphql-hive/signal': minor
---

# New utility `AbortSignal.all`

We have introduced a new utility function `AbortSignal.all` that allows you to combine multiple `AbortSignal` instances into a single signal. This is particularly useful in scenarios where you want to abort an operation if all of the individual signals are aborted.

```ts
import { abortSignalAll } from '@graphql-hive/signal';
const ctrl1 = new AbortController();
const ctrl2 = new AbortController();

const combinedSignal = abortSignalAll([ctrl1.signal, ctrl2.signal]);

// Aborting both individual signals will abort the combined signal
ctrl1.abort();

console.assert(!combinedSignal.aborted); // still not aborted

ctrl2.abort();
console.assert(combinedSignal.aborted); // now aborted
```
