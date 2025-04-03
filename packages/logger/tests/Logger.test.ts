import { expect, it, vi } from 'vitest';
import { Logger, LoggerOptions } from '../src/Logger';
import { MemoryLogWriter } from '../src/writers';

const log = new Logger();
log.info('Hello, world!');

function createTLogger(opts?: Partial<LoggerOptions>) {
  const writer = new MemoryLogWriter();
  return [
    new Logger({ ...opts, writers: opts?.writers ? opts.writers : [writer] }),
    writer,
  ] as const;
}

it('should write logs with levels, message and attributes', () => {
  const [log, writter] = createTLogger();

  log.log('info');
  log.log('info', { hello: 'world', err: new Error('Woah!') }, 'Hello, world!');
  log.log('info', '2nd Hello, world!');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
      },
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

it('should include attributes in child loggers', () => {
  let [log, writter] = createTLogger();

  log = log.child({ par: 'ent' });

  log.info('hello');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "par": "ent",
        },
        "level": "info",
        "msg": "hello",
      },
    ]
  `);
});

it('should include prefix in child loggers', () => {
  let [log, writter] = createTLogger();

  log = log.child('prefix');

  log.info('hello');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "prefix hello",
      },
    ]
  `);
});

it('should include attributes and prefix in child loggers', () => {
  let [log, writter] = createTLogger();

  log = log.child({ par: 'ent' }, 'prefix');

  log.info('hello');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "par": "ent",
        },
        "level": "info",
        "msg": "prefix hello",
      },
    ]
  `);
});

it('should unwrap lazy attributes', () => {
  const [log, writter] = createTLogger();

  log.info(
    {
      lazy: () => 'lazy',
      nested: {
        lazy: () => 'nested lazy',
      },
      arr: [() => '0', '1'],
    },
    'hello',
  );

  log.info(
    () => ({
      every: 'thing',
      nested: {
        lazy: () => 'nested lazy',
      },
    }),
    'hello',
  );

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "arr": [
            "0",
            "1",
          ],
          "lazy": "lazy",
          "nested": {
            "lazy": "nested lazy",
          },
        },
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": {
          "every": "thing",
          "nested": {
            "lazy": "nested lazy",
          },
        },
        "level": "info",
        "msg": "hello",
      },
    ]
  `);
});

it('should not unwrap lazy attributes if level is not to be logged', () => {
  const [log] = createTLogger({
    level: 'info',
  });

  const lazy = vi.fn(() => ({ la: 'zy' }));
  log.debug(
    {
      lazy,
      nested: {
        lazy,
      },
      arr: [lazy, '1'],
    },
    'hello',
  );

  log.debug(lazy, 'hello');

  expect(lazy).not.toHaveBeenCalled();
});

it.todo('should log to async writers');

it.todo('should wait for async writers on flush');

it('should format string', () => {
  const [log, writer] = createTLogger();

  log.info('%o hello %s', { worldly: 1 }, 'world');
  log.info({ these: { are: 'attrs' } }, '%o hello %s', { worldly: 1 }, 'world');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "{"worldly":1} hello world",
      },
      {
        "attrs": {
          "these": {
            "are": "attrs",
          },
        },
        "level": "info",
        "msg": "{"worldly":1} hello world",
      },
    ]
  `);
});
