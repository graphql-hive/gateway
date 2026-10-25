import { ExecutionResult } from '@graphql-tools/utils';
import {
  createDeferredPromise,
  fakePromise,
} from '@whatwg-node/promise-helpers';
import { GraphQLError, GraphQLResolveInfo, responsePathAsArray } from 'graphql';
import { annotateExternalObject, isExternalObject } from './mergeFields.js';
import { RECEIVER_SYMBOL } from './symbols.js';
import { DelegationContext } from './types.js';

type Patch = {
  path?: ReadonlyArray<string | number>;
  data?: Record<string, any> | null;
  items?: ReadonlyArray<any> | null;
  errors?: ExecutionResult['errors'];
};

/**
 * Consumes an incremental-delivery stream from a defer-capable subgraph and
 * exposes missing fields to `defaultMergedResolver` as they arrive in patches.
 *
 * Prefers raw `incremental` parts (passthrough). Also tolerates accumulated
 * HTTP snapshots (`mergeIncremental: true`) by only filling keys that are
 * still missing, so re-walking the initial payload stays cheap.
 */
export class IncrementalReceiver {
  private readonly fieldName: string;
  private readonly initialPathLength: number;
  private readonly waiters = new Map<
    string,
    Array<ReturnType<typeof createDeferredPromise<any>>>
  >();
  /** Field waiters keyed by parent object identity (batch-safe). */
  private readonly fieldWaiters: Array<{
    parent: Record<string, any>;
    key: string;
    deferred: ReturnType<typeof createDeferredPromise<any>>;
  }> = [];
  private rootObject: Record<string, any> | null = null;
  private finished = false;

  constructor(private readonly delegationContext: DelegationContext<any>) {
    this.fieldName = delegationContext.fieldName;
    const info = delegationContext.info;
    this.initialPathLength = info?.path
      ? responsePathAsArray(info.path).length
      : 0;
  }

  attachTo(value: any): void {
    if (value == null || typeof value !== 'object') {
      return;
    }
    this.rootObject = value;
    attachReceiver(value, this, this.delegationContext);
  }

  /**
   * Continue reading the subgraph stream in the background, merging patches
   * into the attached external object and resolving any waiters.
   */
  start(iterable: AsyncIterable<ExecutionResult>): void {
    // Floating on purpose: patches resolve waiters; finish()/fail() end consume.
    void this.consume(iterable).catch(() => {
      // consume already handles AbortError / fail; this guards against races.
    });
  }

  /**
   * Apply one incremental-delivery chunk (initial data updates and/or patches).
   */
  handleChunk(result: ExecutionResult): void {
    if (result?.incremental?.length) {
      for (const patch of result.incremental) {
        this.applyPatch(patch as Patch);
      }
      // Prefer explicit patches when present; skip full-snapshot re-merge.
      return;
    }
    if (result?.data && this.rootObject) {
      const rootData = result.data[this.fieldName];
      if (rootData != null && typeof rootData === 'object') {
        this.mergeInto(this.rootObject, [], rootData);
      }
    }
  }

