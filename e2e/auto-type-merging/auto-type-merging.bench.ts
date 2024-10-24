import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { gateway, compose, service, container } = createTenv(__dirname);

let gw!: Gateway;
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

  gw = await gateway({ supergraph: output });
});

bench('GetPet', async () => {
  await expect(
    gw.execute({
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
