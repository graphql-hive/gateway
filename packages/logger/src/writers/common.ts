import fastSafeStringify from 'fast-safe-stringify';
import { Attributes, LogLevel } from '../logger';

export function jsonStringify(val: unknown, pretty?: boolean): string {
  return fastSafeStringify(val, undefined, pretty ? 2 : undefined);
}

export interface LogWriter {
  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void | Promise<void>;
  flush?(): void | Promise<void>;
}
