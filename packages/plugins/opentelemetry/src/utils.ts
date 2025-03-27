import { context } from '@opentelemetry/api';
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
