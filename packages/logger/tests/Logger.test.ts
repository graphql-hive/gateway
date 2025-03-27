import { expect, it } from 'vitest';
import { Logger, LogLevel } from '../src/Logger';
import { LogWriter } from '../src/writers';

class TLogWriter implements LogWriter {
  public logs: { level: LogLevel; msg: string; attrs?: unknown }[] = [];

  write(level: LogLevel, msg: string, attrs: Record<string, any>): void {
    this.logs.push({ level, msg, ...(attrs ? { attrs } : {}) });
  }

  flush(): void {
    // noop
  }
}

function createTLogger() {
  const writer = new TLogWriter();
  return [new Logger({ writers: [writer] }), writer] as const;
}

it('should write logs with levels, message and attributes', () => {
  const [logger, writter] = createTLogger();

  logger.log(
    'info',
    { hello: 'world', err: new Error('Woah!') },
    'Hello, world!',
  );
  logger.log('info', '2nd Hello, world!');

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
      {
        "level": "info",
        "msg": "2nd Hello, world!",
      },
    ]
  `);
});

it('should write logs with attributes in context', () => {
  const [logger, writter] = createTLogger();

  const ctx = {};
  logger.setAttrsInCtx(ctx, { hello: 'world' });

  logger.logCtx('info', ctx, { world: 'hello' }, 'Hello, world!');
  logger.logCtx('info', ctx, '2nd Hello, world!');

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
      {
        "attrs": {
          "hello": "world",
        },
        "level": "info",
        "msg": "2nd Hello, world!",
      },
    ]
  `);
});
