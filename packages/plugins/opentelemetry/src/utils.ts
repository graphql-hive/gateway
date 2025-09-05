import { LogLevel } from '@graphql-hive/logger';
import { context, diag, DiagLogLevel } from '@opentelemetry/api';
import { getEnvStr } from '~internal/env';

export async function tryContextManagerSetup(
  useContextManager: true | undefined,
): Promise<boolean> {
  if (await isContextManagerCompatibleWithAsync()) {
    return true;
  }

  if (useContextManager) {
    throw new Error(
      '[OTEL] A Context Manager is already registered, but is not compatible with async calls.' +
        ' Please use another context manager, such as `AsyncLocalStorageContextManager`.',
    );
  }

  return true;
}

export function isContextManagerCompatibleWithAsync(): Promise<boolean> {
  const symbol = Symbol();
  const root = context.active();
  return context.with(root.setValue(symbol, true), () => {
    return new Promise<boolean>((resolve) => {
      // Use timeout to ensure that we yield to the event loop.
      // Some runtimes are optimized and doesn't yield for straight forward async functions
      // without actual async work.
      setTimeout(() => {
        resolve((context.active().getValue(symbol) as boolean) || false);
      });
    });
  });
}

const logLevelMap: Record<string, [DiagLogLevel, LogLevel | null]> = {
  ALL: [DiagLogLevel.ALL, 'trace'],
  VERBOSE: [DiagLogLevel.VERBOSE, 'trace'],
  DEBUG: [DiagLogLevel.DEBUG, 'debug'],
  INFO: [DiagLogLevel.INFO, 'info'],
  WARN: [DiagLogLevel.WARN, 'warn'],
  ERROR: [DiagLogLevel.ERROR, 'error'],
  NONE: [DiagLogLevel.NONE, null],
};

export function diagLogLevelFromEnv() {
  const value = getEnvStr('OTEL_LOG_LEVEL');

  if (value == null) {
    return undefined;
  }

  const resolvedLogLevel = logLevelMap[value.toUpperCase()];
  if (resolvedLogLevel == null) {
    diag.warn(
      `Unknown log level "${value}", expected one of ${Object.keys(logLevelMap)}, using default`,
    );
    return logLevelMap['INFO'];
  }
  return resolvedLogLevel;
}
