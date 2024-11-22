import {
  AsyncDisposableStack,
  SuppressedError,
} from '@whatwg-node/disposablestack';
import { afterAll } from 'vitest';
import { trimError } from './trimError';

export let leftoverStack = new AsyncDisposableStack();

function handleSuppressedError(e: any) {
  let currErr = e;
  while (currErr instanceof SuppressedError) {
    if (currErr.error) {
      console.error(`Suppressed error`, trimError(currErr.error));
    }
    currErr = currErr.suppressed;
  }
  if (currErr) {
    console.error('Failed to dispose leftover stack', trimError(currErr));
  }
}

afterAll(async () => {
  try {
    await leftoverStack.disposeAsync();
  } catch (e) {
    handleSuppressedError(e);
  } finally {
    leftoverStack = new AsyncDisposableStack();
  }
});
