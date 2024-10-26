import { createTenv } from '@internal/e2e';

const { composeWithMesh: compose, service, serve } = createTenv(__dirname);

it('should compose the appropriate schema', async () => {
  const { result } = await compose({
    services: [await service('calculator')],
    maskServicePorts: true,
  });
  expect(result).toMatchSnapshot();
});

it.concurrent.each([
  {
    name: 'Add',
    query: /* GraphQL */ `
      query Add {
        add(request: { left: 2, right: 3 })
      }
    `,
  },
])('should execute $name', async ({ query }) => {
  const { output } = await compose({
    services: [await service('calculator')],
    output: 'graphql',
  });

  const { execute } = await serve({ supergraph: output });
  await expect(execute({ query })).resolves.toMatchSnapshot();
});
