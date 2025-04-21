import type { BaseLogger as PinoLogger } from 'pino';
import { LogLevel } from '../logger';
import { Attributes } from '../utils';
import { LogWriter } from './common';

export class PinoLogWriter implements LogWriter {
  #pinoLogger: PinoLogger;
  constructor(pinoLogger: PinoLogger) {
    this.#pinoLogger = pinoLogger;
  }
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    this.#pinoLogger[level](attrs, msg || undefined);
  }
}
