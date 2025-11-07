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
    // we skip bun because we cant cancel the stream while reading it (it's locked)
    // however, the same test from nodejs applies in bun
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

  it.skipIf(
    // we skip bun because we cant cancel the stream while reading it (it's locked)
    // however, the same test from nodejs applies in bun
    globalThis.Bun,
  )('should gracefully report stream errors', async () => {
    const readableStream = new ReadableStream<Uint8Array>({
      start() {
        // dont enqueue anything, to hang on iterator.next()
      },
    });

    const response = new Response(readableStream);
    const asyncIterable = handleEventStreamResponse(response);
    const iterator = asyncIterable[Symbol.asyncIterator]();

    const originalError = new Error('Oops!');
    queueMicrotask(() => {
      readableStream.cancel(originalError); // this will throw in reader.read()
    });

    const { value, done } = await iterator.next();
    expect(done).toBeFalsy();
    expect(value).toMatchInlineSnapshot(`
      {
        "errors": [
          [GraphQLError: Oops!],
        ],
      }
    `);
    expect(value.errors[0].originalError).toBe(originalError);

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

  it.todo('should consume messages on an immediately closed stream', () => {
    // the order of execution in handleEventStreamResponse should be:
    // 1. start waiting for `reader.read()`
    // 2. reader.closed is resolved
    // 3. `reader.read()` resolves with data that should be flushed before closing
  });
});
