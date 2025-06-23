import { jsonStringify, Logger } from '@graphql-hive/logger';
import { bench, describe } from 'vitest';

const voidlog = new Logger({
  writers: [
    {
      write() {
        // void
      },
    },
  ],
});

describe.each([
  { name: 'string' as const, value: 'hello' },
  { name: 'integer' as const, value: 7 },
  { name: 'float' as const, value: 7.77 },
  { name: 'object' as const, value: { hello: 'world' } },
])('log formatting of $name', ({ name, value }) => {
  // we switch outside of the bench to avoid the overhead of the switch
  switch (name) {
    case 'string':
      bench('template literals', () => {
        voidlog.info(`hi there ${value}`);
      });
      bench('interpolation', () => {
        voidlog.info('hi there %s', value);
      });
      break;
    case 'integer':
      bench('template literals', () => {
        voidlog.info(`hi there ${value}`);
      });
      bench('interpolation', () => {
        voidlog.info('hi there %i', value);
      });
      break;
    case 'float':
      bench('template literals', () => {
        voidlog.info(`hi there ${value}`);
      });
      bench('interpolation', () => {
        voidlog.info('hi there %d', value);
      });
      break;
    case 'object':
      bench('template literals native stringify', () => {
        voidlog.info(`hi there ${JSON.stringify(value)}`);
      });
      bench('template literals logger stringify', () => {
        voidlog.info(`hi there ${jsonStringify(value)}`);
      });
      bench('interpolation', () => {
        voidlog.info('hi there %o', value);
      });
      break;
  }
});