  /** Mark the stream finished and release any remaining waiters. */
  finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) {
        waiter.resolve(undefined);
      }
    }
    this.waiters.clear();
    for (const { deferred } of this.fieldWaiters) {
      deferred.resolve(undefined);
    }
    this.fieldWaiters.length = 0;
  }

  private async consume(
    iterable: AsyncIterable<ExecutionResult>,
  ): Promise<void> {
    try {
      for await (const result of iterable) {
        this.handleChunk(result);
        if (result?.hasNext === false) {
          break;
        }
      }
      this.finish();
    } catch (err) {
      // Operation abort / upstream cancel is expected while patches are still
      // streaming; release waiters without surfacing. Other failures reject
      // pending field waiters so resolvers can report the error.
      if ((err as { name?: string })?.name === 'AbortError') {
        this.finish();
        return;
      }
      this.fail(err);
    }
  }

  /**
   * End the stream and resolve remaining waiters with `err` as a field value
   * (GraphQL-tools Error-as-value pattern — not Promise rejection).
   */
  private fail(err: unknown): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    const error =
      err instanceof Error
        ? err
        : new GraphQLError(
            err == null ? 'Incremental stream failed' : String(err),
          );
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) {
        waiter.resolve(error);
      }
    }
    this.waiters.clear();
    for (const { deferred } of this.fieldWaiters) {
      deferred.resolve(error);
    }
    this.fieldWaiters.length = 0;
  }

  /**
   * Wait until `info`'s field is present on the external object (filled by a
   * deferred patch) or the stream ends.
   *
   * Prefer {@link requestField} from `defaultMergedResolver` — path-relative
   * waits break when batch-delegate splits a list-of-lists result.
   */
  request(info: GraphQLResolveInfo): Promise<any> {
    const fullPath = responsePathAsArray(info.path);
    const relPath = fullPath.slice(this.initialPathLength);
    return this.waitForPath(relPath);
  }

  /**
   * Wait until `parent[responseKey]` is set by a patch (or the stream ends).
   * Uses object identity so it works after batch-delegate splits nested lists.
   */
  requestField(parent: Record<string, any>, responseKey: string): Promise<any> {
    if (
      (Object.prototype.hasOwnProperty.call(parent, responseKey) &&
        parent[responseKey] !== undefined) ||
      this.finished
    ) {
      return fakePromise(parent[responseKey]);
    }
    const deferred = createDeferredPromise<any>();
    this.fieldWaiters.push({ parent, key: responseKey, deferred });
    return deferred.promise;
  }

  /**
   * Yield list items as they arrive from subgraph `@stream` patches.
   * Used when a nested list is streamed under a non-list delegated field
   * (return type is an object, so delegateToSchema cannot use the root-list
   * AsyncIterable path).
   */
  async *streamList(info: GraphQLResolveInfo): AsyncGenerator<any> {
    const fullPath = responsePathAsArray(info.path);
    const relPath = fullPath.slice(this.initialPathLength);
    let index = 0;

    while (true) {
      const itemPath = appendPath(relPath, index);
      if (hasDefinedValue(this.rootObject, itemPath)) {
        yield getAtPath(this.rootObject, itemPath);
        index++;
        continue;
      }

      if (this.finished) {
        // Drain any remaining defined slots that arrived with the last chunk.
        const list = getAtPath(this.rootObject, relPath);
        if (Array.isArray(list)) {
          while (index < list.length) {
            if (list[index] !== undefined) {
              yield list[index];
            }
            index++;
          }
        }
        return;
      }

      const value = await this.waitForPath(itemPath);
      if (value === undefined) {
        if (this.finished) {
          return;
        }
        continue;
      }
      yield value;
      index++;
    }
  }

  private waitForPath(relPath: ReadonlyArray<string | number>): Promise<any> {
    const key = pathKey(relPath);

    // Own-properties set to `undefined` (visitResult placeholders) are still
    // missing - wait for a real patch value.
    if (hasDefinedValue(this.rootObject, relPath) || this.finished) {
      return fakePromise(getAtPath(this.rootObject, relPath));
    }

    const deferred = createDeferredPromise<any>();
    let list = this.waiters.get(key);
    if (!list) {
      list = [];
      this.waiters.set(key, list);
    }
    list.push(deferred);
    return deferred.promise;
  }

  private applyPatch(patch: Patch): void {
    if (!this.rootObject) {
      return;
    }
    const rawPath = patch.path ?? [];
    // Subgraph paths are rooted at the delegated field name
    const relPath =
      rawPath.length > 0 && rawPath[0] === this.fieldName
        ? rawPath.slice(1)
        : rawPath;

    if (patch.items != null) {
      const listPath = relPath.slice(0, -1);
      const index = relPath[relPath.length - 1];
      if (typeof index !== 'number') {
        return;
      }
      let parent = getAtPath(this.rootObject, listPath);
      if (!Array.isArray(parent)) {
        // Ensure the list exists so nested @stream patches can land before
        // the initial payload materialised an array at this path.
        parent = [];
        if (listPath.length === 0) {
          // Should not happen for nested streams under an object field.
          return;
        }
        let cursor: any = this.rootObject;
        for (let i = 0; i < listPath.length - 1; i++) {
          const segment = listPath[i]!;
          if (cursor[segment] == null || typeof cursor[segment] !== 'object') {
            cursor[segment] = typeof listPath[i + 1] === 'number' ? [] : {};
          }
          cursor = cursor[segment];
        }
        cursor[listPath[listPath.length - 1]!] = parent;
      }
      for (let i = 0; i < patch.items.length; i++) {
        parent[index + i] = patch.items[i];
        this.notify(pathKey(listPath, index + i), patch.items[i]);
      }
      return;
    }

    if (patch.data != null && typeof patch.data === 'object') {
      const data = mapPatchDataWithErrors(patch.data, patch.errors, relPath);
      this.mergeInto(this.rootObject, relPath, data);
      return;
    }

    // Error-only patch (no data): resolve waiters under this path with the
    // first error as a field value (GraphQL-tools Error-as-value pattern).
    if (patch.errors?.length) {
      const error = patch.errors[0] as GraphQLError;
      const key = pathKey(relPath);
      if (key) {
        this.notify(key, error);
      }
      for (const [waiterKey, waiters] of this.waiters) {
        if (waiterKey.startsWith(key ? `${key}.` : '')) {
          for (const waiter of waiters) {
            waiter.resolve(error);
          }
          this.waiters.delete(waiterKey);
        }
      }
    }
  }

  private mergeInto(
    root: Record<string, any>,
    relPath: ReadonlyArray<string | number>,
    data: Record<string, any>,
  ): void {
    let target = root;
    for (const segment of relPath) {
      if (target[segment] == null || typeof target[segment] !== 'object') {
        target[segment] = typeof segment === 'number' ? [] : {};
        attachReceiver(target[segment], this, this.delegationContext);
      }
      target = target[segment];
    }

    for (const key of Object.keys(data)) {
      const value = data[key];
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        const existing = target[key];
        // Placeholder `undefined` from visitResult must be overwriteable once
        // the real deferred value arrives.
        if (existing === undefined) {
          target[key] = value;
          if (value != null && typeof value === 'object') {
            attachReceiver(value, this, this.delegationContext);
          }
          this.notify(pathKey(relPath, key), value);
          this.notifyField(target, key, value);
          continue;
        }
        // Accumulated HTTP snapshots re-send fields we already have - only
        // descend into plain objects to pick up newly arrived nested keys.
        if (
          existing != null &&
          value != null &&
          typeof existing === 'object' &&
          typeof value === 'object' &&
          !Array.isArray(existing) &&
          !Array.isArray(value) &&
          !(value instanceof Error)
        ) {
          this.mergeInto(root, appendPath(relPath, key), value);
        } else if (
          Array.isArray(existing) &&
          value != null &&
          typeof value === 'object' &&
          !(value instanceof Error)
        ) {
          // Patches rebuilt from a list path (e.g. `items.1`) arrive as a
          // sparse array or an index-keyed object; descend into the items we
          // already hold so their deferred fields are filled.
          const listPath = appendPath(relPath, key);
          for (const indexKey of Object.keys(value)) {
            const index = Number(indexKey);
            const item = value[indexKey];
            const existingItem = existing[index];
            if (
              Number.isInteger(index) &&
              item != null &&
              typeof item === 'object' &&
              !Array.isArray(item) &&
              !(item instanceof Error) &&
              existingItem != null &&
              typeof existingItem === 'object' &&
              !Array.isArray(existingItem)
            ) {
              this.mergeInto(root, appendPath(listPath, index), item);
            }
          }
        }
        continue;
      }

      target[key] = value;
      if (
        value != null &&
        typeof value === 'object' &&
        !(value instanceof Error)
      ) {
        attachReceiver(value, this, this.delegationContext);
      }
      this.notify(pathKey(relPath, key), value);
      this.notifyField(target, key, value);
    }
  }

  private notify(key: string, value: any): void {
    const waiters = this.waiters.get(key);
    if (!waiters) {
      return;
    }
    for (const waiter of waiters) {
      waiter.resolve(value);
    }
    this.waiters.delete(key);
  }

  private notifyField(
    parent: Record<string, any>,
    key: string,
    value: any,
  ): void {
    for (let i = this.fieldWaiters.length - 1; i >= 0; i--) {
      const waiter = this.fieldWaiters[i]!;
      if (waiter.parent === parent && waiter.key === key) {
        waiter.deferred.resolve(value);
        this.fieldWaiters.splice(i, 1);
      }
    }
  }
}

