import { JSONLogger } from '@graphql-hive/logger-json';
import { process } from '@graphql-mesh/cross-helpers';
import { DefaultLogger, LogLevel } from '@graphql-mesh/utils';

export function getDefaultLogger(opts?: { name?: string; level?: LogLevel }) {
  const logFormat = process.env['LOG_FORMAT'] || (globalThis as any).LOG_FORMAT;
  if (logFormat) {
    if (logFormat.toLowerCase() === 'json') {
      return new JSONLogger(opts);
    } else if (logFormat.toLowerCase() === 'pretty') {
      return new DefaultLogger(opts?.name, opts?.level);
    }
  }
  const nodeEnv = process.env['NODE_ENV'] || (globalThis as any).NODE_ENV;
  if (nodeEnv === 'production') {
    return new JSONLogger(opts);
  }
  return new DefaultLogger(opts?.name, opts?.level);
}
