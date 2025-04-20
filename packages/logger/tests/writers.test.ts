import { describe, expect, it } from 'vitest';
import { Logger } from '../src/Logger';
import { ConsoleLogWriter, ConsoleLogWriterOptions } from '../src/writers';
import { stableError } from './utils';

describe('ConsoleLogWriter', () => {
  function createTConsoleLogger(opts?: Partial<ConsoleLogWriterOptions>) {
    const logs: string[] = [];
    const writer = new ConsoleLogWriter({
      console: {
        debug: (...args: unknown[]) => {
          logs.push(args.join(' '));
        },
        info: (...args: unknown[]) => {
          logs.push(args.join(' '));
        },
        warn: (...args: unknown[]) => {
          logs.push(args.join(' '));
        },
        error: (...args: unknown[]) => {
          logs.push(args.join(' '));
        },
      },
      noTimestamp: true,
      noColor: true,
      ...opts,
    });
    return [new Logger({ level: 'trace', writers: [writer] }), logs] as const;
  }

  it('should pretty print the attributes', () => {
    const [log, logs] = createTConsoleLogger();

    log.trace({ a: 1, b: 2 }, 'obj');
    log.debug(['a', 'b', 'c'], 'arr');
    log.info({ a: { b: { c: { d: 1 } } } }, 'nested');
    log.warn([{ a: 1 }, { b: 2 }], 'arr objs');
    log.error(
      { str: 'a\nb\nc', err: stableError(new Error('woah!')) },
      'multlinestring',
    );

    log.info(
      {
        query: `
{
  hi(howMany: 1) {
    hello
    world
  }
}
`,
      },
      'graphql',
    );

    expect(logs).toMatchSnapshot();
  });

  it('should color levels and keys', () => {
    const [log, logs] = createTConsoleLogger({ noColor: false });

    log.trace({ hello: { dear: 'world', try: ['num', 1, 2] } }, 'hi');
    log.debug({ hello: { dear: 'world', try: ['num', 1, 2] } }, 'hi');
    log.info({ hello: { dear: 'world', try: ['num', 1, 2] } }, 'hi');
    log.warn({ hello: { dear: 'world', try: ['num', 1, 2] } }, 'hi');
    log.error({ hello: { dear: 'world', try: ['num', 1, 2] } }, 'hi');

    expect(logs).toMatchSnapshot();
  });
});
