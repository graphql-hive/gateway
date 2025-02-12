import { Logger } from '@graphql-mesh/types';
import { CLIContext, LogLevel } from '..';
import { getDefaultLogger } from '../../../runtime/src/getDefaultLogger';

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
        ctx.log = getDefaultLogger({
          name: ctx.log.name,
          level: LogLevel.silent,
        });
      }
    }
  } else if (typeof loggingConfig === 'number') {
    if ('logLevel' in ctx.log) {
      ctx.log.logLevel = loggingConfig;
    } else {
      ctx.log = getDefaultLogger({
        name: ctx.log.name,
        level: loggingConfig,
      });
    }
  }
}
