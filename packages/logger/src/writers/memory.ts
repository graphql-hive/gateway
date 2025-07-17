import { LogLevel } from '../logger';
import { Attributes } from '../utils';
import { LogWriter } from './common';

export class MemoryLogWriter implements LogWriter {
  public logs: { level: LogLevel; msg?: string; attrs?: unknown }[] = [];
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    this.logs.push({
      level,
      ...(msg ? { msg } : {}),
      ...(attrs ? { attrs } : {}),
    });
  }
}
