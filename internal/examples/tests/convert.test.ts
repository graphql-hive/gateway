import dedent from 'dedent';
import { expect, it } from 'vitest';
import { Eenv, parseTenv, transformServicePorts } from '../src/convert';

it.each([
  {
    name: 'destructured services',
    source: dedent`
    import { createTenv } from '@internal/e2e';
    const { gateway, service } = createTenv(__dirname);
    service('foo');
    service('bar');
    `,
    result: {
      gateway: { port: 4000 },
      services: {
        foo: {
          port: 4001,
        },
        bar: {
          port: 4002,
        },
      },
    } satisfies Eenv,
  },
  {
    name: 'example setup',
    source: dedent`
    import { createExampleSetup } from '@internal/e2e';
    const setup = createExampleSetup();
    `,
    result: {
      gateway: { port: 4000 },
      services: {
        accounts: {
          port: 4001,
        },
        inventory: {
          port: 4002,
        },
        products: {
          port: 4003,
        },
        reviews: {
          port: 4004,
        },
      },
    } satisfies Eenv,
  },
])('should detect tenv $name', ({ source, result }) => {
  const actualResult = parseTenv(source);
  expect(actualResult).toEqual(result);
});

it.each([
  {
    name: 'declaring opts variable',
    eenv: {
      gateway: { port: 4000 },
      services: { foo: { port: 5001 }, bar: { port: 6001 } },
    } as Eenv,
    source: dedent`
    import { Opts } from '@internal/testing';
    const opts = Opts();
    const portFoo = opts.getServicePort('foo');
    const portBar = opts.getServicePort('bar');
    `,
    result: dedent`
    const portFoo = 5001;
    const portBar = 6001;
    `,
  },
  {
    name: 'using Opts() directly',
    eenv: {
      gateway: { port: 4000 },
      services: { foo: { port: 6001 } },
    } as Eenv,
    source: dedent`
    import { Opts } from '@internal/testing';
    const port = Opts().getServicePort('foo');
    `,
    result: dedent`
    const port = 6001;
    `,
  },
])('should transform service ports $name', ({ eenv, source, result }) => {
  const actualResult = transformServicePorts(eenv, source);
  expect(actualResult).toEqual(result);
});
