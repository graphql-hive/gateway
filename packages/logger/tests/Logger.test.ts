import { expect, it } from 'vitest';
import { Logger, LoggerOptions, LogLevel } from '../src/Logger';
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

function createTLogger(opts?: Partial<LoggerOptions>) {
  const writer = new TLogWriter();
  return [
    new Logger({ ...opts, writers: opts?.writers ? opts.writers : [writer] }),
    writer,
  ] as const;
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

it('should write logs only if level is higher than set', () => {
  const [log, writter] = createTLogger({
    level: 'info',
  });

  log.trace('Trace');
  log.debug('Debug');
  log.info('Info');
  log.warn('Warn');
  log.error('Error');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "Info",
      },
      {
        "level": "warn",
        "msg": "Warn",
      },
      {
        "level": "error",
        "msg": "Error",
      },
    ]
  `);
});
