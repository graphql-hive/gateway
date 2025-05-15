import {
  createGraphQLError,
  ExecutionResult,
  inspect,
} from '@graphql-tools/utils';
import { Repeater } from '@repeaterjs/repeater';
import { TextDecoder } from '@whatwg-node/fetch';
import { createResultForAbort } from './utils';

const DELIM = '\n\n';

export function isReadableStream(value: any): value is ReadableStream {
  return value && typeof value.getReader === 'function';
}

export function handleEventStreamResponse(
  response: Response,
  subscriptionCtrl?: AbortController,
  signal?: AbortSignal,
) {
  // node-fetch returns body as a promise so we need to resolve it
  const body = response.body;
  if (!isReadableStream(body)) {
    throw new Error(
      'Response body is expected to be a readable stream but got; ' +
        inspect(body),
    );
  }

  return new Repeater<ExecutionResult>((push, stop) => {
    const decoder = new TextDecoder();

    const reader = body.getReader();
    reader.closed.then(stop).catch(stop); // we dont use `finally` because we want to catch errors
    stop
      .then(() => {
        subscriptionCtrl?.abort();
        if (body.locked) {
          reader.releaseLock();
        }
      })
      .catch((err) => {
        reader.cancel(err);
      });

    let currChunk = '';
    async function pump() {
      if (signal?.aborted) {
        await push(createResultForAbort(signal.reason));
        return stop();
      }
      if (!body?.locked) {
        return stop();
      }
      let done: boolean, chunk: Uint8Array<ArrayBufferLike> | undefined;
      try {
        const result = await reader.read();
        done = result.done;
        chunk = result.value;
      } catch (err) {
        if (signal?.aborted) {
          await push(createResultForAbort(signal.reason));
          return stop();
        }
        const errErr = err instanceof Error ? err : new Error(String(err));
        await push({
          errors: [
            createGraphQLError(errErr.message, { originalError: errErr }),
          ],
        });
        return stop();
      }
      if (done) {
        return stop();
      }

      currChunk += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
      for (;;) {
        const delimIndex = currChunk.indexOf(DELIM);
        if (delimIndex === -1) {
          // incomplete message, wait for more chunks
          break;
        }

        const msg = currChunk.slice(0, delimIndex); // whole message
        currChunk = currChunk.slice(delimIndex + DELIM.length); // remainder

        // data
        const dataStr = msg.split('data:')[1]?.trim();
        if (dataStr) {
          const data = JSON.parse(dataStr);
          await push(data.payload || data);
        }

        // event
        // we split twice in order to extract the event name even in cases
        // where event has data too. like this: "event: complete\ndata:\n\n"
        const event = msg.split('event:')[1]?.trim().split('\n')[0]?.trim();
        if (event === 'complete') {
          // when we receive a "complete", we dont care about the data - we just stop
          return stop();
        }
      }

      return pump();
    }

    return pump();
  });
}
