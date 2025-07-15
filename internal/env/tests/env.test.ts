import { it } from 'vitest';
import { env } from '../src/index';

it.for([
  { variable: '1', truthy: true },
  { variable: 'true', truthy: true },
  { variable: 't', truthy: true },
  { variable: 'yes', truthy: true },
  { variable: 'y', truthy: true },
  { variable: 'on', truthy: true },
  { variable: 'enabled', truthy: true },
  { variable: 'YES', truthy: true },
  { variable: '    1', truthy: true },
  { variable: 'eNaBleD   ', truthy: true },
  { variable: '0', truthy: false },
  { variable: 'false', truthy: false },
  { variable: 'f', truthy: false },
  { variable: 'no', truthy: false },
  { variable: 'n', truthy: false },
  { variable: 'off', truthy: false },
  { variable: 'disabled', truthy: false },
  { variable: 'NO', truthy: false },
  { variable: '    0', truthy: false },
  { variable: 'dIsAbLeD   ', truthy: false },
  { variable: ' nOT   ', truthy: false },
  { variable: '  ', truthy: false },
  { variable: 'whatever', truthy: false },
])(
  'should parse truthy variable $variable as $truthy',
  ({ variable, truthy }, { expect }) => {
    expect(
      env('TEST_VAR', {
        globalThis: {
          TEST_VAR: variable,
        },
      }).truthy(),
    ).toBe(truthy);
  },
);
