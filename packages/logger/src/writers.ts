import { LogLevel } from './Logger';
import { Attributes, jsonStringify } from './utils';

export interface LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void | Promise<void>;
  flush(): void | Promise<void>;
}

export class ConsoleLogWriter implements LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void {
    switch (level) {
      // TODO: other levels
      default:
        // TODO: write log level and time
        console.log(
          msg,
          // we want to stringify because we want all properties be properly displayed
          attrs ? jsonStringify(attrs) : undefined,
        );
    }
  }
  flush() {
    // noop
  }
}
