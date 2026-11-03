import { setTimeout } from 'node:timers/promises';
import type { Executor } from '@graphql-tools/utils';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { buildSchema, parse } from 'graphql';
import { expect, it } from 'vitest';
import { getOnSubgraphExecute } from '../src/utils';

it('creates the transport executor once for concurrent first requests', async () => {
  let createdExecutors = 0;
  await using transportExecutorStack = new AsyncDisposableStack();
  const onSubgraphExecute = getOnSubgraphExecute({
    onSubgraphExecuteHooks: [],
    transportEntryMap: {
      upstream: { kind: 'test', subgraph: 'upstream' },
    },
    getSubgraphSchema: () =>
      buildSchema(/* GraphQL */ `
        type Query {
          hello: String
        }
      `),
    transportExecutorStack,
    // loading the transport is async, like the dynamic import of a transport package
    async transports() {
      await setTimeout(10);
      return {
        getSubgraphExecutor() {
          createdExecutors++;
          // static result is enough, only the executor creation count matters
          return (() => ({ data: { hello: 'world' } })) as Executor;
        },
      };
    },
    batch: false,
    instrumentation: () => undefined,
  });

  const document = parse(/* GraphQL */ `
    query {
      hello
    }
  `);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      onSubgraphExecute('upstream', { document }),
    ),
  );
  for (const res of results) {
    expect(res).toEqual({ data: { hello: 'world' } });
  }
  expect(createdExecutors).toBe(1);
});
