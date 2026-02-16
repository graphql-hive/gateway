import { createBatchingExecutor } from '@graphql-tools/batch-execute';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  createGraphQLError,
  ExecutionResult,
  Executor,
  MaybeAsyncIterable,
} from '@graphql-tools/utils';
import { OperationDefinitionNode, parse, print, validate } from 'graphql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('batch execution', () => {
  let executorCalls = 0;
  let executorDocument: string | undefined;
  let executorVariables: any | undefined;
  const extensions = { foo: 'bar' };

  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        field1: String
        field2: String
        field3(input: String): String
        boom(message: String): String
        boomWithPath(message: String, path: [String]): String
        extension: String
        widget: Widget
      }
      type Widget {
        name: String
      }
    `,
    resolvers: {
      Query: {
        field1: () => '1',
        field2: () => '2',
        field3: (_root, { input }) => String(input),
        boom: (_root, { message }) => new Error(message),
        boomWithPath: (_root, { message, path }) =>
          createGraphQLError(message, { path }),
        extension: () => createGraphQLError('boom', { extensions }),
        widget: () => ({ name: 'wingnut' }),
      },
    },
  });

  const exec: Executor = async ({ document, variables, signal }) => {
    executorCalls += 1;
    executorDocument = print(document);
    executorVariables = variables;
    const errors = validate(schema, document);
    if (errors.length > 0) {
      return { errors };
    }
    return normalizedExecutor({
      schema,
      document,
      variableValues: executorVariables,
      signal,
    });
  };

  const batchExecutor = createBatchingExecutor(exec);

  async function batchExec(request: Parameters<Executor>[0]) {
    return batchExecutor(request);
  }

  beforeEach(() => {
    executorCalls = 0;
    executorDocument = undefined;
    executorVariables = undefined;
  });

  function getRequestFields(): Array<string> {
    if (executorDocument != null) {
      const op = parse(executorDocument)
        .definitions[0] as OperationDefinitionNode;
      const names = op.selectionSet.selections.map((sel) =>
        'name' in sel ? sel.name.value : undefined,
      );
      return names.filter(Boolean) as Array<string>;
    }
    return [];
  }

  it('batchs multiple executions', async () => {
    const [first, second] = (await Promise.all([
      batchExec({ document: parse('{ field1 field2 }') }),
      batchExec({ document: parse('{ field2 field3(input: "3") }') }),
    ])) as ExecutionResult[];

    expect(first?.data).toEqual({ field1: '1', field2: '2' });
    expect(second?.data).toEqual({ field2: '2', field3: '3' });
    expect(executorCalls).toEqual(1);
    expect(getRequestFields()).toEqual([
      'field1',
      'field2',
      'field2',
      'field3',
    ]);
  });

  it('preserves root field aliases in the final result', async () => {
    const [first, second] = (await Promise.all([
      batchExec({ document: parse('{ a: field1 b: field2 }') }),
      batchExec({ document: parse('{ c: field2 d: field3(input: "3") }') }),
    ])) as ExecutionResult[];

    expect(first?.data).toEqual({ a: '1', b: '2' });
    expect(second?.data).toEqual({ c: '2', d: '3' });
    expect(executorCalls).toEqual(1);
    expect(getRequestFields()).toEqual([
      'field1',
      'field2',
      'field2',
      'field3',
    ]);
  });

  it('renames input variables', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse('query($a: String){ field3(input: $a) }'),
        variables: { a: '1' },
      }),
      batchExec({
        document: parse('query($a: String){ field3(input: $a) }'),
        variables: { a: '2' },
      }),
    ])) as ExecutionResult[];

    expect(first?.data).toEqual({ field3: '1' });
    expect(second?.data).toEqual({ field3: '2' });
    expect(executorVariables).toEqual({ _v0_a: '1', _v1_a: '2' });
    expect(executorCalls).toEqual(1);
  });

  it('renames input variable definitions even if no variables passed', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse('query($a: String = \"1\"){ field3(input: $a) }'),
      }),
      batchExec({
        document: parse('query($a: String = \"2\"){ field3(input: $a) }'),
      }),
    ])) as ExecutionResult[];

    expect(first?.data).toEqual({ field3: '1' });
    expect(second?.data).toEqual({ field3: '2' });
    expect(executorVariables).toEqual({});
    expect(executorCalls).toEqual(1);
  });

  it('renames fields within inline spreads', async () => {
    const [first, second] = (await Promise.all([
      batchExec({ document: parse('{ ...on Query { field1 } }') }),
      batchExec({ document: parse('{ ...on Query { field2 } }') }),
    ])) as ExecutionResult[];

    const squishedDoc = executorDocument?.replace(/\s+/g, ' ');
    expect(squishedDoc).toMatch('... on Query { _v0_field1: field1 }');
    expect(squishedDoc).toMatch('... on Query { _v1_field2: field2 }');
    expect(first?.data).toEqual({ field1: '1' });
    expect(second?.data).toEqual({ field2: '2' });
    expect(executorCalls).toEqual(1);
  });

  it('renames fragment definitions and spreads', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse('fragment A on Widget { name } { widget { ...A } }'),
      }),
      batchExec({
        document: parse('fragment A on Widget { name } { widget { ...A } }'),
      }),
    ])) as ExecutionResult[];

    const squishedDoc = executorDocument?.replace(/\s+/g, ' ');
    expect(squishedDoc).toMatch('_v0_widget: widget { ..._v0_A }');
    expect(squishedDoc).toMatch('_v1_widget: widget { ..._v1_A }');
    expect(squishedDoc).toMatch('fragment _v0_A on Widget');
    expect(squishedDoc).toMatch('fragment _v1_A on Widget');
    expect(first?.data).toEqual({ widget: { name: 'wingnut' } });
    expect(second?.data).toEqual({ widget: { name: 'wingnut' } });
    expect(executorCalls).toEqual(1);
  });

  it('removes expanded root fragment definitions', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse('fragment A on Query { field1 } { ...A }'),
      }),
      batchExec({
        document: parse('fragment A on Query { field2 } { ...A }'),
      }),
    ])) as ExecutionResult[];

    expect(first?.data).toEqual({ field1: '1' });
    expect(second?.data).toEqual({ field2: '2' });
    expect(executorCalls).toEqual(1);
  });

  it('preserves pathed errors in the final result', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse('{ first: boom(message: "first error") }'),
      }),
      batchExec({
        document: parse('{ second: boom(message: "second error") }'),
      }),
    ])) as ExecutionResult[];

    expect(first?.errors?.[0]?.message).toEqual('first error');
    expect(first?.errors?.[0]?.path).toEqual(['first']);
    expect(second?.errors?.[0]?.message).toEqual('second error');
    expect(second?.errors?.[0]?.path).toEqual(['second']);
    expect(executorCalls).toEqual(1);
  });

  it('returns request-level errors to all results', async () => {
    const [first, second] = (await Promise.all([
      batchExec({ document: parse('{ field1 field2 }') }),
      batchExec({ document: parse('{ notgonnawork }') }),
    ])) as ExecutionResult[];

    expect(first?.errors?.length).toEqual(1);
    expect(second?.errors?.length).toEqual(1);
    expect(first?.errors?.[0]?.message).toMatch(/notgonnawork/);
    expect(second?.errors?.[0]?.message).toMatch(/notgonnawork/);
    expect(executorCalls).toEqual(1);
  });

  it('pathed errors contain extensions', async () => {
    const [first] = (await Promise.all([
      batchExec({ document: parse('{ extension }') }),
    ])) as ExecutionResult[];

    expect(first?.errors?.length).toEqual(1);
    expect(first?.errors?.[0]?.message).toMatch(/boom/);
    expect(first?.errors?.[0]?.extensions).toEqual(extensions);
    expect(executorCalls).toEqual(1);
  });

  it('non pathed errors contain extensions', async () => {
    const errorExec: Executor = (): MaybeAsyncIterable<ExecutionResult> => {
      return { errors: [createGraphQLError('boom', { extensions })] };
    };
    const batchExec = createBatchingExecutor(errorExec);

    const [first] = (await Promise.all([
      batchExec({ document: parse('{ boom }') }),
    ])) as ExecutionResult[];

    expect(first?.errors?.length).toEqual(1);
    expect(first?.errors?.[0]?.message).toMatch(/boom/);
    expect(first?.errors?.[0]?.extensions).toEqual(extensions);
  });

  it('finds query field name in graphql error path', async () => {
    const [first, second] = (await Promise.all([
      batchExec({
        document: parse(
          '{ boomWithPath(message: "unexpected error", path: ["some-prefix", "_v0_boomWithPath", "foo"]) }',
        ),
      }),
      batchExec({
        document: parse(
          '{ boomWithPath(message: "another unexpected error", path: ["some", "other", "prefix", "_v1_boomWithPath", "bar"]) }',
        ),
      }),
    ])) as ExecutionResult[];

    expect(first?.errors?.[0]?.message).toEqual('unexpected error');
    expect(first?.errors?.[0]?.path).toEqual(['boomWithPath', 'foo']);
    expect(second?.errors?.[0]?.message).toEqual('another unexpected error');
    expect(second?.errors?.[0]?.path).toEqual(['boomWithPath', 'bar']);
    expect(executorCalls).toEqual(1);
  });

  it('handles unprefixed query name in graphql error path', async () => {
    const [first] = (await Promise.all([
      batchExec({
        document: parse('{ boomWithPath(message: "unexpected error") }'),
      }),
    ])) as ExecutionResult[];

    expect(first?.errors?.[0]?.message).toEqual('unexpected error');
    expect(first?.errors?.[0]?.path).toEqual(['boomWithPath']);
    expect(executorCalls).toEqual(1);
  });

  // https://github.com/ardatan/graphql-tools/issues/5905
  describe('robustness against Array.prototype modification', () => {
    beforeAll(() => {
      // eslint-disable-next-line no-extend-native
      // @ts-expect-error Array prototype modification
      Array.prototype['foo'] = 'bar';
    });

    afterAll(() => {
      // @ts-expect-error Array prototype modification
      delete Array.prototype['foo'];
    });

    it('multiple batch executions does not throw an error', async () => {
      const error = await Promise.all([
        batchExec({ document: parse('{ field1 field2 }') }),
        batchExec({ document: parse('{ field2 field3(input: "3") }') }),
      ])
        .then(() => undefined)
        .catch((e) => e);
      expect(error).toBeUndefined();
    });
  });
  it('does not abort batched requests when one request signal is aborted', async () => {
    const abortController1 = new AbortController();
    const abortController2 = new AbortController();

    const promise1 = batchExec({
      document: parse('{ field1 field2 }'),
      signal: abortController1.signal,
    });

    const promise2 = batchExec({
      document: parse('{ field2 field3(input: "3") }'),
      signal: abortController2.signal,
    });

    // Abort the first request
    abortController1.abort();

    const result1 = (await promise1) as ExecutionResult;

    expect(result1?.data).toEqual({ field1: '1', field2: '2' });

    const result2 = (await promise2) as ExecutionResult;

    expect(result2?.data).toEqual({ field2: '2', field3: '3' });
    expect(executorCalls).toEqual(1);
    expect(getRequestFields()).toEqual([
      'field1',
      'field2',
      'field2',
      'field3',
    ]);
  });

  it('aborts the batched request when all request signals are aborted', async () => {
    const abortController1 = new AbortController();
    const abortController2 = new AbortController();

    const promise1 = batchExec({
      document: parse('{ field1 field2 }'),
      signal: abortController1.signal,
    }).catch((e) => e);

    const promise2 = batchExec({
      document: parse('{ field2 field3(input: "3") }'),
      signal: abortController2.signal,
    }).catch((e) => e);

    // Abort both requests
    abortController1.abort();
    abortController2.abort();

    expect.assertions(2);

    const result = (await promise2) as Error;

    expect(result.message).toMatch(/operation was aborted/);

    const result2 = (await promise1) as Error;

    expect(result2.message).toMatch(/operation was aborted/);
  });
});