export function getReceiver(object: any): IncrementalReceiver | undefined {
  return object?.[RECEIVER_SYMBOL];
}

function attachReceiver(
  object: any,
  receiver: IncrementalReceiver,
  delegationContext: DelegationContext<any>,
): void {
  if (object == null || typeof object !== 'object') {
    return;
  }
  if (Array.isArray(object)) {
    for (let i = 0; i < object.length; i++) {
      attachReceiver(object[i], receiver, delegationContext);
    }
    return;
  }
  // Already wired for this stream - skip defineProperty + child walk.
  if (object[RECEIVER_SYMBOL] === receiver) {
    return;
  }
  if (!isExternalObject(object)) {
    annotateExternalObject(
      object,
      [],
      delegationContext.subschema,
      Object.create(null),
    );
  }
  Object.defineProperty(object, RECEIVER_SYMBOL, {
    value: receiver,
    writable: true,
    configurable: true,
  });
  const keys = Object.keys(object);
  for (let i = 0; i < keys.length; i++) {
    const value = object[keys[i]!];
    if (value != null && typeof value === 'object') {
      attachReceiver(value, receiver, delegationContext);
    }
  }
}

function pathKey(
  path: ReadonlyArray<string | number>,
  extra?: string | number,
): string {
  if (extra === undefined) {
    return path.length === 0 ? '' : path.join('.');
  }
  if (path.length === 0) {
    return String(extra);
  }
  return `${path.join('.')}.${extra}`;
}

