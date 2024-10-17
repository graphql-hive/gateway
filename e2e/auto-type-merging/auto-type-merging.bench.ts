import { createTenv, Serve } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { serve, compose, service, container } = createTenv(__dirname);

let server!: Serve;
beforeAll(async () => {
  const petstore = await container({
    name: 'petstore',
    image: 'swaggerapi/petstore3:1.0.7',
    containerPort: 8080,
    healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:8080'],
  });

  const { output } = await compose({
    services: [petstore, await service('vaccination')],
    output: 'graphql',
  });

  server = await serve({ supergraph: output });
});

bench('GetPet', async () => {
  await expect(
    server.execute({
      query: /* GraphQL */ `
        query GetPet {
          getPetById(petId: 1) {
            __typename
            id
            name
            vaccinated
          }
        }
      `,
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      data: {
        getPetById: {
          __typename: expect.anything(),
          id: expect.anything(),
          name: expect.anything(),
          vaccinated: expect.anything(),
        },
      },
    }),
  );
});
