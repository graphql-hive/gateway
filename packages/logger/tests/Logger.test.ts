import { expect, it } from 'vitest';
import { Logger, LogLevel } from '../src/Logger';
import { LogWriter } from '../src/writers';

class TLogWriter implements LogWriter {
  public logs: { level: LogLevel; msg: string; attrs: unknown }[] = [];

  write(level: LogLevel, msg: string, attrs: Record<string, unknown>): void {
    this.logs.push({ level, msg, attrs });
  }

  flush(): void {
    // noop
  }
}

function createTLogger() {
  const writter = new TLogWriter();
  return [new Logger(writter), writter] as const;
}

it('should write logs with levels, message and attributes', () => {
  const [logger, writter] = createTLogger();
  logger.log(
    'info',
    { hello: 'world', err: new Error('Woah!') },
    'Hello, world!',
  );
  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "err": [Error: Woah!],
          "hello": "world",
        },
        "level": "info",
        "msg": "Hello, world!",
      },
    ]
  `);
});

it('should write logs with attributes in context', () => {
  const [logger, writter] = createTLogger();

  const ctx = {};
  logger.setAttrsInCtx(ctx, { hello: 'world' });

  logger.logCtx(ctx, 'info', { world: 'hello' }, 'Hello, world!');
  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "hello": "world",
          "world": "hello",
        },
        "level": "info",
        "msg": "Hello, world!",
      },
    ]
  `);
});
