import { createTenv } from '@internal/e2e';
import { fetch, File, FormData } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should upload file', async () => {
  const { port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('bucket')],
    },
  });

  const form = new FormData();
  form.append(
    'operations',
    JSON.stringify({
      query: /* GraphQL */ `
        mutation ($file: Upload!) {
          readFile(file: $file)
        }
      `,
      variables: {
        file: null, // in form data
      },
    }),
  );
  form.append('map', JSON.stringify({ 0: ['variables.file'] }));
  form.append(
    '0',
    new File(['Hello World!'], 'hello.txt', { type: 'text/plain' }),
  );
  const res = await fetch(`http://0.0.0.0:${port}/graphql`, {
    method: 'POST',
    body: form,
  });

  await expect(res.json()).resolves.toMatchInlineSnapshot(`
{
  "data": {
    "readFile": "Hello World!",
  },
}
`);
});
