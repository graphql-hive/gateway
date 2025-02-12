import { JSONLogger } from '@graphql-hive/logger-json';
import { Logger } from '@graphql-mesh/types';
import { CLIContext, LogLevel } from '..';

export function handleLoggingConfig(
  loggingConfig: boolean | Logger | LogLevel | undefined,
  ctx: CLIContext,
) {
  if (typeof loggingConfig === 'object') {
    ctx.log = loggingConfig;
  } else if (typeof loggingConfig === 'boolean') {
    if (!loggingConfig) {
      if ('logLevel' in ctx.log) {
        ctx.log.logLevel = LogLevel.silent;
      } else {
        ctx.log = new JSONLogger({
          name: ctx.log.name,
          level: LogLevel.silent,
        });
      }
    }
  } else if (typeof loggingConfig === 'number') {
    if ('logLevel' in ctx.log) {
      ctx.log.logLevel = loggingConfig;
    } else {
      ctx.log = new JSONLogger({
        name: ctx.log.name,
        level: loggingConfig,
      });
    }
  }
}
