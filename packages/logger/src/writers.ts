import { LogLevel } from './Logger';
import { Attributes, jsonStringify } from './utils';

export interface LogWriter {
  write(
    level: LogLevel,
    msg: string,
    attrs: Attributes | undefined,
  ): void | Promise<void>;
  flush(): void | Promise<void>;
}

export class ConsoleLogWriter implements LogWriter {
  write(level: LogLevel, msg: string, attrs: Attributes): void {
    switch (level) {
      // TODO: other levels
      default:
        console.log(msg, attrs ? jsonStringify(attrs) : undefined);
    }
  }
  flush() {
    // noop
  }
}
