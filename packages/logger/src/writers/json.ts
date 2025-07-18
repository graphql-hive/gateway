import { getEnvBool } from '~internal/env';
import { LogLevel } from '../logger';
import { Attributes } from '../utils';
import { jsonStringify, LogWriter } from './common';

export class JSONLogWriter implements LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    console.log(
      jsonStringify(
        {
          ...attrs,
          level,
          ...(msg ? { msg } : {}),
          timestamp: new Date().toISOString(),
        },
        getEnvBool('LOG_JSON_PRETTY'),
      ),
    );
  }
}
