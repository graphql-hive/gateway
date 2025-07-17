import type { Logger as WinstonLogger } from 'winston';
import { LogLevel } from '../logger';
import { Attributes } from '../utils';
import { LogWriter } from './common';

export class WinstonLogWriter implements LogWriter {
  #winstonLogger: WinstonLogger;
  constructor(winstonLogger: WinstonLogger) {
    this.#winstonLogger = winstonLogger;
  }
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    if (msg) {
      this.#winstonLogger[level === 'trace' ? 'verbose' : level](msg, attrs);
    } else {
      this.#winstonLogger[level === 'trace' ? 'verbose' : level](attrs);
    }
  }
}
