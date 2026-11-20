import { jsonStringify, Logger } from '@graphql-hive/logger';
import { test } from 'vitest';

const voidlog = new Logger({
  writers: [
    {
      write() {
        // void
      },
    },
  ],
});

test.for([
  { name: 'string' as const, value: 'hello' },
  { name: 'integer' as const, value: 7 },
  { name: 'float' as const, value: 7.77 },
  { name: 'object' as const, value: { hello: 'world' } },
])('log formatting of $name', async ({ name, value }, { bench }) => {
  // we switch outside of the bench to avoid the overhead of the switch
  const benches = [];
  switch (name) {
    case 'string':
      benches.push(
        bench('template literals', () => {
          voidlog.info(`hi there ${value}`);
        }),
      );
      benches.push(
        bench('interpolation', () => {
          voidlog.info('hi there %s', value);
        }),
      );
      break;
    case 'integer':
      benches.push(
        bench('template literals', () => {
          voidlog.info(`hi there ${value}`);
        }),
      );
      benches.push(
        bench('interpolation', () => {
          voidlog.info('hi there %i', value);
        }),
      );
      break;
    case 'float':
      benches.push(
        bench('template literals', () => {
          voidlog.info(`hi there ${value}`);
        }),
      );
      benches.push(
        bench('interpolation', () => {
          voidlog.info('hi there %d', value);
        }),
      );
      break;
    case 'object':
      benches.push(
        bench('template literals native stringify', () => {
          voidlog.info(`hi there ${JSON.stringify(value)}`);
        }),
      );
      benches.push(
        bench('template literals logger stringify', () => {
          voidlog.info(`hi there ${jsonStringify(value)}`);
        }),
      );
      benches.push(
        bench('interpolation', () => {
          voidlog.info('hi there %o', value);
        }),
      );
      break;
  }
  await bench.compare(...benches);
});
