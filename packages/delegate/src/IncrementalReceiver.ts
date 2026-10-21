import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { ExecutionResult } from '@graphql-tools/utils';
import {
  GraphQLError,
  GraphQLResolveInfo,
  responsePathAsArray,
} from 'graphql';
import {
  annotateExternalObject,
  isExternalObject,
} from './mergeFields.js';
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
    // Floating on purpose: patches resolve waiters; finish() runs in finally.
    void this.consume(iterable).catch(() => {
      // consume already handles AbortError; this guards against races.
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
    } catch (err) {
      // Operation abort / upstream cancel is expected while patches are still
      // streaming; do not surface as an unhandled rejection.
      if ((err as { name?: string })?.name !== 'AbortError') {
        // Non-abort failures still release waiters in finally.
      }
    } finally {
      this.finish();
    }
  }

  /**
   * Wait until `info`'s field is present on the external object (filled by a
   * deferred patch) or the stream ends.
   */
  request(info: GraphQLResolveInfo): Promise<any> {
    const fullPath = responsePathAsArray(info.path);
    const relPath = fullPath.slice(this.initialPathLength);
    const key = pathKey(relPath);

    // Own-properties set to `undefined` (visitResult placeholders) are still
    // missing - wait for a real patch value.
    if (hasDefinedValue(this.rootObject, relPath) || this.finished) {
      return Promise.resolve(getAtPath(this.rootObject, relPath));
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
      const parent = getAtPath(this.rootObject, listPath);
      if (Array.isArray(parent) && typeof index === 'number') {
        for (let i = 0; i < patch.items.length; i++) {
          parent[index + i] = patch.items[i];
          this.notify(pathKey(listPath, index + i), patch.items[i]);
        }
      }
      return;
    }

    if (patch.data != null && typeof patch.data === 'object') {
      const data = mapPatchDataWithErrors(patch.data, patch.errors, relPath);
      this.mergeInto(this.rootObject, relPath, data);
      return;
    }

    // Error-only patch (no data): reject waiters under this path with the error.
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
        }
        continue;
      }

      target[key] = value;
      if (value != null && typeof value === 'object' && !(value instanceof Error)) {
        attachReceiver(value, this, this.delegationContext);
      }
      this.notify(pathKey(relPath, key), value);
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
