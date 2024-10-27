import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { composeWithMesh, gateway, service, fs } = createTenv(__dirname);

it('should execute', async () => {
  const { output } = await composeWithMesh({
    output: 'graphql',
    services: [await service('weather')],
  });

  // expect correct compose
  const supergraph = await fs.read(output);
  expect(supergraph).toContain('Test_Weather');
  expect(supergraph).toContain('chanceOfRain');

  const { execute } = await gateway({ supergraph: output });
  await expect(
    execute({
      query: /* GraphQL */ `
        {
          here {
            chanceOfRain
          }
        }
      `,
    }),
  ).resolves.toEqual({ data: { here: { chanceOfRain: 1 } } });
});
