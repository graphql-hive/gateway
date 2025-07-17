import { JSONLogger } from '@graphql-hive/logger-json';
import { Logger } from '@graphql-mesh/types';
import { DefaultLogger, LogLevel } from '@graphql-mesh/utils';
import { getEnvStr, getNodeEnv } from '~internal/env';

export function getDefaultLogger(opts?: { name?: string; level?: LogLevel }) {
  const logFormat = getEnvStr('LOG_FORMAT') || (globalThis as any).LOG_FORMAT;
  if (logFormat) {
    if (logFormat.toLowerCase() === 'json') {
      return new JSONLogger(opts);
    } else if (logFormat.toLowerCase() === 'pretty') {
      return new DefaultLogger(opts?.name, opts?.level);
    }
  }
  const nodeEnv = getNodeEnv();
  if (nodeEnv === 'production') {
    return new JSONLogger(opts);
  }
  return new DefaultLogger(opts?.name, opts?.level);
}

export function handleLoggingConfig(
  loggingConfig:
    | boolean
    | Logger
    | LogLevel
    | keyof typeof LogLevel
    | undefined,
  existingLogger?: Logger,
) {
  if (typeof loggingConfig === 'object') {
    return loggingConfig;
  }
  if (typeof loggingConfig === 'boolean') {
    if (!loggingConfig) {
      if (existingLogger && 'logLevel' in existingLogger) {
        existingLogger.logLevel = LogLevel.silent;
        return existingLogger;
      }
      return getDefaultLogger({
        name: existingLogger?.name,
        level: LogLevel.silent,
      });
    }
  }
  if (typeof loggingConfig === 'number') {
    if (existingLogger && 'logLevel' in existingLogger) {
      existingLogger.logLevel = loggingConfig;
      return existingLogger;
    }
    return getDefaultLogger({
      name: existingLogger?.name,
      level: loggingConfig,
    });
  }
  if (typeof loggingConfig === 'string') {
    if (existingLogger && 'logLevel' in existingLogger) {
      existingLogger.logLevel = LogLevel[loggingConfig];
      return existingLogger;
    }
    return getDefaultLogger({
      name: existingLogger?.name,
      level: LogLevel[loggingConfig],
    });
  }
  return existingLogger || getDefaultLogger();
}
