import { LegacyLogger } from '@graphql-hive/logger';
import { expect, it } from 'vitest';
import { Logger, LoggerOptions } from '../src/Logger';
import { MemoryLogWriter } from '../src/writers';

function createTLogger(opts?: Partial<LoggerOptions>) {
  const writer = new MemoryLogWriter();
  return [
    LegacyLogger.from(
      new Logger({ ...opts, writers: opts?.writers ? opts.writers : [writer] }),
    ),
    writer,
  ] as const;
}

it('should correctly write legacy logger logs', () => {
  const [log, writer] = createTLogger();

  log.info('hello world');
  log.info({ hello: 'world' });
  log.info('hello', { wor: 'ld' });
  log.info('hello', [{ wor: 'ld' }]);
  log.info('hello', { w: 'o' }, { rl: 'd' });
  log.info('hello', 'world');

  log.child('child ').info('hello child');
  log.child({ chi: 'ld' }).info('hello chi ld');

  expect(writer.logs).toMatchInlineSnapshot(`
    [
      {
        "level": "info",
        "msg": "hello world",
      },
      {
        "attrs": {
          "hello": "world",
        },
        "level": "info",
      },
      {
        "attrs": [
          {
            "wor": "ld",
          },
        ],
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": [
          [
            {
              "wor": "ld",
            },
          ],
        ],
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": [
          {
            "w": "o",
          },
          {
            "rl": "d",
          },
        ],
        "level": "info",
        "msg": "hello",
      },
      {
        "attrs": [
          "world",
        ],
        "level": "info",
        "msg": "hello",
      },
      {
        "level": "info",
        "msg": "child hello child",
      },
      {
        "level": "info",
        "msg": "chi=ld hello chi ld",
      },
    ]
  `);
});
