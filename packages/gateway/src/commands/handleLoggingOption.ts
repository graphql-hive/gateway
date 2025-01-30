import { Logger } from '@graphql-mesh/types';
import { CLIContext, DefaultLogger, LogLevel } from '..';

export function handleLoggingConfig(
  loggingConfig: boolean | Logger | LogLevel | undefined,
  ctx: CLIContext,
) {
  if (typeof loggingConfig === 'object') {
    ctx.log = loggingConfig;
  } else if (typeof loggingConfig === 'boolean') {
    if (!loggingConfig) {
      if (ctx.log instanceof DefaultLogger) {
        ctx.log.logLevel = LogLevel.silent;
      } else {
        ctx.log = new DefaultLogger(ctx.log.name, LogLevel.silent);
      }
    }
  } else if (typeof loggingConfig === 'number') {
    if (ctx.log instanceof DefaultLogger) {
      ctx.log.logLevel = loggingConfig;
    } else {
      ctx.log = new DefaultLogger(ctx.log.name, loggingConfig);
    }
  }
}
