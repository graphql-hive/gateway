import { setTimeout } from 'timers/promises';
import { ReadableStream, Response, TextEncoder } from '@whatwg-node/fetch';
import { describe, expect, it } from 'vitest';
import { handleEventStreamResponse } from '../src/handleEventStreamResponse.js';

describe('handleEventStreamResponse', () => {
  const encoder = new TextEncoder();
  it('should handle an event with data', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: complete\n'));
        controller.enqueue(encoder.encode('data: { "foo": "bar" }\n'));
        controller.enqueue(encoder.encode('\n'));
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();
    const { value } = await iterator.next();

    expect(value).toMatchObject({
      foo: 'bar',
    });
  });

  it('should ignore server pings', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(':\n\n'));
        controller.enqueue(encoder.encode('event: next\n'));
        controller.enqueue(encoder.encode('data: { "foo": "bar" }\n\n'));
      },
    });
    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();
    const iteratorResult = await iterator.next();

    expect(iteratorResult).toMatchObject({
      done: false,
      value: {
        foo: 'bar',
      },
    });
  });

  it('should handle an event without spaces', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event:complete\n'));
        controller.enqueue(encoder.encode('data:{"foo":"bar"}\n'));
        controller.enqueue(encoder.encode('\n'));
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      done: false,
      value: {
        foo: 'bar',
      },
    });
  });

  it('should handle a chunked event with data', async () => {
    let currChunk = 0;
    const chunks = [
      'event: next\n',
      'data: { "foo":',
      '"bar" }\n\n',
      'event: next',
      '\ndata: { "foo": "baz" }\n',
      '\nevent: next\ndata: { "foo": "',
      'bay"',
      ' }\n',
      '\n',
    ];

    const readableStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const chunk = chunks[currChunk++];
        if (chunk) {
          await setTimeout(0); // stream chunk after one tick
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.close();
        }
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      done: false,
      value: {
        foo: 'bar',
      },
    });
    expect(await iterator.next()).toEqual({
      done: false,
      value: {
        foo: 'baz',
      },
    });
    expect(await iterator.next()).toEqual({
      done: false,
      value: {
        foo: 'bay',
      },
    });
    expect(await iterator.next()).toEqual({
      done: true,
      value: undefined,
    });
  });

  it.skipIf(
    // Bun (and native Node) follow WHATWG: stream.cancel() throws while a reader
    // holds the lock. This test cancels the stream from outside after
    // handleEventStreamResponse already called getReader(), which only works on
    // the @whatwg-node ponyfill used under Vitest/Node. reader.cancel() would be
    // valid, but that reader lives inside the handler.
    globalThis.Bun,
  )('should gracefully report stream cancel with aborted signal', async () => {
    const ctrl = new AbortController();
    const readableStream = new ReadableStream<Uint8Array>({
      start() {
        // dont enqueue anything, to hang on iterator.next()
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(
      response,
      undefined,
      ctrl.signal,
    );
    const iterator = asyncIterable[Symbol.asyncIterator]();

    queueMicrotask(() => {
      ctrl.abort(); // we abort
      readableStream.cancel(); // then cancel
      // so that the error reported is the abort error
    });

    await expect(iterator.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": false,
        "value": {
          "errors": [
            [GraphQLError: This operation was aborted],
          ],
        },
      }
    `);

    await expect(iterator.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);

    await expect(iterator.return()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
  });

  // Cancel is consumer -> source teardown ("I'm done reading"), not a stream
  // failure. WHATWG/native settle pending reader.read() as { done: true }; the
  // reason is only passed to underlyingSource.cancel, never rejected on read().
  // Older @whatwg-node/node-fetch used readable.destroy(reason), so read()
  // rejected with Oops! / later Premature close and this used to expect a
  // GraphQLError - that was a ponyfill leak, not something the executor should
  // re-create. Client-visible cancellation stays on AbortSignal (test above);
  // real read()/network failures still become GraphQLError in the catch path.
  it.skipIf(
    // Same lock rule as the abort test above: Bun/native reject stream.cancel()
    // while locked; Vitest/Node ponyfill allows it. Not a Bun streams bug.
    globalThis.Bun,
  )('should complete cleanly when the stream is canceled', async () => {
    let cancelledWith: unknown;
    const readableStream = new ReadableStream<Uint8Array>({
      start() {
        // dont enqueue anything, to hang on iterator.next()
      },
      cancel(reason) {
        cancelledWith = reason;
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    const reason = new Error('Oops!');
    queueMicrotask(() => {
      readableStream.cancel(reason);
    });

    await expect(iterator.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
    expect(cancelledWith).toBe(reason);

    await expect(iterator.return()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
  });

  it('should handle multiple events in a single chunk', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `:

event: next
data: {"errors":[{"message":"Oops!","locations":[{"line":1,"column":14}],"path":["testErrorSubscription"],"extensions":{"code":"BAD_REQUEST"}}]}

event: complete
data:

`,
          ),
        );
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    await expect(iterator.next().then(({ value }) => value)).resolves.toEqual({
      errors: [
        expect.objectContaining({
          message: 'Oops!',
        }),
      ],
    });
    await expect(iterator.next()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
    await expect(iterator.return()).resolves.toMatchInlineSnapshot(`
      {
        "done": true,
        "value": undefined,
      }
    `);
  });

  it('should handle JSON values containing literal "data:" substrings', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: next\ndata: {"scopes":["file_content:read","file_metadata:read","projects:read"]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('event: complete\ndata:\n\n'));
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    const firstResult = await iterator.next();
    expect(firstResult.done).toBe(false);
    expect(firstResult.value).toEqual({
      scopes: ['file_content:read', 'file_metadata:read', 'projects:read'],
    });

    const secondResult = await iterator.next();
    expect(secondResult.done).toBe(true);
  });

  it('should cancel the response body when the subscription is disposed', async () => {
    // NOTE: this test deliberately uses the platform-native ReadableStream and
    // Response instead of the ones from '@whatwg-node/fetch'. The ponyfill
    // implements reader.releaseLock() and reader.cancel() identically (both
    // just call iterator.return() on the underlying node stream), so it cannot
    // observe the difference between the two. A native/undici body can, and
    // that is the implementation that leaks the connection when the body is
    // released instead of cancelled.
    const NativeReadableStream = globalThis.ReadableStream;
    const NativeResponse = globalThis.Response;

    let onCancel!: (reason?: unknown) => void;
    const cancelled = new Promise<'cancelled'>((resolve) => {
      onCancel = () => resolve('cancelled');
    });

    const body = new NativeReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: next\ndata: { "foo": "bar" }\n\n'),
        );
        // deliberately never closed: an open subscription with a live upstream
      },
      cancel(reason) {
        onCancel(reason);
      },
    });

    const response = new NativeResponse(body);
    const asyncIterable = handleEventStreamResponse(response as Response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      done: false,
      value: { foo: 'bar' },
    });

    // dispose the subscription. not awaited: pump() is parked on reader.read()
    // and only settles once the body is actually cancelled.
    const returned = iterator.return?.();

    // the timeout handle is always cleared: a pending timer left behind here
    // keeps the suite alive and trips `jest --detectLeaks` in the leaks job.
    let timeout: ReturnType<typeof globalThis.setTimeout>;
    const stillOpen = new Promise<'still open'>((resolve) => {
      timeout = globalThis.setTimeout(() => resolve('still open'), 1000);
    });
    try {
      await expect(Promise.race([cancelled, stillOpen])).resolves.toBe(
        'cancelled',
      );
    } finally {
      globalThis.clearTimeout(timeout!);
    }

    await returned;
  });

  it.todo('should consume messages on an immediately closed stream', () => {
    // the order of execution in handleEventStreamResponse should be:
    // 1. start waiting for `reader.read()`
    // 2. reader.closed is resolved
    // 3. `reader.read()` resolves with data that should be flushed before closing
  });
});
