import { setTimeout } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { Logger, LoggerOptions } from '../src/Logger';
import { MemoryLogWriter } from '../src/writers';
import { stableError } from './utils';

function createTLogger(opts?: Partial<LoggerOptions>) {
  const writer = new MemoryLogWriter();
  return [
    new Logger({ ...opts, writers: opts?.writers ? opts.writers : [writer] }),
    writer,
  ] as const;
}

it('should write logs with levels, message and attributes', () => {
  const [log, writter] = createTLogger();

  const err = stableError(new Error('Woah!'));

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

it('should unwrap lazy attribute values', () => {
  const [log, writter] = createTLogger();

  log.info(
    () => ({
      every: 'thing',
      nested: {
        lazy: () => 'nested lazy not unwrapped',
      },
    }),
    'hello',
  );

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "every": "thing",
          "nested": {
            "lazy": "[Function: lazy]",
          },
        },
        "level": "info",
        "msg": "hello",
      },
    ]
  `);
});

it('should not log lazy attributes returning nothing', () => {
  const [log, writter] = createTLogger();

  log.info(() => undefined, 'hello');
  log.info(() => null, 'wor');
  log.info(() => void 0, 'ld');

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "hello",
      },
      {
        "level": "info",
        "msg": "wor",
      },
      {
        "level": "info",
        "msg": "ld",
      },
    ]
  `);
});

it('should not unwrap lazy attribute values', () => {
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

  expect(writter.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "arr": [
            "[Function: (anonymous)]",
            "1",
          ],
          "lazy": "[Function: lazy]",
          "nested": {
            "lazy": "[Function: lazy]",
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
  log.debug(lazy, 'hello');

  expect(lazy).not.toHaveBeenCalled();
});

it('should wait for async writers on flush', async () => {
  const logs: any[] = [];
  const log = new Logger({
    writers: [
      {
        async write(level, attrs, msg) {
          await setTimeout(10);
          logs.push({ level, attrs, msg });
        },
      },
    ],
  });

  log.info('hello');
  log.info('world');

  // not flushed yet
  expect(logs).toMatchInlineSnapshot(`[]`);

  await log.flush();

  // flushed
  expect(logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": undefined,
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": undefined,
        "level": "info",
        "msg": "world",
      },
    ]
  `);
});

it('should handle async write errors on flush', async () => {
  let i = 0;
  const log = new Logger({
    writers: [
      {
        async write() {
          i++;
          throw new Error('Write failed! #' + i);
        },
      },
    ],
  });

  // no fail
  log.info('hello');
  log.info('world');

  try {
    await log.flush();
    throw new Error('should not have reached here');
  } catch (e) {
    expect(e).toMatchInlineSnapshot(
      `[AggregateError: Failed to flush 2 writes]`,
    );
    expect((e as AggregateError).errors).toMatchInlineSnapshot(`
      [
        [Error: Write failed! #1],
        [Error: Write failed! #2],
      ]
    `);
  }
});

it('should wait for async writers on async dispose', async () => {
  const logs: any[] = [];

  {
    await using log = new Logger({
      writers: [
        {
          async write(level, attrs, msg) {
            await setTimeout(10);
            logs.push({ level, attrs, msg });
          },
        },
      ],
    });

    log.info('hello');
    log.info('world');

    // not flushed yet
    expect(logs).toMatchInlineSnapshot(`[]`);
  }

  // flushed because scope ended and async dispose was called
  expect(logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": undefined,
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": undefined,
        "level": "info",
        "msg": "world",
      },
    ]
  `);
});

it('should log array attributes with object child attributes', () => {
  let [log, writer] = createTLogger();

  log = log.child({ hello: 'world' });
  log.info(['hello', 'world']);

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": [
          {
            "hello": "world",
          },
          "hello",
          "world",
        ],
        "level": "info",
      },
    ]
  `);
});

it('should log array child attributes with object attributes', () => {
  let [log, writer] = createTLogger();

  log = log.child(['hello', 'world']);
  log.info({ hello: 'world' });

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": [
          "hello",
          "world",
          {
            "hello": "world",
          },
        ],
        "level": "info",
      },
    ]
  `);
});

