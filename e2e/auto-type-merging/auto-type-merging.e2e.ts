import { createTenv, type Container } from '@internal/e2e';
import { beforeAll, expect, it } from 'vitest';

const { service, gateway, container } = createTenv(__dirname);

let petstore!: Container;
beforeAll(async () => {
  petstore = await container({
    name: 'petstore',
    image: 'swaggerapi/petstore3:1.0.7',
    containerPort: 8080,
    healthcheck: ['CMD-SHELL', 'wget --spider http://localhost:8080'],
  });
});

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [petstore, await service('vaccination')],
    },
  });
  await expect(
    execute({
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
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "getPetById": {
          "__typename": "Pet",
          "id": 1,
          "name": "Cat 1",
          "vaccinated": false,
        },
      },
    }
  `);
});
