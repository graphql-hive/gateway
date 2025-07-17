import { Logger, LogLevel } from '@graphql-hive/logger';

export function createLoggerFromLogging(
  logging: boolean | Logger | LogLevel | undefined,
) {
  if (logging == null || typeof logging === 'boolean') {
    return new Logger({ level: logging === false ? false : 'info' });
  }
  if (typeof logging === 'string') {
    return new Logger({ level: logging });
  }
  return logging;
}
