# @graphql-hive/signal

## 2.1.0
### Minor Changes



- [#2680](https://github.com/graphql-hive/gateway/pull/2680) [`680eb53`](https://github.com/graphql-hive/gateway/commit/680eb53b8d9ef9b45503c819780ff1d592773e35) Thanks [@ardatan](https://github.com/ardatan)! - # New utility `abortSignalAll`
  
  We have introduced a new utility function `abortSignalAll` that allows you to combine multiple `AbortSignal` instances into a single signal. This is particularly useful in scenarios where you want to abort an operation if all of the individual signals are aborted.
  
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

## 2.0.0
### Major Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Drop Node 18 support
  
  Least supported Node version is now v20.

## 1.0.0

### Major Changes

- [#922](https://github.com/graphql-hive/gateway/pull/922) [`c9cd206`](https://github.com/graphql-hive/gateway/commit/c9cd20666a740514a5c17ecd6d0c000ad0dd7106) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Ponyfill AbortSignal.any without leaks