function appendPath(
  path: ReadonlyArray<string | number>,
  segment: string | number,
): ReadonlyArray<string | number> {
  if (path.length === 0) {
    return [segment];
  }
  const next = path.slice() as Array<string | number>;
  next.push(segment);
  return next;
}

function getAtPath(
  root: Record<string, any> | null,
  path: ReadonlyArray<string | number>,
): any {
  if (root == null) {
    return undefined;
  }
  let current: any = root;
  for (let i = 0; i < path.length; i++) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    const segment = path[i]!;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/** True when every path segment exists and the final value is not `undefined`. */
function hasDefinedValue(
  root: Record<string, any> | null,
  path: ReadonlyArray<string | number>,
): boolean {
  if (root == null) {
    return false;
  }
  if (path.length === 0) {
    return true;
  }
  let current: any = root;
  for (let i = 0; i < path.length; i++) {
    if (current == null || typeof current !== 'object') {
      return false;
    }
    const segment = path[i]!;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = current[segment];
  }
  return current !== undefined;
}

/**
 * When a deferred patch carries both `data: { field: null }` and field errors,
 * surface the GraphQLError as the field value so `resolveExternalValue` can
 * report it on the gateway incremental stream.
 */
function mapPatchDataWithErrors(
  data: Record<string, any>,
  errors: ExecutionResult['errors'] | undefined,
  _relPath: ReadonlyArray<string | number>,
): Record<string, any> {
  if (!errors?.length) {
    return data;
  }
  const mapped: Record<string, any> = { ...data };
  for (const error of errors) {
    const key = error.path?.at(-1);
    if (
      key != null &&
      Object.prototype.hasOwnProperty.call(mapped, key) &&
      mapped[key] == null
    ) {
      mapped[String(key)] = error;
    }
  }
  return mapped;
}
