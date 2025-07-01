import { context, diag, DiagLogLevel } from '@opentelemetry/api';

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

export const getEnvVar =
  'process' in globalThis
    ? <T>(name: string, defaultValue: T): string | T =>
        process.env[name] || defaultValue
    : <T>(_name: string, defaultValue: T): string | T => defaultValue;

const logLevelMap: Record<string, DiagLogLevel> = {
  ALL: DiagLogLevel.ALL,
  VERBOSE: DiagLogLevel.VERBOSE,
  DEBUG: DiagLogLevel.DEBUG,
  INFO: DiagLogLevel.INFO,
  WARN: DiagLogLevel.WARN,
  ERROR: DiagLogLevel.ERROR,
  NONE: DiagLogLevel.NONE,
};

export function diagLogLevelFromEnv(): DiagLogLevel | undefined {
  const value = getEnvVar('OTEL_LOG_LEVEL', null);

  if (value == null) {
    return undefined;
  }

  const resolvedLogLevel = logLevelMap[value.toUpperCase()];
  if (resolvedLogLevel == null) {
    diag.warn(
      `Unknown log level "${value}", expected one of ${Object.keys(logLevelMap)}, using default`,
    );
    return DiagLogLevel.INFO;
  }
  return resolvedLogLevel;
}
