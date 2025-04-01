import { context, TextMapPropagator } from '@opentelemetry/api';
import { CompositePropagator } from '@opentelemetry/core';
import { fakePromise } from '@whatwg-node/promise-helpers';
import { getContextManager } from './context';

export async function tryContextManagerSetup(
  useContextManager: true | undefined,
): Promise<boolean> {
  if (await isContextManagerCompatibleWithAsync()) {
    return true;
  }

  const contextManager = await getContextManager(useContextManager);

  if (!contextManager) {
    return false;
  }

  if (!context.setGlobalContextManager(contextManager)) {
    if (useContextManager) {
      throw new Error(
        '[OTEL] A Context Manager is already registered, but is not compatible with async calls.' +
          ' Please use another context manager, such as `AsyncLocalStorageContextManager`.',
      );
    }
  }

  return true;
}

export function isContextManagerCompatibleWithAsync(): Promise<boolean> {
  const symbol = Symbol();
  const root = context.active();
  return context.with(root.setValue(symbol, true), async () => {
    return (context.active().getValue(symbol) as boolean) || false;
  });
}

export function getPropagator(
  propagator?: boolean | 'default' | 'b3' | 'jaeger' | TextMapPropagator,
): Promise<TextMapPropagator | undefined | null> {
  if (
    propagator === undefined ||
    propagator === 'default' ||
    propagator === true
  ) {
    return fakePromise(undefined);
  }

  if (propagator === null || propagator === false) {
    return fakePromise(null);
  }

  if (propagator === 'b3') {
    return import('@opentelemetry/propagator-b3').then(
      ({ B3Propagator, B3InjectEncoding }) =>
        new CompositePropagator({
          propagators: [
            new B3Propagator(),
            new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
          ],
        }),
    );
  }

  if (propagator === 'jaeger') {
    return import('@opentelemetry/propagator-jaeger').then(
      ({ JaegerPropagator }) => new JaegerPropagator(),
    );
  }

  return fakePromise(propagator);
}
