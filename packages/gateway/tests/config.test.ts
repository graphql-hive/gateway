import type { KeyValueCache } from '@graphql-mesh/types';
import { describe, expect, it } from 'vitest';
import { wrapCacheWithKeyPrefix } from '../src/config';

/**
 * Creates an in-memory KeyValueCache for testing, exposing the raw store so
 * tests can assert on the exact keys written to the backend.
 */
function createInMemoryCache(): KeyValueCache<string> & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      return store.delete(key);
    },
    async getKeysByPrefix(prefix) {
      return [...store.keys()].filter((key) => key.startsWith(prefix));
    },
  };
}

describe('wrapCacheWithKeyPrefix', () => {
  it('returns the same cache instance when no prefix is given', () => {
    const cache = createInMemoryCache();
    expect(wrapCacheWithKeyPrefix(cache, undefined)).toBe(cache);
    expect(wrapCacheWithKeyPrefix(cache, '')).toBe(cache);
  });

  it('namespaces get/set/delete with the configured prefix', async () => {
    const cache = createInMemoryCache();
    const wrapped = wrapCacheWithKeyPrefix(cache, 'hive:gw:');

    await wrapped.set('some-key', 'some-value');
    expect(cache.store.get('hive:gw:some-key')).toBe('some-value');
    expect(cache.store.has('some-key')).toBe(false);

    expect(await wrapped.get('some-key')).toBe('some-value');

    expect(await wrapped.delete('some-key')).toBe(true);
    expect(cache.store.has('hive:gw:some-key')).toBe(false);
  });

  it('returns getKeysByPrefix results without the global prefix', async () => {
    const cache = createInMemoryCache();
    const wrapped = wrapCacheWithKeyPrefix(cache, 'hive:gw:');

    await wrapped.set('users:1', 'a');
    await wrapped.set('users:2', 'b');
    await wrapped.set('posts:1', 'c');

    const keys = await wrapped.getKeysByPrefix('users:');
    expect(keys.sort()).toEqual(['users:1', 'users:2']);
  });

  it('does not leak the prefix to callers using a different global prefix', async () => {
    const cache = createInMemoryCache();
    const wrappedA = wrapCacheWithKeyPrefix(cache, 'app-a:');
    const wrappedB = wrapCacheWithKeyPrefix(cache, 'app-b:');

    await wrappedA.set('same-key', 'from-a');
    await wrappedB.set('same-key', 'from-b');

    expect(await wrappedA.get('same-key')).toBe('from-a');
    expect(await wrappedB.get('same-key')).toBe('from-b');
    expect(cache.store.size).toBe(2);
  });
});