it('should log array child attributes with array attributes', () => {
  let [log, writer] = createTLogger();

  log = log.child(['hello', 'world']);
  log.info(['more', 'life']);

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": [
          "hello",
          "world",
          "more",
          "life",
        ],
        "level": "info",
      },
    ]
  `);
});

it('should format string', () => {
  const [log, writer] = createTLogger();

  log.info('%o hello %s', { worldly: 1 }, 'world');
  log.info({ these: { are: 'attrs' } }, '%o hello %s', { worldly: 1 }, 'world');
  log.info('hello %s %j %d %o', 'world', { obj: true }, 4, { another: 'obj' });

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
      {
        "level": "info",
        "msg": "hello world {"obj":true} 4 {"another":"obj"}",
      },
    ]
  `);
});

it('should write logs with unexpected attributes', () => {
  const [log, writer] = createTLogger();

  const err = stableError(new Error('Woah!'));

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
          "class": "MyClass",
          "getsomeprop": "hey",
          "someprop": "hey",
        },
        "level": "info",
      },
    ]
  `);
});

it('should serialise using the toJSON method', () => {
  const [log, writer] = createTLogger();

  class ToJSON {
    toJSON() {
      return { hello: 'world' };
    }
  }

  log.info(new ToJSON(), 'hello');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "hello": "world",
        },
        "level": "info",
        "msg": "hello",
      },
    ]
  `);
});

it('should serialise error causes', () => {
  const [log, writer] = createTLogger();

  const cause = stableError(new Error('Cause'));

  const err = stableError(new Error('Woah!', { cause }));

  log.info(err, 'hello');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "cause": {
            "class": "Error",
            "message": "Cause",
            "name": "Error",
            "stack": "<stack>",
          },
          "class": "Error",
          "message": "Woah!",
          "name": "Error",
          "stack": "<stack>",
        },
        "level": "info",
        "msg": "hello",
      },
    ]
  `);
});

it('should gracefully handle Object.create(null)', () => {
  const [log, writer] = createTLogger();

  class NullConst {
    constructor() {
      return Object.create(null);
    }
  }
  class NullProp {
    someprop = Object.create(null);
  }

  log.info({ class: new NullConst() }, 'hello');
  log.info(new NullProp(), 'world');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "class": {},
        },
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": {
          "class": "NullProp",
          "someprop": {},
        },
        "level": "info",
        "msg": "world",
      },
    ]
  `);
});

it('should handle circular references', () => {
  const [log, writer] = createTLogger();

  const obj = { circ: null as any };
  const circ = {
    hello: 'world',
    obj,
  };
  obj.circ = circ;

  log.info(circ, 'circular');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "hello": "world",
          "obj": {
            "circ": {
              "hello": "world",
              "obj": "[Circular]",
            },
          },
        },
        "level": "info",
        "msg": "circular",
      },
    ]
  `);
});

it('should serialise aggregate errors', () => {
  const [log, writer] = createTLogger();

  const err1 = stableError(new Error('Woah!'));

  const err2 = stableError(new Error('Woah2!'));

  const aggErr = stableError(
    new AggregateError([err1, err2], 'Woah Aggregate!'),
  );

  log.info(aggErr, 'aggregate');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "attrs": {
          "class": "AggregateError",
          "errors": [
            {
              "class": "Error",
              "message": "Woah!",
              "name": "Error",
              "stack": "<stack>",
            },
            {
              "class": "Error",
              "message": "Woah2!",
              "name": "Error",
              "stack": "<stack>",
            },
          ],
          "message": "Woah Aggregate!",
          "name": "AggregateError",
          "stack": "<stack>",
        },
        "level": "info",
        "msg": "aggregate",
      },
    ]
  `);
});

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
