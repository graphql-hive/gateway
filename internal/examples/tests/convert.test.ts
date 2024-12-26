import dedent from 'dedent';
import { expect, it } from 'vitest';
import { PortForService, transformServicePorts } from '../src/convert';

it.each([
  {
    name: 'declaring opts variable',
    source: dedent`
    import { Opts } from '@internal/testing';
    const opts = Opts();
    const port = opts.getServicePort('foo');
    `,
    auto: {
      result: {
        source: dedent`
        const port = 4001;
        `,
        portForService: {
          foo: 4001,
        } satisfies PortForService,
      },
    },
    manual: {
      portForService: {
        foo: 5001,
      } satisfies PortForService,
      result: {
        source: dedent`
        const port = 5001;
        `,
      },
    },
  },
  {
    name: 'using Opts() directly',
    source: dedent`
    import { Opts } from '@internal/testing';
    const port = Opts().getServicePort('foo');
    `,
    auto: {
      result: {
        source: dedent`
        const port = 4001;
        `,
        portForService: {
          foo: 4001,
        } satisfies PortForService,
      },
    },
    manual: {
      portForService: {
        foo: 7001,
      } satisfies PortForService,
      result: {
        source: dedent`
        const port = 7001;
        `,
      },
    },
  },
])('should transform service ports $name', ({ source, auto, manual }) => {
  // auto
  const actualAutoResult = transformServicePorts(source);
  expect(actualAutoResult).toEqual(auto.result);

  // manual
  const actualManualResult = transformServicePorts(
    source,
    manual.portForService,
  );
  expect(actualManualResult).toEqual(manual.result);
});
