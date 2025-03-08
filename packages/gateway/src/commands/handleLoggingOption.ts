import {
  handleLoggingConfig as handleLoggingConfigRuntime,
  LogLevel,
} from '@graphql-hive/gateway-runtime';
import { Logger } from '@graphql-mesh/types';
import { CLIContext } from '..';

export function handleLoggingConfig(
  loggingConfig: boolean | Logger | LogLevel | undefined,
  ctx: CLIContext,
) {
  ctx.log = handleLoggingConfigRuntime(loggingConfig, ctx.log);
}
