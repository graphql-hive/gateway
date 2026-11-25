import { File, FormData } from '@whatwg-node/fetch';
import { describe, expect, it } from 'vitest';
import { createFormDataFromVariables } from '../src/createFormDataFromVariables.js';

const opts = { File, FormData };

function formMap(form: unknown) {
  expect(form).toBeInstanceOf(FormData);
  return JSON.parse((form as FormData).get('map') as string);
}

describe('createFormDataFromVariables', () => {
  it('sends JSON when no variable has a file', () => {
    const body = {
      query: '{ a }',
      variables: {
        representations: Array.from({ length: 50 }, (_, i) => ({
          __typename: 'User',
          id: String(i),
          tags: ['a', 'b'],
          nested: { deep: [{ n: i, ok: true, none: null }] },
        })),
        id: '1',
      },
    };
    expect(createFormDataFromVariables(body, opts)).toBe(JSON.stringify(body));
  });

  it('finds files nested in lists and plain objects', async () => {
    const file = new File(['x'], 'a.txt');
    const form = await createFormDataFromVariables(
      {
        query: 'mutation($input: Input) { upload(input: $input) }',
        variables: {
          input: { name: 'n', files: [{ file }, { file: null }] },
        },
      },
      opts,
    );
    expect(formMap(form)).toEqual({ 0: ['variables.input.files.0.file'] });
  });

  it('finds a file nested deeper than it checks on its own', async () => {
    const file = new File(['x'], 'a.txt');
    let input: Record<string, unknown> = { file };
    for (let i = 0; i < 100; i++) {
      input = { input };
    }
    const form = await createFormDataFromVariables(
      { query: 'mutation($input: Input) { upload(input: $input) }', variables: { input } },
      opts,
    );
    expect(formMap(form)[0][0]).toMatch(/^variables(\.input){101}\.file$/);
  });

  it('takes a promise for an upload', async () => {
    const form = await createFormDataFromVariables(
      {
        query: 'mutation($file: Upload) { upload(file: $file) }',
        variables: { file: Promise.resolve(new File(['x'], 'a.txt')) },
      },
      opts,
    );
    expect(formMap(form)).toEqual({ 0: ['variables.file'] });
  });

  it('does not look into class instances, like extract-files', () => {
    class Holder {
      file = new File(['x'], 'a.txt');
    }
    const body = { query: '{ a }', variables: { holder: new Holder() } };
    expect(createFormDataFromVariables(body, opts)).toBe(JSON.stringify(body));
  });
});
