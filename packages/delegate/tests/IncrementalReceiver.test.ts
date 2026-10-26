import { describe, expect, it } from 'vitest';
import { IncrementalReceiver } from '../src/IncrementalReceiver.js';
import type { DelegationContext } from '../src/types.js';

function makeReceiver() {
  return new IncrementalReceiver({
    fieldName: 'product',
  } as DelegationContext<any>);
}

async function* chunks(
  ...results: Array<Record<string, unknown>>
): AsyncGenerator<any> {
  for (const result of results) {
    yield result;
  }
}

async function* throwing(err: Error): AsyncGenerator<any> {
  yield { data: { product: { id: '1' } }, hasNext: true };
  throw err;
}

describe('IncrementalReceiver error handling', () => {
  it('surfaces non-abort upstream failures to field waiters as Error values', async () => {
    const receiver = makeReceiver();
    const parent: Record<string, any> = { id: '1' };
    receiver.attachTo(parent);

    const pending = receiver.requestField(parent, 'description');
    receiver.start(throwing(new Error('subgraph boom')));

    const value = await pending;
    expect(value).toBeInstanceOf(Error);
    expect((value as Error).message).toBe('subgraph boom');
  });

  it('releases waiters with undefined on AbortError without surfacing', async () => {
    const receiver = makeReceiver();
    const parent: Record<string, any> = { id: '1' };
    receiver.attachTo(parent);

    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';

    const pending = receiver.requestField(parent, 'description');
    receiver.start(throwing(abortErr));

    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves requestField with fakePromise when the key is already present', async () => {
    const receiver = makeReceiver();
    const parent: Record<string, any> = { id: '1', description: 'ready' };
    receiver.attachTo(parent);

    // Wrap FakePromise so Bun's .resolves matcher accepts it.
    await expect(
      Promise.resolve(receiver.requestField(parent, 'description')),
    ).resolves.toBe('ready');
  });

  it('merges a deferred patch after the initial payload', async () => {
    const receiver = makeReceiver();
    const parent: Record<string, any> = { id: '1' };
    receiver.attachTo(parent);

    const pending = receiver.requestField(parent, 'description');
    receiver.start(
      chunks(
        { data: { product: { id: '1' } }, hasNext: true },
        {
          incremental: [
            {
              path: ['product'],
              data: { description: 'later' },
            },
          ],
          hasNext: false,
        },
      ),
    );

    await expect(pending).resolves.toBe('later');
    expect(parent['description']).toBe('later');
  });

  it('merges deferred fields into existing nested list items', async () => {
    // transformDeferredChunks rebuilds path ['box','items',1] into a tree and
    // re-emits a full-field data update; mergeInto must descend into arrays.
    const receiver = new IncrementalReceiver({
      fieldName: 'box',
    } as DelegationContext<any>);
    const item0: Record<string, any> = { id: '1' };
    const item1: Record<string, any> = { id: '2' };
    const item2: Record<string, any> = { id: '3' };
    const box: Record<string, any> = {
      items: [item0, item1, item2],
    };
    receiver.attachTo(box);

    const pending = [
      receiver.requestField(item0, 'slowField'),
      receiver.requestField(item1, 'slowField'),
      receiver.requestField(item2, 'slowField'),
    ];

    // Sparse / index-keyed list tree as produced by transformDeferredChunks
    // when rewriting patches at path ['box','items',i].
    receiver.handleChunk({
      data: {
        box: {
          items: {
            0: { slowField: 'slow-1' },
            1: { slowField: 'slow-2' },
            2: { slowField: 'slow-3' },
          },
        },
      },
      hasNext: false,
    });
    receiver.finish();

    await expect(Promise.all(pending)).resolves.toEqual([
      'slow-1',
      'slow-2',
      'slow-3',
    ]);
    expect(item0['slowField']).toBe('slow-1');
    expect(item1['slowField']).toBe('slow-2');
    expect(item2['slowField']).toBe('slow-3');
  });

  it('merges deferred fields into nested list-of-lists items', async () => {
    const receiver = new IncrementalReceiver({
      fieldName: 'matrix',
    } as DelegationContext<any>);
    const cell00: Record<string, any> = { id: '0-0' };
    const cell01: Record<string, any> = { id: '0-1' };
    const cell10: Record<string, any> = { id: '1-0' };
    const root: Record<string, any> = {
      rows: [[cell00, cell01], [cell10]],
    };
    receiver.attachTo(root);

    const pending = [
      receiver.requestField(cell00, 'label'),
      receiver.requestField(cell01, 'label'),
      receiver.requestField(cell10, 'label'),
    ];

    receiver.handleChunk({
      data: {
        matrix: {
          rows: {
            0: {
              0: { label: 'a' },
              1: { label: 'b' },
            },
            1: {
              0: { label: 'c' },
            },
          },
        },
      },
      hasNext: false,
    });
    receiver.finish();

    await expect(Promise.all(pending)).resolves.toEqual(['a', 'b', 'c']);
    expect(cell00['label']).toBe('a');
    expect(cell01['label']).toBe('b');
    expect(cell10['label']).toBe('c');
  });

  it('keeps consuming sibling list patches while hasNext is still true', async () => {
    // If a multi-patch chunk is re-emitted with hasNext:false on every part,
    // consume stops after the first and later list items stay null.
    const receiver = new IncrementalReceiver({
      fieldName: 'items',
    } as DelegationContext<any>);
    const items = [
      { id: '1' } as Record<string, any>,
      { id: '2' } as Record<string, any>,
      { id: '3' } as Record<string, any>,
    ];
    // Root is the list itself (same shape as a fieldName:'items' delegation).
    receiver.attachTo(items as any);

    const pending = items.map((item) =>
      receiver.requestField(item, 'slowField'),
    );

    receiver.start(
      chunks(
        {
          data: { items: { 0: { slowField: 'slow-1' } } },
          hasNext: true,
        },
        {
          data: { items: { 1: { slowField: 'slow-2' } } },
          hasNext: true,
        },
        {
          data: { items: { 2: { slowField: 'slow-3' } } },
          hasNext: false,
        },
      ),
    );

    await expect(Promise.all(pending)).resolves.toEqual([
      'slow-1',
      'slow-2',
      'slow-3',
    ]);
  });
});
