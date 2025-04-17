import { expect, it, vi } from 'vitest';
import { Logger, LoggerOptions } from '../src/Logger';
import { MemoryLogWriter } from '../src/writers';

function createTLogger(opts?: Partial<LoggerOptions>) {
  const writer = new MemoryLogWriter();
  return [
    new Logger({ ...opts, writers: opts?.writers ? opts.writers : [writer] }),
    writer,
  ] as const;
}

it.skipIf(
  // skip on bun because bun serialises errors differently from node (failing the snapshot)
  globalThis.Bun,
)('should write logs with levels, message and attributes', () => {
  const [log, writter] = createTLogger();

  const err = new Error('Woah!');
  err.stack = '<stack>';

  log.log('info');
  log.log('info', { hello: 'world', err }, 'Hello, world!');
  log.log('info', '2nd Hello, world!');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
      },
      {
        "attrs": {
          "err": {
            "class": "Error",
            "message": "Woah!",
            "name": "Error",
            "stack": "<stack>",
          },
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

  log = log.child('prefix ');

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

  log = log.child({ par: 'ent' }, 'prefix ');

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

it('should have child inherit parent log level', () => {
  let [log, writter] = createTLogger({ level: 'warn' });

  log = log.child({ par: 'ent' });

  log.debug('no hello');
  log.info('still no hello');
  log.warn('hello');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "par": "ent",
        },
        "level": "warn",
        "msg": "hello",
      },
    ]
  `);
});

it('should include attributes and prefix in nested child loggers', () => {
  let [log, writter] = createTLogger();

  log = log.child({ par: 'ent' }, 'prefix ');
  log = log.child({ par2: 'ent2' }, 'prefix2 ');

  log.info('hello');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "par": "ent",
          "par2": "ent2",
        },
        "level": "info",
        "msg": "prefix prefix2 hello",
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

it('should log array attributes with object child attributes', () => {
  let [log, writer] = createTLogger();

  log = log.child({ hello: 'world' });
  log.info(['hello', 'world']);

  // TODO: should it be logged like this? maybe place the child attrs in the array as first child?
  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "0": "hello",
          "1": "world",
          "hello": "world",
        },
        "level": "info",
      },
    ]
  `);
});

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

it.skipIf(
  // skip on bun because bun serialises errors differently from node (failing the snapshot)
  globalThis.Bun,
)('should write logs with unexpected attributes', () => {
  const [log, writer] = createTLogger();

  const err = new Error('Woah!');
  err.stack = '<stack>';

  log.info(err);

  log.info([err, { denis: 'badurina' }, ['hello'], 'world']);

  class MyClass {
    constructor(public someprop: string) {}
    get getsomeprop() {
      return this.someprop;
    }
  }
  log.info(new MyClass('hey'));

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "class": "Error",
          "message": "Woah!",
          "name": "Error",
          "stack": "<stack>",
        },
        "level": "info",
      },
      {
        "attrs": [
          {
            "class": "Error",
            "message": "Woah!",
            "name": "Error",
            "stack": "<stack>",
          },
          {
            "denis": "badurina",
          },
          [
            "hello",
          ],
          "world",
        ],
        "level": "info",
      },
      {
        "attrs": {
          "someprop": "hey",
        },
        "level": "info",
      },
    ]
  `);
});

it.todo('should serialise aggregate errors');

it.todo('should serialise error causes');

it.todo('should serialise using the toJSON method');

it('should change log level', () => {
  const [log, writer] = createTLogger();

  log.info('hello');
  log.setLevel('warn');
  log.info('no hello');
  log.warn('yes hello');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "hello",
      },
      {
        "level": "warn",
        "msg": "yes hello",
      },
    ]
  `);
});

it('should change root log level and propagate to child loggers', () => {
  const [rootLog, writer] = createTLogger();

  const childLog = rootLog.child('sub ');

  childLog.info('hello');
  rootLog.setLevel('warn');
  childLog.info('no hello');
  childLog.warn('yes hello');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "sub hello",
      },
      {
        "level": "warn",
        "msg": "sub yes hello",
      },
    ]
  `);
});

it('should change child log level only on child', () => {
  const [rootLog, writer] = createTLogger();

  const childLog = rootLog.child('sub ');

  childLog.setLevel('warn');
  rootLog.info('yes hello'); // should still log because root didnt change
  childLog.info('no hello');
  childLog.warn('yes hello');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "yes hello",
      },
      {
        "level": "warn",
        "msg": "sub yes hello",
      },
    ]
  `);
});
