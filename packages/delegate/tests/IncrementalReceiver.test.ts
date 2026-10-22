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
});
